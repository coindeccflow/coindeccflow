import { useId, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, HelpCircle, Info, XCircle } from 'lucide-react'
import { FLOW_CHAIN, txUrl } from '@/lib/flow'
import { buildDetailsText, copyText, isConfirmedWalletRejection, presentTxError, sanitizeDetail, type ErrorTone, type TxErrorInfo } from '@/lib/txErrors'

const TONE: Record<ErrorTone, { box: string; icon: string }> = {
  neutral: { box: 'border-line bg-ink/50', icon: 'text-muted' },
  warn: { box: 'border-warn/30 bg-warn/10', icon: 'text-warn' },
  danger: { box: 'border-danger/30 bg-danger/10', icon: 'text-danger' },
}

function ToneIcon({ tone }: { tone: ErrorTone }) {
  const className = `mt-0.5 shrink-0 ${TONE[tone].icon}`
  if (tone === 'neutral') return <Info size={16} className={className} />
  if (tone === 'warn') return <AlertTriangle size={16} className={className} />
  return <XCircle size={16} className={className} />
}

interface Props {
  info: TxErrorInfo
  /** Transaction hash, when one exists. */
  hash?: string
  /** Offered only when retrying is established as safe. */
  onRetry?: () => void
  /** Closes the notice, or returns to the previous step. */
  onBack?: () => void
  walletName?: string
  networkName?: string
  /** Start with the technical details open. Used by tests. */
  defaultOpen?: boolean
}

/**
 * Calm failure presentation. A declined wallet request is a normal choice, so it gets a neutral card.
 * Developer facts live in a collapsed disclosure and never include keys, tokens or environment values.
 */
export function TxErrorNotice({ info, hash, onRetry, onBack, walletName: walletProp, networkName: networkProp, defaultOpen = false }: Props) {
  const view = info.kind === 'rejected' && hash
    ? {
        tone: 'warn' as const,
        title: 'Transaction status not yet confirmed.',
        message: 'We could not verify whether the request was submitted. Check your wallet or transaction history before trying again.',
        canRetry: false,
      }
    : presentTxError(info)
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const t = info.technical ?? { name: 'Error', code: 'None', message: sanitizeDetail(info.detail), stage: 'Confirmation' }
  const panelId = `tx-error-details-${useId()}`
  const rejectedBeforeSubmission = isConfirmedWalletRejection(info, hash)
  const confirmedRevert = info.kind === 'revert' && Boolean(hash)
  const status = rejectedBeforeSubmission
    ? 'Cancelled by you'
    : confirmedRevert
      ? 'Failed onchain'
      : hash || t.stage.includes('after submission')
        ? 'Transaction status not yet confirmed.'
        : t.stage.includes('before submission')
          ? 'Request not submitted'
          : 'Transaction status not yet confirmed.'
  const funds = rejectedBeforeSubmission || confirmedRevert || status === 'Request not submitted'
    ? 'None'
    : 'Not yet confirmed'
  const walletName = walletProp ?? 'Wallet not identified'
  const networkName = networkProp ?? FLOW_CHAIN.name

  const copy = async () => {
    const ok = await copyText(buildDetailsText(info, hash, { wallet: walletName, network: networkName }))
    setCopied(ok ? 'ok' : 'failed')
    window.setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <div role="alert" className={`w-full rounded-xl border p-4 ${TONE[view.tone].box}`}>
      <div className="flex items-start gap-3">
        <ToneIcon tone={view.tone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{view.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{view.message}</p>
          {view.hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{view.hint}</p> : null}
        </div>
      </div>

      {(view.canRetry && onRetry) || onBack || hash ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2 pl-7">
          {view.canRetry && onRetry ? (
            <button type="button" className="btn-primary !px-4 !py-2 text-xs" onClick={onRetry}>
              Try Again
            </button>
          ) : null}
          {onBack ? (
            <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={onBack}>
              Back
            </button>
          ) : null}
          {hash ? (
            <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              View on Arc Explorer <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 pl-7">
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <HelpCircle size={13} aria-hidden="true" />
          Need help?
          <ChevronDown size={13} className={`transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
        <div
          id={panelId}
          aria-hidden={!open}
          className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <h3 className="mt-2.5 text-xs font-semibold text-fg">Transaction information</h3>
            <dl className="mt-2.5 space-y-2 rounded-lg border border-line bg-ink/60 p-3 text-xs leading-relaxed">
              <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-fg">{status}</dd>
              </div>
              <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                <dt className="text-muted">Wallet</dt>
                <dd className="text-fg">{walletName}</dd>
              </div>
              <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                <dt className="text-muted">Network</dt>
                <dd className="text-fg">{networkName}</dd>
              </div>
              <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                <dt className="text-muted">Funds transferred</dt>
                <dd className="text-fg">{funds}</dd>
              </div>
              {hash ? (
                <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                  <dt className="text-muted">Transaction</dt>
                  <dd><a tabIndex={open ? 0 : -1} href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">View on Arc Explorer <ExternalLink size={12} /></a></dd>
                </div>
              ) : null}
            </dl>
            <button type="button" tabIndex={open ? 0 : -1} className="btn-ghost mt-2.5 !px-3 !py-1.5 text-xs" onClick={() => void copy()}>
              {copied === 'ok' ? <Check size={13} /> : <Copy size={13} />}
              {copied === 'ok' ? 'Diagnostic information copied' : copied === 'failed' ? 'Could not copy diagnostic information. Try again or allow clipboard access.' : 'Copy diagnostic information'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
