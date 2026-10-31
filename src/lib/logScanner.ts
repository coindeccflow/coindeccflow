import type { Address, Hash, PublicClient } from 'viem'
import { escrowAbi } from '@/abi/escrow'

export type FlowEventName =
  | 'AgreementCreated'
  | 'AgreementFunded'
  | 'MilestoneApproved'
  | 'MilestoneReleased'
  | 'AgreementCompleted'
  | 'AgreementCancelled'

export interface FlowLog {
  key: string
  event: FlowEventName
  id: bigint
  index?: bigint
  /** Payer for created/funded/approved/cancelled. */
  actor?: Address
  recipient?: Address
  amount?: bigint
  title?: string
  txHash: Hash
  blockNumber: bigint
  logIndex: number
}

/**
 * Largest block range requested per eth_getLogs call. Measured against the public Arc Testnet RPC:
 * 10,000 blocks succeeds and 20,000 is refused ("requested range too large"). The scanner halves
 * this automatically if an endpoint refuses it.
 */
export const DEFAULT_CHUNK = 10_000n
export const MIN_CHUNK = 500n
const MAX_RETRIES = 4

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).toLowerCase()

export const isRateLimited = (error: unknown) => {
  const m = messageOf(error)
  return m.includes('rate limit') || m.includes('limit exceeded') || m.includes('too many requests') || m.includes('429')
}
export const isRangeTooLarge = (error: unknown) => {
  const m = messageOf(error)
  return m.includes('range too large') || m.includes('-32012') || m.includes('block range') || m.includes('exceeds max')
}
/** Arc's load-balanced RPC can answer -32014 when a backend has not imported the newest block yet. */
export const isBlockNotImported = (error: unknown) => {
  const m = messageOf(error)
  return m.includes('-32014') || m.includes('not yet imported')
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Retries transient RPC conditions (rate limit, block not imported yet) with exponential backoff. */
export async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= MAX_RETRIES || !(isRateLimited(error) || isBlockNotImported(error))) throw error
      await sleep(600 * 2 ** attempt)
    }
  }
}

async function readRange(client: PublicClient, address: Address, from: bigint, to: bigint): Promise<FlowLog[]> {
  const events = await client.getContractEvents({ address, abi: escrowAbi, fromBlock: from, toBlock: to, strict: true })
  const out: FlowLog[] = []
  for (const log of events) {
    if (log.blockNumber == null || log.logIndex == null || log.transactionHash == null) continue
    const base = {
      key: `${log.transactionHash}:${log.logIndex}`,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    }
    switch (log.eventName) {
      case 'AgreementCreated':
        out.push({ ...base, event: 'AgreementCreated', id: log.args.id, actor: log.args.payer, recipient: log.args.recipient, amount: log.args.totalAmount, title: log.args.title })
        break
      case 'AgreementFunded':
        out.push({ ...base, event: 'AgreementFunded', id: log.args.id, actor: log.args.payer, amount: log.args.amount })
        break
      case 'MilestoneApproved':
        out.push({ ...base, event: 'MilestoneApproved', id: log.args.id, index: log.args.index, actor: log.args.payer })
        break
      case 'MilestoneReleased':
        out.push({ ...base, event: 'MilestoneReleased', id: log.args.id, index: log.args.index, recipient: log.args.recipient, amount: log.args.amount })
        break
      case 'AgreementCompleted':
        out.push({ ...base, event: 'AgreementCompleted', id: log.args.id, amount: log.args.totalAmount })
        break
      case 'AgreementCancelled':
        out.push({ ...base, event: 'AgreementCancelled', id: log.args.id, actor: log.args.payer })
        break
    }
  }
  return out
}

/**
 * Reads escrow events from `from` to `to` in bounded ranges, one request at a time.
 * - Rate limits and "block not imported" are retried with backoff and never shrink the range.
 * - Only a "range too large" answer halves the range.
 * `onChunk` is called after each range so callers can show progress and remember how far they got.
 */
export async function scanLogs(
  client: PublicClient,
  address: Address,
  from: bigint,
  to: bigint,
  options: { chunk?: bigint; onChunk?: (logs: FlowLog[], scannedTo: bigint, chunk: bigint) => void } = {},
): Promise<{ chunk: bigint; requests: number }> {
  let chunk = options.chunk ?? DEFAULT_CHUNK
  let next = from
  let requests = 0
  while (next <= to) {
    const end = next + chunk - 1n > to ? to : next + chunk - 1n
    try {
      requests += 1
      const logs = await withBackoff(() => readRange(client, address, next, end))
      options.onChunk?.(logs, end, chunk)
      next = end + 1n
    } catch (error) {
      if (isRangeTooLarge(error) && chunk > MIN_CHUNK) {
        chunk = chunk / 2n > MIN_CHUNK ? chunk / 2n : MIN_CHUNK
        continue
      }
      throw error
    }
  }
  return { chunk, requests }
}
