import { getAddress, isAddress, type Address } from 'viem'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'
import { formatUnitsExact } from '@/onchain-money'

/** Chain CoindeccFlow runs on. Set VITE_FLOW_CHAIN_ID in .env. */
export const FLOW_CHAIN_ID: number = Number(import.meta.env.VITE_FLOW_CHAIN_ID ?? 5042002)
export const FLOW_CHAIN = requireChain(FLOW_CHAIN_ID)

const rawAddress = import.meta.env.VITE_FLOW_ESCROW_ADDRESS as string | undefined
/** Deployed CoindeccFlowEscrow address. Undefined until VITE_FLOW_ESCROW_ADDRESS is set. */
export const FLOW_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? getAddress(rawAddress) : undefined

/** Block the escrow was deployed at. Event scans start here, never at block 0. */
export const FLOW_DEPLOY_BLOCK: bigint | undefined = (() => {
  const raw = import.meta.env.VITE_FLOW_DEPLOY_BLOCK as string | undefined
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined
})()

const usdcFact = getUsdc(FLOW_CHAIN_ID)
if (!usdcFact) throw new Error(`USDC is not registered for chain ${FLOW_CHAIN_ID}`)
export const USDC_ADDRESS = getAddress(usdcFact.address)
export const USDC_DECIMALS_ONCHAIN = usdcFact.decimals

export const txUrl = (hash: string) => buildTxExplorerUrl(FLOW_CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(FLOW_CHAIN_ID, address)

export enum AgreementStatus {
  Created = 0,
  Funded = 1,
  Completed = 2,
  Cancelled = 3,
}

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  [AgreementStatus.Created]: 'Awaiting funding',
  [AgreementStatus.Funded]: 'Funded',
  [AgreementStatus.Completed]: 'Completed',
  [AgreementStatus.Cancelled]: 'Cancelled',
}

export interface Milestone {
  title: string
  description: string
  amount: bigint
  approved: boolean
  released: boolean
}

export interface Agreement {
  id: bigint
  payer: Address
  recipient: Address
  title: string
  totalAmount: bigint
  fundedAmount: bigint
  releasedAmount: bigint
  createdAt: number
  status: AgreementStatus
  milestoneCount: number
  releasedCount: number
}

export interface AgreementWithMilestones extends Agreement {
  milestones: Milestone[]
  /** Funded minus released, from the contract's isolated accounting. */
  remaining: bigint
}

/** Shape returned by the contract's getAgreement view. */
export interface RawAgreement {
  id: bigint
  payer: Address
  recipient: Address
  title: string
  totalAmount: bigint
  fundedAmount: bigint
  releasedAmount: bigint
  createdAt: bigint
  status: number
  milestoneCount: number
  releasedCount: number
}

export interface RawMilestone {
  title: string
  description: string
  amount: bigint
  approved: boolean
  released: boolean
}

export function toAgreement(raw: RawAgreement, milestones: readonly RawMilestone[]): AgreementWithMilestones {
  return {
    id: raw.id,
    payer: raw.payer,
    recipient: raw.recipient,
    title: raw.title,
    totalAmount: raw.totalAmount,
    fundedAmount: raw.fundedAmount,
    releasedAmount: raw.releasedAmount,
    createdAt: Number(raw.createdAt),
    status: raw.status,
    milestoneCount: raw.milestoneCount,
    releasedCount: raw.releasedCount,
    milestones: milestones.map((m) => ({
      title: m.title,
      description: m.description,
      amount: m.amount,
      approved: m.approved,
      released: m.released,
    })),
    remaining: raw.fundedAmount - raw.releasedAmount,
  }
}

/** USDC with thousands separators and at least two decimals, using the token's own decimals. */
export function usd(raw: bigint): string {
  const exact = formatUnitsExact(raw, USDC_DECIMALS_ONCHAIN)
  const [whole, fraction = ''] = exact.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${grouped}.${fraction.padEnd(2, '0')}`
}

export const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Turns an RPC or contract-read failure into the real reason, in plain words.
 * Used for visible error messages so a failure is never reported as just "something went wrong".
 */
export function describeReadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()
  if (message.includes('rate limit') || message.includes('limit exceeded') || message.includes('429') || message.includes('too many requests')) {
    return 'the public Arc RPC is rate limiting requests'
  }
  if (message.includes('range too large') || message.includes('-32012')) return 'the RPC refused a log range that was too large'
  if (message.includes('failed to fetch') || message.includes('load failed') || message.includes('networkerror') || message.includes('network request failed')) {
    return 'the browser could not reach the Arc RPC'
  }
  if (message.includes('timeout') || message.includes('timed out')) return 'the Arc RPC timed out'
  if (message.includes('returned no data')) return 'the escrow contract did not answer; check the contract address and network'
  const firstLine = raw.split('\n')[0]
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine
}
