import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { FLOW_REFRESH_EVENT } from '@/lib/refresh'
import { FLOW_ADDRESS, FLOW_CHAIN_ID, FLOW_DEPLOY_BLOCK, describeReadError } from '@/lib/flow'
import { DEFAULT_CHUNK, scanLogs, withBackoff, type FlowLog } from '@/lib/logScanner'

export type { FlowEventName, FlowLog } from '@/lib/logScanner'

interface ScanState {
  logs: Map<string, FlowLog>
  scannedTo: bigint | null
  head: bigint | null
}

const FALLBACK_LOOKBACK = 5000n
const POLL_MS = 12000
const STORAGE_KEY = `coindeccflow:logs:v1:${FLOW_CHAIN_ID}:${FLOW_ADDRESS?.toLowerCase() ?? 'none'}`

const state: ScanState = { logs: new Map(), scannedTo: null, head: null }
let inflight: Promise<void> | null = null
let chunkSize = DEFAULT_CHUNK

// bigint values are stored as { $big: "123" } so no text field can be mistaken for a number.
const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? { $big: value.toString() } : value)
const reviver = (_key: string, value: unknown) =>
  value && typeof value === 'object' && '$big' in value ? BigInt((value as { $big: string }).$big) : value

/** Events already read are cached in this browser, so a reload only scans the blocks added since. */
function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw, reviver) as { scannedTo: bigint; logs: FlowLog[] }
    if (typeof saved.scannedTo !== 'bigint' || !Array.isArray(saved.logs)) return
    if (FLOW_DEPLOY_BLOCK != null && saved.scannedTo < FLOW_DEPLOY_BLOCK) return
    state.logs = new Map(saved.logs.map((log) => [log.key, log]))
    state.scannedTo = saved.scannedTo
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scannedTo: state.scannedTo, logs: [...state.logs.values()] }, replacer))
  } catch {
    // Storage may be full or unavailable. Scanning still works without the cache.
  }
}

restore()

type Client = NonNullable<ReturnType<typeof usePublicClient>>

async function sync(client: Client): Promise<void> {
  if (!FLOW_ADDRESS) return
  const head = await withBackoff(() => client.getBlockNumber())
  state.head = head
  if (state.scannedTo != null && state.scannedTo > head) {
    // The chain is behind the cache (for example a different network). Start over.
    state.logs = new Map()
    state.scannedTo = null
  }
  const start =
    state.scannedTo != null
      ? state.scannedTo + 1n
      : (FLOW_DEPLOY_BLOCK ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n))
  if (start > head) return

  const result = await scanLogs(client, FLOW_ADDRESS, start, head, {
    chunk: chunkSize,
    onChunk: (logs, scannedTo) => {
      for (const log of logs) state.logs.set(log.key, log)
      state.scannedTo = scannedTo
      persist()
    },
  })
  chunkSize = result.chunk
}

function runSync(client: Client): Promise<void> {
  inflight ??= sync(client).finally(() => {
    inflight = null
  })
  return inflight
}

export function useFlowLogs() {
  const client = usePublicClient({ chainId: FLOW_CHAIN_ID })
  const [, setTick] = useState(0)
  const [syncing, setSyncing] = useState(Boolean(FLOW_ADDRESS))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client || !FLOW_ADDRESS) return
    let cancelled = false
    const run = async () => {
      if (document.hidden && state.scannedTo != null) return // no polling while the tab is in the background
      try {
        await runSync(client)
        if (!cancelled) setError(null)
      } catch (cause) {
        if (!cancelled) setError(`Could not read onchain activity (${describeReadError(cause)}). Retrying.`)
      } finally {
        if (!cancelled) {
          setSyncing(false)
          setTick((n) => n + 1)
        }
      }
    }
    void run()
    const timer = window.setInterval(() => void run(), POLL_MS)
    const onRefresh = () => void run()
    window.addEventListener(FLOW_REFRESH_EVENT, onRefresh)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(FLOW_REFRESH_EVENT, onRefresh)
    }
  }, [client])

  const logs = [...state.logs.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1,
  )

  return { logs, scannedTo: state.scannedTo, head: state.head, syncing, error }
}

const TIMES_KEY = `coindeccflow:blocktimes:v1:${FLOW_CHAIN_ID}`
const blockTimes = new Map<bigint, number>()
try {
  const saved = JSON.parse(localStorage.getItem(TIMES_KEY) ?? '{}') as Record<string, number>
  for (const [block, seconds] of Object.entries(saved)) blockTimes.set(BigInt(block), seconds)
} catch {
  // A corrupt cache is ignored and rebuilt.
}
const saveTimes = () => {
  try {
    const recent = [...blockTimes.entries()].sort((a, b) => (a[0] > b[0] ? -1 : 1)).slice(0, 500)
    localStorage.setItem(TIMES_KEY, JSON.stringify(Object.fromEntries(recent.map(([b, t]) => [b.toString(), t]))))
  } catch {
    // Storage unavailable. Timestamps are re-fetched next time.
  }
}
const TIME_BATCH = 3

/** Block timestamps (seconds) for the given blocks. Each block is fetched once, a few at a time, then cached. */
export function useBlockTimes(blocks: readonly bigint[]) {
  const client = usePublicClient({ chainId: FLOW_CHAIN_ID })
  const [, setTick] = useState(0)
  const keys = [...new Set(blocks.map(String))].join(',')

  useEffect(() => {
    if (!client) return
    let cancelled = false
    const missing = [...new Set(keys ? keys.split(',') : [])].map((b) => BigInt(b)).filter((b) => !blockTimes.has(b))
    if (missing.length === 0) return
    void (async () => {
      for (let i = 0; i < missing.length && !cancelled; i += TIME_BATCH) {
        await Promise.all(
          missing.slice(i, i + TIME_BATCH).map(async (blockNumber) => {
            try {
              const block = await withBackoff(() => client.getBlock({ blockNumber }))
              blockTimes.set(blockNumber, Number(block.timestamp))
            } catch {
              // Timestamp is cosmetic. The block number is still shown.
            }
          }),
        )
        if (!cancelled) setTick((n) => n + 1)
      }
      saveTimes()
    })()
    return () => {
      cancelled = true
    }
  }, [client, keys])

  return (block: bigint) => blockTimes.get(block)
}
