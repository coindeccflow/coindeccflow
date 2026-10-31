import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useWriteContract } from 'wagmi'
import type { Hash, TransactionReceipt } from 'viem'
import type { TxErrorInfo } from '@/lib/txErrors'
import { txTracker } from '@/lib/txTracker'
import { type TxPhase as LifecyclePhase, type TxRecord } from '@/lib/txLifecycle'

/** Coarse phases the buttons and inline status lines use. `lifecycle` carries the full state. */
export type TxPhase = 'idle' | 'pending' | 'confirming' | 'confirmed' | 'failed'

export interface TxState {
  phase: TxPhase
  /** Full lifecycle state: preparing, awaiting_wallet, submitted, confirming, success, failed, user_rejected, wallet_unresponsive, status_unknown. */
  lifecycle: LifecyclePhase
  hash: Hash | undefined
  message: string | null
  /** Classified failure with the real error detail. Null unless the attempt failed. */
  info: TxErrorInfo | null
  /** A wallet request or an unconfirmed transaction exists. A second identical action is refused. */
  busy: boolean
  /** 15 s or more without an answer from the wallet. The request may still be open there. */
  walletSlow: boolean
  /** Why a click was refused, or a reminder that an abandoned request may still appear in the wallet. */
  notice: string | null
  reset: () => void
}

const FINISHED: ReadonlySet<LifecyclePhase> = new Set(['success', 'failed', 'user_rejected'])
const WAITING_FOR_WALLET: ReadonlySet<LifecyclePhase> = new Set(['preparing', 'awaiting_wallet', 'wallet_unresponsive'])

function uiPhase(record: TxRecord | undefined): TxPhase {
  if (!record) return 'idle'
  if (FINISHED.has(record.phase) && record.dismissed) return 'idle'
  // The user stopped waiting: the action is available again, while a late answer is still tracked.
  if (record.abandoned && WAITING_FOR_WALLET.has(record.phase)) return 'idle'
  switch (record.phase) {
    case 'preparing':
    case 'awaiting_wallet':
    case 'wallet_unresponsive':
      return 'pending'
    case 'submitted':
    case 'confirming':
    case 'status_unknown':
      return 'confirming'
    case 'success':
      return 'confirmed'
    default:
      return 'failed'
  }
}

export interface FlowTxOptions {
  /** Identifies the action, for example `fund:3`. Two unresolved attempts with one key are refused. */
  key: string
  /** Human label shown in the waiting card and tray. */
  label: string
  /** Where the tray links once the transaction confirms. */
  href?: string | ((receipt: TransactionReceipt) => string | undefined)
}

/**
 * One wallet transaction, tracked outside React so it survives navigation and reloads.
 * `write` starts the wallet request; the tracker owns the waiting, submitted, confirming and
 * finished states and refuses duplicates. `onConfirmed` runs only while the component is mounted.
 */
export function useFlowTx(onConfirmed: ((receipt: TransactionReceipt) => void) | undefined, options: FlowTxOptions) {
  const { key, label, href } = options
  const { writeContractAsync } = useWriteContract()
  const record = useSyncExternalStore(txTracker.subscribe, () => txTracker.getLatest(key))
  const [blocked, setBlocked] = useState<string | null>(null)

  useEffect(() => txTracker.attach(key), [key])

  const callback = useRef(onConfirmed)
  useEffect(() => {
    callback.current = onConfirmed
  })
  const firedFor = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (record?.phase === 'success' && record.receipt && !record.seen && firedFor.current !== record.id) {
      firedFor.current = record.id
      callback.current?.(record.receipt)
    }
  }, [record])

  const write = useCallback(
    (params: Parameters<typeof writeContractAsync>[0]): Promise<Hash | undefined> => {
      const started = txTracker.begin({ key, label, href, send: () => writeContractAsync(params) })
      if (!started.ok) {
        setBlocked(started.message)
        return Promise.resolve(undefined)
      }
      setBlocked(null)
      return started.result
    },
    [key, label, href, writeContractAsync],
  )

  const reset = useCallback(() => {
    txTracker.reset(key)
    setBlocked(null)
  }, [key])

  const phase = uiPhase(record)
  const abandonedNotice =
    record?.abandoned && WAITING_FOR_WALLET.has(record.phase)
      ? 'You stopped waiting for an earlier wallet request. If it still appears in your wallet, reject it there, or it may be sent.'
      : null

  const tx: TxState = {
    phase,
    lifecycle: record?.phase ?? 'idle',
    hash: record?.hash,
    message: phase === 'failed' ? (record?.info?.message ?? null) : null,
    info: phase === 'failed' ? (record?.info ?? null) : null,
    busy: phase === 'pending' || phase === 'confirming',
    walletSlow: Boolean(record?.walletSlow) && phase === 'pending',
    notice: blocked ?? abandonedNotice,
    reset,
  }

  return { write, tx }
}
