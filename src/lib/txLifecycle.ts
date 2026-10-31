/**
 * Wallet transaction lifecycle, independent of React so it can be tested and so tracking
 * survives navigation. One record per attempt. Timers here are frontend UX timers only:
 * they never cancel a wallet request and never resend a transaction.
 */
import type { Hash, TransactionReceipt } from 'viem'
import { classifyTxError, type TxErrorInfo } from '@/lib/txErrors'

export type TxPhase =
  | 'idle'
  | 'preparing'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  | 'success'
  | 'failed'
  | 'user_rejected'
  | 'wallet_unresponsive'
  | 'status_unknown'

export const TIMING = {
  /** After this long the waiting screen offers Dismiss. Nothing is cancelled. */
  dismissAfterMs: 5_000,
  walletSlowMs: 15_000,
  walletUnresponsiveMs: 30_000,
  confirmingMs: 15_000,
  statusUnknownMs: 90_000,
  pollMs: 2_000,
  maxTrackMs: 15 * 60_000,
}

export type WaitStage = 'waiting' | 'dismissable' | 'slow' | 'unresponsive'

/** What the waiting screen shows after `elapsedMs` without an answer from the wallet. Display only. */
export function waitStage(elapsedMs: number): WaitStage {
  if (elapsedMs >= TIMING.walletUnresponsiveMs) return 'unresponsive'
  if (elapsedMs >= TIMING.walletSlowMs) return 'slow'
  if (elapsedMs >= TIMING.dismissAfterMs) return 'dismissable'
  return 'waiting'
}

/** Phases in which an attempt is still unresolved, so a second attempt for the same action is refused. */
export const ACTIVE_PHASES: ReadonlySet<TxPhase> = new Set([
  'preparing',
  'awaiting_wallet',
  'wallet_unresponsive',
  'submitted',
  'confirming',
  'status_unknown',
])

export interface TxRecord {
  id: number
  key: string
  label: string
  phase: TxPhase
  startedAt: number
  phaseAt: number
  hash?: Hash
  submittedAt?: number
  info?: TxErrorInfo
  receipt?: TransactionReceipt
  /** 15s without an answer from the wallet. Still awaiting_wallet. */
  walletSlow: boolean
  /** The user hid the waiting screen. The wallet request may still be open. */
  dismissed: boolean
  /** The user chose to stop waiting, releasing the single-request lock. A late answer is still tracked. */
  abandoned: boolean
  /** The user has acknowledged a finished attempt in the tray. */
  seen: boolean
  href?: string
}

export interface TrackerDeps {
  readReceipt: (hash: Hash) => Promise<TransactionReceipt | null>
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** Called whenever submitted-but-unfinished transactions change, so they can be resumed after a reload. */
  persist?: (items: Array<{ key: string; label: string; hash: Hash; startedAt: number; href?: string }>) => void
}

export interface BeginOptions {
  key: string
  label: string
  /** Starts the wallet request. Called synchronously so the click's user activation is kept. */
  send: () => Promise<Hash>
  href?: string | ((receipt: TransactionReceipt) => string | undefined)
}

export type BeginResult =
  | { ok: true; result: Promise<Hash | undefined> }
  | { ok: false; reason: 'busy' | 'duplicate'; message: string }

export type Tracker = ReturnType<typeof createTxTracker>

export function createTxTracker(deps: TrackerDeps) {
  const byId = new Map<number, TxRecord>()
  const latestByKey = new Map<string, number>()
  const hrefFns = new Map<number, (receipt: TransactionReceipt) => string | undefined>()
  const timers = new Map<number, unknown[]>()
  const mounts = new Map<string, number>()
  const listeners = new Set<() => void>()
  let lockId: number | null = null
  let nextId = 1
  let cachedList: TxRecord[] = []

  const emit = () => {
    cachedList = [...byId.values()].sort((a, b) => b.startedAt - a.startedAt)
    listeners.forEach((listener) => listener())
    deps.persist?.(
      cachedList
        .filter((r) => r.hash && ['submitted', 'confirming', 'status_unknown'].includes(r.phase))
        .map((r) => ({ key: r.key, label: r.label, hash: r.hash!, startedAt: r.startedAt, href: r.href })),
    )
  }

  const patch = (id: number, changes: Partial<TxRecord>) => {
    const current = byId.get(id)
    if (!current) return
    const phaseChanged = changes.phase !== undefined && changes.phase !== current.phase
    byId.set(id, { ...current, ...changes, phaseAt: phaseChanged ? deps.now() : current.phaseAt })
    emit()
  }

  const addTimer = (id: number, ms: number, fn: () => void) => {
    const handle = deps.setTimer(fn, ms)
    timers.set(id, [...(timers.get(id) ?? []), handle])
  }
  const clearTimers = (id: number) => {
    ;(timers.get(id) ?? []).forEach((handle) => deps.clearTimer(handle))
    timers.delete(id)
  }
  const unlock = (id: number) => {
    if (lockId === id) lockId = null
  }

  const phaseOf = (id: number) => byId.get(id)?.phase

  function fail(id: number, error: unknown, hasHash = false) {
    clearTimers(id)
    unlock(id)
    const info = classifyTxError(error, { hasHash })
    console.error('[CoindeccFlow] transaction failed', { id, info, error })
    patch(id, { phase: info.kind === 'rejected' ? 'user_rejected' : 'failed', info })
  }

  function poll(id: number) {
    const tick = async () => {
      const record = byId.get(id)
      if (!record?.hash || record.receipt || !ACTIVE_PHASES.has(record.phase)) return
      if (deps.now() - (record.submittedAt ?? record.startedAt) > TIMING.maxTrackMs) return
      let delay = TIMING.pollMs
      try {
        const receipt = await deps.readReceipt(record.hash)
        if (receipt) {
          clearTimers(id)
          if (receipt.status === 'success') {
            const toHref = hrefFns.get(id)
            patch(id, { phase: 'success', receipt, href: toHref?.(receipt) ?? record.href })
          } else {
            patch(id, {
              phase: 'failed',
              receipt,
              info: {
                kind: 'revert',
                title: 'The transaction reverted onchain',
                message: 'The transaction was mined but the contract reverted it. No funds moved, and it is safe to try again.',
                detail: `Receipt status: reverted (tx ${record.hash})`,
                retry: true,
              },
            })
          }
          return
        }
      } catch {
        // RPC hiccups and rate limits only slow the check. They never mark the transaction failed.
        delay = Math.min(TIMING.pollMs * 2, 8_000)
      }
      const stillActive = byId.get(id)
      if (stillActive && !stillActive.receipt && ACTIVE_PHASES.has(stillActive.phase)) {
        addTimer(id, stillActive.phase === 'status_unknown' ? 5_000 : delay, () => void tick())
      }
    }
    void tick()
  }

  function onHash(id: number, hash: Hash) {
    clearTimers(id)
    unlock(id)
    patch(id, { phase: 'submitted', hash, submittedAt: deps.now(), walletSlow: false })
    addTimer(id, TIMING.confirmingMs, () => phaseOf(id) === 'submitted' && patch(id, { phase: 'confirming' }))
    addTimer(id, TIMING.statusUnknownMs, () => {
      const phase = phaseOf(id)
      if (phase === 'submitted' || phase === 'confirming') patch(id, { phase: 'status_unknown' })
    })
    poll(id)
  }

  function begin(options: BeginOptions): BeginResult {
    const latest = latestByKey.has(options.key) ? byId.get(latestByKey.get(options.key)!) : undefined
    if (latest && ACTIVE_PHASES.has(latest.phase) && !latest.abandoned) {
      return { ok: false, reason: 'duplicate', message: 'This action is already in progress. Wait for it to finish or check its status.' }
    }
    if (lockId != null) {
      const holder = byId.get(lockId)
      return {
        ok: false,
        reason: 'busy',
        message: `A wallet request (${holder?.label ?? 'earlier action'}) is still waiting for your wallet. Approve or reject it there first.`,
      }
    }
    const id = nextId++
    const now = deps.now()
    byId.set(id, { id, key: options.key, label: options.label, phase: 'preparing', startedAt: now, phaseAt: now, walletSlow: false, dismissed: false, abandoned: false, seen: false })
    if (typeof options.href === 'function') hrefFns.set(id, options.href)
    else if (options.href) patch(id, { href: options.href })
    latestByKey.set(options.key, id)
    lockId = id
    emit()

    let request: Promise<Hash>
    try {
      request = options.send()
    } catch (error) {
      request = Promise.reject(Object.assign(new Error('The wallet request could not be started'), { cause: error }))
    }
    patch(id, { phase: 'awaiting_wallet' })
    addTimer(id, TIMING.walletSlowMs, () => phaseOf(id) === 'awaiting_wallet' && patch(id, { walletSlow: true }))
    addTimer(id, TIMING.walletUnresponsiveMs, () => phaseOf(id) === 'awaiting_wallet' && patch(id, { phase: 'wallet_unresponsive', walletSlow: true }))

    const result = request.then(
      (hash) => {
        onHash(id, hash)
        return hash
      },
      (error) => {
        fail(id, error)
        return undefined
      },
    )
    return { ok: true, result }
  }

  return {
    begin,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getLatest: (key: string): TxRecord | undefined => (latestByKey.has(key) ? byId.get(latestByKey.get(key)!) : undefined),
    list: () => cachedList,
    lockHolder: (): TxRecord | undefined => (lockId != null ? byId.get(lockId) : undefined),
    attach(key: string) {
      mounts.set(key, (mounts.get(key) ?? 0) + 1)
      emit()
      return () => {
        mounts.set(key, Math.max(0, (mounts.get(key) ?? 1) - 1))
        emit()
      }
    },
    isMounted: (key: string) => (mounts.get(key) ?? 0) > 0,
    /** Hide the waiting screen. The wallet request is NOT cancelled, and the lock stays held. */
    dismiss(id: number) {
      const record = byId.get(id)
      if (!record) return
      if (['success', 'failed', 'user_rejected'].includes(record.phase)) patch(id, { seen: true, dismissed: true })
      else patch(id, { dismissed: true })
    },
    /** Show the waiting screen again for a request that is still open. */
    reopen(id: number) {
      patch(id, { dismissed: false })
    },
    /** The user stops waiting for an unanswered wallet request. It may still be open in the wallet; a late answer is still tracked. */
    abandon(id: number) {
      const record = byId.get(id)
      if (!record) return
      unlock(id)
      patch(id, { abandoned: true, dismissed: true })
    },
    /** Clear a finished attempt so the action returns to idle. */
    reset(key: string) {
      const id = latestByKey.get(key)
      const record = id != null ? byId.get(id) : undefined
      if (record && ['success', 'failed', 'user_rejected'].includes(record.phase)) patch(record.id, { seen: true, dismissed: true })
    },
    acknowledge(id: number) {
      patch(id, { seen: true })
    },
    /** Resume tracking of transactions that were submitted before a reload. */
    restore(items: Array<{ key: string; label: string; hash: Hash; startedAt: number; href?: string }>) {
      for (const item of items) {
        if (latestByKey.has(item.key) && byId.get(latestByKey.get(item.key)!)?.hash === item.hash) continue
        const id = nextId++
        byId.set(id, { id, key: item.key, label: item.label, phase: 'confirming', startedAt: item.startedAt, phaseAt: deps.now(), hash: item.hash, submittedAt: item.startedAt, walletSlow: false, dismissed: true, abandoned: false, seen: false, href: item.href })
        latestByKey.set(item.key, id)
        emit()
        poll(id)
      }
    },
  }
}
