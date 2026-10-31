import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Hourglass, Info, X, XCircle } from 'lucide-react'
import { Link } from '@/components/Link'
import { Spinner } from '@/components/ui'
import { WalletWaitCard } from '@/components/WalletWaitCard'
import { txUrl } from '@/lib/flow'
import { refreshChainData } from '@/lib/refresh'
import { presentTxError } from '@/lib/txErrors'
import { txTracker } from '@/lib/txTracker'
import { type TxPhase, type TxRecord } from '@/lib/txLifecycle'

const AWAITING: ReadonlySet<TxPhase> = new Set(['awaiting_wallet', 'wallet_unresponsive'])
const ON_CHAIN: ReadonlySet<TxPhase> = new Set(['submitted', 'confirming', 'status_unknown'])
const SUCCESS_VISIBLE_MS = 8_000

const STATUS_LABEL: Partial<Record<TxPhase, string>> = {
  submitted: 'Submitted',
  confirming: 'Confirming',
  status_unknown: 'Status unknown',
}

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`

function ExplorerLink({ hash }: { hash: string }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
      View on Arc Explorer <ExternalLink size={12} />
    </a>
  )
}

function TrayItem({ record }: { record: TxRecord }) {
  const { phase, hash } = record
  let body: React.ReactNode = null

  if (AWAITING.has(phase)) {
    body = (
      <>
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Hourglass size={14} className="text-brandink" /> Waiting for your wallet
        </p>
        <p className="mt-1 text-xs text-muted">{record.label}. Your pending request stays tracked. If your wallet shows it, confirm it there.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => txTracker.reopen(record.id)}>
            Show details
          </button>
        </div>
      </>
    )
  } else if (ON_CHAIN.has(phase) && hash) {
    body = (
      <>
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Spinner size={13} /> Transaction submitted
          <span className="ml-auto rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brandink">{STATUS_LABEL[phase]}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {phase === 'status_unknown'
            ? 'Not confirmed yet. Do not send it again: we keep checking, and it may still confirm.'
            : 'Waiting for confirmation on Arc Network.'}
        </p>
        <p className="mt-1.5 break-all font-mono text-[11px] text-muted">{shortHash(hash)}</p>
        <p className="mt-1 text-xs">
          <ExplorerLink hash={hash} />
        </p>
        <p className="mt-1 truncate text-[11px] text-muted/80">{record.label}</p>
      </>
    )
  } else if (phase === 'success' && hash) {
    body = (
      <>
        <p className="flex items-center gap-2 text-sm font-semibold text-ok">
          <CheckCircle2 size={15} /> Confirmed onchain
        </p>
        <p className="mt-1 truncate text-xs text-muted">{record.label}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <ExplorerLink hash={hash} />
          {record.href ? (
            <Link to={record.href} className="font-medium text-brand hover:underline" onClick={() => txTracker.acknowledge(record.id)}>
              Open
            </Link>
          ) : null}
        </p>
      </>
    )
  } else if ((phase === 'failed' || phase === 'user_rejected') && record.info) {
    const view = presentTxError(record.info)
    const toneClass = view.tone === 'neutral' ? 'text-fg' : view.tone === 'warn' ? 'text-warn' : 'text-danger'
    body = (
      <>
        <p className={`flex items-start gap-2 text-sm font-semibold ${toneClass}`}>
          {view.tone === 'neutral' ? <Info size={15} className="mt-0.5 shrink-0 text-muted" /> : <XCircle size={15} className="mt-0.5 shrink-0" />} {view.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{view.message}</p>
        <p className="mt-1 truncate text-[11px] text-muted/80">{record.label}</p>
      </>
    )
  }
  if (!body) return null

  return (
    <div role="status" aria-live="polite" className="surface pointer-events-auto relative p-4 pr-9 shadow-lg">
      {body}
      {AWAITING.has(phase) ? null : (
        <button
          type="button"
          aria-label="Dismiss"
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted hover:text-fg"
          onClick={() => txTracker.acknowledge(record.id)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * App-wide transaction surface: the wallet waiting card, a tray for transactions that are still
 * confirming after the user navigated away, and the balance refresh after every confirmed transaction.
 */
export function TxHost() {
  const queryClient = useQueryClient()
  const records = useSyncExternalStore(txTracker.subscribe, txTracker.list)

  // Refresh balances and agreements once per confirmed transaction, wherever the user is.
  const refreshed = useRef(new Set<number>())
  const acknowledging = useRef(new Set<number>())
  useEffect(() => {
    for (const record of records) {
      if (record.phase === 'success' && !refreshed.current.has(record.id)) {
        refreshed.current.add(record.id)
        refreshChainData(queryClient)
      }
      if (record.phase === 'success' && !record.seen && !acknowledging.current.has(record.id)) {
        acknowledging.current.add(record.id)
        window.setTimeout(() => txTracker.acknowledge(record.id), SUCCESS_VISIBLE_MS)
      }
    }
  }, [records, queryClient])

  const waiting = records.find((r) => AWAITING.has(r.phase) && !r.dismissed && !r.abandoned)
  const tray = records.filter((record) => {
    if (record === waiting || record.abandoned) return false
    if (AWAITING.has(record.phase)) return record.dismissed // a hidden wallet request stays reachable
    if (record.seen) return false
    return !txTracker.isMounted(record.key) // otherwise the page that started it already shows the result inline
  })

  if (!waiting && tray.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[60] mx-auto flex max-w-md flex-col gap-2">
      {waiting ? <WalletWaitCard key={waiting.id} record={waiting} /> : null}
      {tray.slice(0, 3).map((record) => (
        <TrayItem key={record.id} record={record} />
      ))}
    </div>
  )
}
