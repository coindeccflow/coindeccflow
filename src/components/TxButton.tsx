import type { ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import type { TxState } from '@/hooks/useFlowTx'
import { FLOW_CHAIN, FLOW_CHAIN_ID, txUrl } from '@/lib/flow'
import { Spinner } from '@/components/ui'
import { TxErrorNotice } from '@/components/TxErrorNotice'

interface TxButtonProps {
  label: string
  onClick: () => void
  tx: TxState
  disabled?: boolean
  variant?: 'primary' | 'ghost'
  className?: string
  icon?: ReactNode
}

const BUSY_LABEL = { pending: 'Waiting for wallet', confirming: 'Confirming' } as const

/**
 * Wallet-gated action button. Connects the wallet or switches network first,
 * then runs the action and reflects the real transaction phase.
 */
export function TxButton({ label, onClick, tx, disabled, variant = 'primary', className = '', icon }: TxButtonProps) {
  const { isConnected, chainId } = useAccount()
  const { setOpen } = useModal()
  const { switchChain, isPending: switching } = useSwitchChain()
  const base = variant === 'primary' ? 'btn-primary' : 'btn-ghost'

  if (!isConnected) {
    return (
      <button type="button" className={`${base} ${className}`} onClick={() => setOpen(true)}>
        Connect wallet
      </button>
    )
  }
  if (chainId !== FLOW_CHAIN_ID) {
    return (
      <button
        type="button"
        className={`${base} ${className}`}
        disabled={switching}
        onClick={() => switchChain({ chainId: FLOW_CHAIN_ID })}
      >
        {switching ? <Spinner /> : null}
        Switch to {FLOW_CHAIN.name}
      </button>
    )
  }
  return (
    <button type="button" className={`${base} ${className}`} disabled={disabled || tx.busy} onClick={onClick}>
      {tx.busy ? <Spinner /> : icon}
      {tx.phase === 'pending' || tx.phase === 'confirming' ? BUSY_LABEL[tx.phase] : label}
    </button>
  )
}

/** Inline status line for the latest transaction: pending, confirming, confirmed, failed. */
export function TxStatus({
  tx,
  confirmedText = 'Confirmed onchain',
  onRetry,
  onBack,
  hideActions = false,
}: {
  tx: TxState
  confirmedText?: string
  /** Re-runs the same action. Shown only when the error is one where retrying is safe. */
  onRetry?: () => void
  onBack?: () => void
  /** The caller already has its own Try Again and Back buttons. */
  hideActions?: boolean
}) {
  const { connector, chainId } = useAccount()
  if (tx.phase === 'idle' && !tx.notice) return null
  if (tx.phase === 'failed' && tx.info) {
    return (
      <div className="mt-3">
        <TxErrorNotice
          info={tx.info}
          hash={tx.hash}
          walletName={connector?.name ?? 'Wallet not identified'}
          networkName={chainId === undefined || chainId === FLOW_CHAIN_ID ? FLOW_CHAIN.name : `Chain ${chainId}`}
          onRetry={hideActions ? undefined : onRetry}
          onBack={hideActions ? undefined : (onBack ?? tx.reset)}
        />
        {tx.notice ? <p className="mt-2 text-xs text-warn">{tx.notice}</p> : null}
      </div>
    )
  }
  const link = tx.hash ? (
    <a
      href={txUrl(tx.hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
    >
      View on explorer <ExternalLink size={12} />
    </a>
  ) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-ink/50 px-3.5 py-2.5 text-xs"
    >
      {tx.phase === 'pending' && (
        <span className="flex items-center gap-2 text-muted">
          <Spinner size={12} />
          {tx.walletSlow
            ? 'Your wallet is taking longer than expected. Check MetaMask for a pending confirmation request.'
            : 'Waiting for wallet confirmation'}
        </span>
      )}
      {tx.phase === 'confirming' && (
        <span className="flex items-center gap-2 text-brandink">
          <Spinner size={12} />
          {tx.lifecycle === 'status_unknown'
            ? 'Status unknown: not confirmed yet. Do not send it again; we keep checking.'
            : 'Transaction submitted. Waiting for confirmation on Arc Network.'}
        </span>
      )}
      {tx.phase === 'confirmed' && (
        <span className="flex items-center gap-1.5 text-ok">
          <CheckCircle2 size={14} /> {confirmedText}
        </span>
      )}
      {link}
      {tx.notice ? <p className="w-full text-warn">{tx.notice}</p> : null}
    </div>
  )
}
