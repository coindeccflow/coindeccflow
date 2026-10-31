/**
 * CoindeccPay integration layer.
 *
 * Framework-free helpers (plain viem clients, no React) so CoindeccPay can call
 * CoindeccFlow from its own app. They never touch CoindeccPay contracts.
 */
import {
  erc20Abi,
  type Account,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem'
import { escrowAbi } from '@/abi/escrow'
import { parseAmount } from '@/onchain-money'
import { FLOW_ADDRESS, FLOW_CHAIN_ID, USDC_ADDRESS, toAgreement, type AgreementWithMilestones } from '@/lib/flow'

export interface FlowClients {
  publicClient: PublicClient
  walletClient: WalletClient
  /** Override the escrow address. Defaults to VITE_FLOW_ESCROW_ADDRESS. */
  escrowAddress?: Address
}

export interface PaymentMilestoneInput {
  title: string
  description?: string
  /** Decimal USDC string, for example "0.10". */
  amountUsdc: string
}

export interface CreatePaymentAgreementInput {
  recipient: Address
  title: string
  milestones: PaymentMilestoneInput[]
}

function escrowOf(clients: FlowClients): Address {
  const address = clients.escrowAddress ?? FLOW_ADDRESS
  if (!address) throw new Error('CoindeccFlow escrow address is not configured')
  return address
}

/** The wallet client's account object, so local (private key) accounts sign locally and JSON-RPC accounts use the wallet. */
function accountOf(clients: FlowClients): Account {
  const account = clients.walletClient.account
  if (!account) throw new Error('Wallet client has no connected account')
  return account
}

async function confirmed(clients: FlowClients, hash: Hash): Promise<TransactionReceipt> {
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`)
  return receipt
}

/** Creates an agreement. The connected wallet becomes the payer. */
export async function createPaymentAgreement(
  clients: FlowClients,
  input: CreatePaymentAgreementInput,
): Promise<{ hash: Hash; agreementId: bigint }> {
  const escrow = escrowOf(clients)
  const hash = await clients.walletClient.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'createAgreement',
    args: [
      input.recipient,
      input.title,
      input.milestones.map((m) => m.title),
      input.milestones.map((m) => m.description ?? ''),
      input.milestones.map((m) => parseAmount(FLOW_CHAIN_ID, m.amountUsdc).raw),
    ],
    account: accountOf(clients),
    chain: clients.walletClient.chain,
  })
  const receipt = await confirmed(clients, hash)
  const [created] = parseEventLogs({ abi: escrowAbi, eventName: 'AgreementCreated', logs: receipt.logs })
  if (!created) throw new Error('AgreementCreated event not found in receipt')
  return { hash, agreementId: created.args.id }
}

/**
 * Funds an agreement: approves the exact USDC amount if the allowance is short,
 * then funds. Returns every transaction hash it sent, each confirmed onchain.
 */
export async function fundPaymentAgreement(clients: FlowClients, agreementId: bigint): Promise<Hash[]> {
  const escrow = escrowOf(clients)
  const account = accountOf(clients)
  const agreement = await clients.publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'getAgreement',
    args: [agreementId],
  })
  const allowance = await clients.publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, escrow],
  })
  const hashes: Hash[] = []
  if (allowance < agreement.totalAmount) {
    const approveHash = await clients.walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [escrow, agreement.totalAmount],
      account,
      chain: clients.walletClient.chain,
    })
    await confirmed(clients, approveHash)
    hashes.push(approveHash)
  }
  const fundHash = await clients.walletClient.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'fundAgreement',
    args: [agreementId],
    account,
    chain: clients.walletClient.chain,
  })
  await confirmed(clients, fundHash)
  hashes.push(fundHash)
  return hashes
}

async function send(
  clients: FlowClients,
  functionName: 'approveMilestone' | 'releaseMilestone',
  agreementId: bigint,
  milestoneIndex: number,
): Promise<Hash> {
  const hash = await clients.walletClient.writeContract({
    address: escrowOf(clients),
    abi: escrowAbi,
    functionName,
    args: [agreementId, BigInt(milestoneIndex)],
    account: accountOf(clients),
    chain: clients.walletClient.chain,
  })
  await confirmed(clients, hash)
  return hash
}

/** Payer approves a milestone. Resolves after onchain confirmation. */
export const approvePaymentMilestone = (clients: FlowClients, agreementId: bigint, milestoneIndex: number) =>
  send(clients, 'approveMilestone', agreementId, milestoneIndex)

/** Payer or recipient releases an approved milestone to the recipient. */
export const releasePaymentMilestone = (clients: FlowClients, agreementId: bigint, milestoneIndex: number) =>
  send(clients, 'releaseMilestone', agreementId, milestoneIndex)

/** Reads an agreement with its milestones and remaining escrow balance. */
export async function getPaymentAgreement(
  publicClient: PublicClient,
  agreementId: bigint,
  escrowAddress: Address | undefined = FLOW_ADDRESS,
): Promise<AgreementWithMilestones> {
  if (!escrowAddress) throw new Error('CoindeccFlow escrow address is not configured')
  const [agreement, milestones] = await Promise.all([
    publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'getAgreement', args: [agreementId] }),
    publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'getMilestones', args: [agreementId] }),
  ])
  return toAgreement(agreement, milestones)
}
