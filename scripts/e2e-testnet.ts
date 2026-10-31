/**
 * Live end-to-end rehearsal of the full CoindeccFlow flow on a TESTNET.
 *
 * Uses the same helpers the CoindeccPay integration exposes (src/lib/integration.ts),
 * so it exercises the real ABI, the real deployed contract and the real USDC token.
 * It never runs on mainnet: it refuses any chain that is not a testnet.
 *
 *   bun run e2e:testnet init   create throwaway test wallets in .e2e/ (gitignored), print addresses only
 *   bun run e2e:testnet run    run the flow and write docs/e2e-testnet-run.json
 *
 * Fund the payer address with test USDC (Arc Studio "Get test USDC", or the Circle faucet) before `run`.
 * Wallet keys stay in .e2e/wallets.json and are never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { escrowAbi } from '../src/abi/escrow'
import {
  FLOW_ADDRESS,
  FLOW_CHAIN,
  FLOW_CHAIN_ID,
  USDC_ADDRESS,
  AgreementStatus,
  txUrl,
  usd,
} from '../src/lib/flow'
import {
  approvePaymentMilestone,
  createPaymentAgreement,
  fundPaymentAgreement,
  getPaymentAgreement,
  releasePaymentMilestone,
  type FlowClients,
} from '../src/lib/integration'
import { parseAmount } from '../src/onchain-money'

const WALLET_FILE = '.e2e/wallets.json'
const OUTPUT_FILE = 'docs/e2e-testnet-run.json'

interface Wallets {
  payerKey: Hex
  recipientKey: Hex
}

function resolveRpc(): string {
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map((c) => c.trim())
  const base = process.env.RPC_PROXY_BASE_URL
  if (base && proxyChains.includes('Arc_Testnet') && FLOW_CHAIN_ID === 5042002) {
    return `${base}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN ?? ''}`
  }
  return FLOW_CHAIN.rpcUrls[0]
}

function loadWallets(): Wallets {
  if (!existsSync(WALLET_FILE)) {
    mkdirSync('.e2e', { recursive: true })
    const wallets: Wallets = { payerKey: generatePrivateKey(), recipientKey: generatePrivateKey() }
    writeFileSync(WALLET_FILE, JSON.stringify(wallets), { mode: 0o600 })
  }
  return JSON.parse(readFileSync(WALLET_FILE, 'utf8')) as Wallets
}

async function revertName(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'DID_NOT_REVERT'
  } catch (error) {
    if (error instanceof BaseError) {
      const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
      if (reverted instanceof ContractFunctionRevertedError) return reverted.data?.errorName ?? reverted.shortMessage
    }
    return `ERROR: ${(error as Error).message.slice(0, 120)}`
  }
}

async function main() {
  const mode = process.argv[2] ?? 'run'
  if (!FLOW_CHAIN.isTestnet) throw new Error(`Refusing to run: ${FLOW_CHAIN.name} is not a testnet.`)
  if (FLOW_CHAIN_ID !== arcTestnet.id) throw new Error('This rehearsal is wired for Arc Testnet only.')
  if (!FLOW_ADDRESS) throw new Error('VITE_FLOW_ESCROW_ADDRESS is not set')

  const escrow: Address = FLOW_ADDRESS
  const wallets = loadWallets()
  const payer = privateKeyToAccount(wallets.payerKey)
  const recipient = privateKeyToAccount(wallets.recipientKey)

  if (mode === 'init') {
    console.log(JSON.stringify({ payer: payer.address, recipient: recipient.address, chain: FLOW_CHAIN.name }, null, 2))
    return
  }

  const transport = http(resolveRpc())
  const publicClient = createPublicClient({ transport }) as PublicClient
  const payerClients: FlowClients = {
    publicClient,
    walletClient: createWalletClient({ account: payer, chain: arcTestnet, transport }),
  }
  const recipientClients: FlowClients = {
    publicClient,
    walletClient: createWalletClient({ account: recipient, chain: arcTestnet, transport }),
  }
  const balanceOf = (who: Address) =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [who] })

  const steps: Array<{ step: string; hash: Hash }> = []
  const checks: Array<{ check: string; expected: string; observed: string; pass: boolean }> = []
  const expectEq = (check: string, expected: string, observed: string) => {
    checks.push({ check, expected, observed, pass: expected === observed })
    console.log(`${expected === observed ? 'PASS' : 'FAIL'}  ${check}: expected ${expected}, observed ${observed}`)
  }
  const simulate = (
    who: Address,
    functionName: 'fundAgreement' | 'approveMilestone' | 'releaseMilestone' | 'cancelAgreement',
    args: readonly bigint[],
  ) =>
    revertName(
      publicClient.simulateContract({
        address: escrow,
        abi: escrowAbi,
        functionName,
        args: args as never,
        account: who,
      }),
    )

  const startBlock = await publicClient.getBlockNumber()
  const payerStart = await balanceOf(payer.address)
  console.log(`Chain ${FLOW_CHAIN.name} (${FLOW_CHAIN_ID}) block ${startBlock}`)
  console.log(`Payer ${payer.address} USDC ${usd(payerStart)}`)
  const needed = parseAmount(FLOW_CHAIN_ID, '0.30').raw
  if (payerStart < needed) {
    throw new Error(`Payer needs at least 0.30 USDC (has ${usd(payerStart)}). Fund ${payer.address} and run again.`)
  }

  // 1. Create a two-milestone agreement (0.10 + 0.10).
  const created = await createPaymentAgreement(payerClients, {
    recipient: recipient.address,
    title: 'CoindeccFlow E2E rehearsal',
    milestones: [
      { title: 'Milestone 1', description: 'First deliverable', amountUsdc: '0.10' },
      { title: 'Milestone 2', description: 'Final deliverable', amountUsdc: '0.10' },
    ],
  })
  const id = created.agreementId
  steps.push({ step: 'createAgreement', hash: created.hash })
  let agreement = await getPaymentAgreement(publicClient, id)
  expectEq('created: status', String(AgreementStatus.Created), String(agreement.status))
  expectEq('created: total (6-dec units)', '200000', agreement.totalAmount.toString())

  // 2. Rules before funding.
  expectEq('unfunded: approve reverts', 'InvalidAgreementStatus', await simulate(payer.address, 'approveMilestone', [id, 0n]))
  expectEq('unfunded: release reverts', 'InvalidAgreementStatus', await simulate(payer.address, 'releaseMilestone', [id, 0n]))
  expectEq('non-payer fund reverts', 'OnlyPayer', await simulate(recipient.address, 'fundAgreement', [id]))

  // 3. Exact-amount approval, then fund.
  const recipientBefore = await balanceOf(recipient.address)
  const fundHashes = await fundPaymentAgreement(payerClients, id)
  steps.push(...fundHashes.map((hash, i) => ({ step: i === fundHashes.length - 1 ? 'fundAgreement' : 'usdc.approve(exact)', hash })))
  const allowanceAfter = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [payer.address, escrow],
  })
  expectEq('exact approval fully consumed (allowance 0)', '0', allowanceAfter.toString())
  agreement = await getPaymentAgreement(publicClient, id)
  expectEq('funded: status', String(AgreementStatus.Funded), String(agreement.status))
  expectEq('funded: remaining', '200000', agreement.remaining.toString())
  expectEq('funded: escrow holds funds', '200000', (await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreementBalance', args: [id] })).toString())
  expectEq('double fund reverts', 'InvalidAgreementStatus', await simulate(payer.address, 'fundAgreement', [id]))

  // 4. Permissions before approval.
  expectEq('recipient cannot approve', 'OnlyPayer', await simulate(recipient.address, 'approveMilestone', [id, 0n]))
  expectEq('release before approval reverts', 'MilestoneNotApproved', await simulate(payer.address, 'releaseMilestone', [id, 0n]))

  // 5. Approve and release milestone 1 (payer releases).
  steps.push({ step: 'approveMilestone(0)', hash: await approvePaymentMilestone(payerClients, id, 0) })
  steps.push({ step: 'releaseMilestone(0) by payer', hash: await releasePaymentMilestone(payerClients, id, 0) })
  const recipientAfter1 = await balanceOf(recipient.address)
  expectEq('recipient balance +0.10 USDC after milestone 1', '100000', (recipientAfter1 - recipientBefore).toString())
  agreement = await getPaymentAgreement(publicClient, id)
  expectEq('after M1: remaining', '100000', agreement.remaining.toString())
  expectEq('after M1: still Funded', String(AgreementStatus.Funded), String(agreement.status))
  expectEq('duplicate release reverts', 'MilestoneAlreadyReleased', await simulate(payer.address, 'releaseMilestone', [id, 0n]))

  // 6. Recipient needs a little USDC for gas to release milestone 2 themselves.
  const gasTopUp = await payerClients.walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient.address, parseAmount(FLOW_CHAIN_ID, '0.05').raw],
    account: payer,
    chain: arcTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: gasTopUp })
  steps.push({ step: 'usdc.transfer 0.05 to recipient (gas)', hash: gasTopUp })
  const recipientBeforeM2 = await balanceOf(recipient.address)

  steps.push({ step: 'approveMilestone(1)', hash: await approvePaymentMilestone(payerClients, id, 1) })
  steps.push({ step: 'releaseMilestone(1) by recipient', hash: await releasePaymentMilestone(recipientClients, id, 1) })
  const recipientEnd = await balanceOf(recipient.address)
  // The recipient also paid gas in USDC, so the net change is 0.10 minus gas.
  const gross = recipientEnd - recipientBeforeM2
  checks.push({
    check: 'recipient balance rose by 0.10 USDC minus gas after milestone 2',
    expected: '0 < gas <= 0.01 USDC',
    observed: `gas ${formatUnits(100000n - gross, 6)} USDC`,
    pass: gross < 100000n && 100000n - gross <= 10000n,
  })

  // 7. Completion.
  agreement = await getPaymentAgreement(publicClient, id)
  expectEq('completed: status', String(AgreementStatus.Completed), String(agreement.status))
  expectEq('completed: remaining', '0', agreement.remaining.toString())
  expectEq('completed: released', '200000', agreement.releasedAmount.toString())
  expectEq('release after completion reverts', 'InvalidAgreementStatus', await simulate(payer.address, 'releaseMilestone', [id, 1n]))

  // 8. Cancellation of an unfunded agreement.
  const second = await createPaymentAgreement(payerClients, {
    recipient: recipient.address,
    title: 'E2E cancel check',
    milestones: [{ title: 'Only milestone', amountUsdc: '0.01' }],
  })
  steps.push({ step: 'createAgreement (to cancel)', hash: second.hash })
  const cancelHash = await payerClients.walletClient.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: 'cancelAgreement',
    args: [second.agreementId],
    account: payer,
    chain: arcTestnet,
  })
  await publicClient.waitForTransactionReceipt({ hash: cancelHash })
  steps.push({ step: 'cancelAgreement', hash: cancelHash })
  expectEq('cancelled: fund reverts', 'InvalidAgreementStatus', await simulate(payer.address, 'fundAgreement', [second.agreementId]))

  // 9. Receipts, gas, and the events the Activity page reads.
  const receipts = await Promise.all(steps.map((s) => publicClient.getTransactionReceipt({ hash: s.hash })))
  const decimals = FLOW_CHAIN.nativeCurrency.decimals
  const txs = steps.map((s, i) => ({
    step: s.step,
    hash: s.hash,
    explorer: txUrl(s.hash),
    status: receipts[i].status,
    block: receipts[i].blockNumber.toString(),
    gasUsed: receipts[i].gasUsed.toString(),
    feeUsdc: formatUnits(receipts[i].gasUsed * receipts[i].effectiveGasPrice, decimals),
  }))
  expectEq('all transactions succeeded', 'true', String(txs.every((t) => t.status === 'success')))

  const events = await publicClient.getContractEvents({
    address: escrow,
    abi: escrowAbi,
    fromBlock: startBlock,
    strict: true,
  })
  const names = events.filter((e) => e.args.id === id).map((e) => e.eventName)
  expectEq(
    'agreement events (created, funded, approved x2, released x2, completed)',
    'AgreementCreated,AgreementFunded,MilestoneApproved,MilestoneReleased,MilestoneApproved,MilestoneReleased,AgreementCompleted',
    names.join(','),
  )

  const failed = checks.filter((c) => !c.pass)
  const report = {
    chain: FLOW_CHAIN.name,
    chainId: FLOW_CHAIN_ID,
    escrow: FLOW_ADDRESS,
    usdc: USDC_ADDRESS,
    payer: payer.address,
    recipient: recipient.address,
    agreementId: id.toString(),
    ranAt: new Date().toISOString(),
    transactions: txs,
    checks,
    passed: checks.length - failed.length,
    failed: failed.length,
  }
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\n${report.passed}/${checks.length} checks passed. Report: ${OUTPUT_FILE}`)
  for (const t of txs) console.log(`${t.step}\n  ${t.hash}\n  gas ${t.gasUsed}, fee ${t.feeUsdc} USDC`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
