import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, type LucideIcon } from 'lucide-react'
import { addressUrl, AgreementStatus, shortAddress, STATUS_LABEL } from '@/lib/flow'

const STATUS_STYLE: Record<AgreementStatus, string> = {
  [AgreementStatus.Created]: 'bg-warn/10 text-warn ring-warn/25',
  [AgreementStatus.Funded]: 'bg-brand/10 text-brandink ring-brand/30',
  [AgreementStatus.Completed]: 'bg-mint/10 text-ok ring-mint/30',
  [AgreementStatus.Cancelled]: 'bg-muted/10 text-muted ring-muted/25',
}

export function StatusBadge({ status }: { status: AgreementStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Stat({
  label,
  value,
  sub,
  accent,
  loading,
  icon: Icon,
  progress,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
  loading?: boolean
  icon?: LucideIcon
  /** 0 to 100. Draws a thin indicator under the value. Derived from real data by the caller. */
  progress?: number
}) {
  return (
    <div className="surface flex flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="label !mb-0 leading-snug">{label}</p>
        {Icon ? (
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accent ? 'bg-mint/15 text-ok' : 'bg-brand/10 text-brand'}`}
          >
            <Icon size={17} aria-hidden />
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-raised" />
      ) : (
        <p className="mt-3 font-display text-[28px] font-semibold leading-none tabular-nums tracking-tight text-fg sm:text-[30px]">
          {value}
        </p>
      )}
      {progress != null && !loading ? (
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted/15" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${accent ? 'bg-mint' : 'bg-brand'}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
      {sub ? <p className="mt-2.5 text-xs text-muted">{sub}</p> : null}
    </div>
  )
}

export function AddressChip({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {label ? <span className="text-muted">{label}</span> : null}
      <span className="font-mono text-[13px] tabular-nums text-fg">{shortAddress(address)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy address"
        className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View address on explorer"
        className="grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg"
      >
        <ExternalLink size={13} />
      </a>
    </span>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 ring-1 ring-brand/25">
        <span className="h-3 w-3 rounded-full bg-mint" />
      </div>
      <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-pretty text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={pct}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-mint transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}

/** A genuine read failure: states the real reason and lets the user retry. Never shown for an empty result. */
export function ReadErrorNotice({ what, message, onRetry }: { what: string; message: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className="surface flex flex-col gap-3 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-warn">Could not read {what} from the network right now.</p>
        <p className="mt-1 text-pretty text-muted">
          Reason: {message ?? 'unknown error'}. Retrying automatically.
        </p>
      </div>
      <button type="button" className="btn-ghost shrink-0" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden /> Retry
      </button>
    </div>
  )
}
