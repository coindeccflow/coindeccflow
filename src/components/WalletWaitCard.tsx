import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { Wallet } from 'lucide-react'
import { FLOW_CHAIN, FLOW_CHAIN_ID } from '@/lib/flow'
import { txTracker } from '@/lib/txTracker'
import { waitStage, type TxRecord } from '@/lib/txLifecycle'
import { checkWallet, openWallet } from '@/lib/walletTools'

const COPY = {
  waiting: {
    title: 'Waiting for wallet confirmation',
    text: 'Please review and confirm this transaction in your connected wallet.',
  },
  slow: {
    title: 'Your wallet is taking longer than expected.',
    text: 'Please check MetaMask for a pending confirmation request.',
  },
  unresponsive: {
    title: 'Still waiting for your wallet.',
    text: 'You can dismiss this window and continue using CoindeccFlow. Your pending request will remain tracked.',
  },
} as const

/** Animated ring. Motion is switched off for people who prefer reduced motion. */
function WaitingRing() {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-brand/15 motion-reduce:animate-none" />
      <span className="absolute inset-1 rounded-full border-2 border-brand/20" />
      <span className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-brand motion-reduce:animate-none" />
      <Wallet size={16} className="text-brandink" />
    </span>
  )
}

/**
 * The "waiting for your wallet" card. The thresholds (Dismiss at 5 s, guidance at 15 s and 30 s) only
 * change what this card says. They never cancel the wallet request or send anything.
 */
export function WalletWaitCard({ record }: { record: TxRecord }) {
  const { connector, address } = useAccount()
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  const stage = waitStage(now - record.startedAt)
  const copy = stage === 'unresponsive' ? COPY.unresponsive : stage === 'slow' ? COPY.slow : COPY.waiting
  const canDismiss = stage !== 'waiting'
  const showCheck = stage === 'slow' || stage === 'unresponsive'

  const onCheck = async () => {
    setChecking(true)
    // A website cannot open the MetaMask extension, so this opens a mobile wallet app when it can,
    // and otherwise tells the user where to click.
    const opened = await openWallet(connector)
    if (opened.opened) {
      setCheckResult(opened.message)
    } else {
      const status = await checkWallet(connector, { address, chainId: FLOW_CHAIN_ID, chainName: FLOW_CHAIN.name })
      setCheckResult(`${status.message} ${opened.message}`)
    }
    setChecking(false)
  }

  const dismissButton = canDismiss ? (
    <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={() => txTracker.dismiss(record.id)}>
      Dismiss
    </button>
  ) : null
  const checkButton = showCheck ? (
    <button type="button" className="btn-primary !px-3.5 !py-2 text-xs" disabled={checking} onClick={() => void onCheck()}>
      {checking ? 'Checking…' : 'Check Wallet'}
    </button>
  ) : null

  return (
    <div role="status" aria-live="polite" className="surface pointer-events-auto p-4 shadow-lg">
      <div className="flex items-start gap-3.5">
        <WaitingRing />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{copy.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{copy.text}</p>
          <p className="mt-1.5 truncate text-[11px] text-muted/80">{record.label}</p>
        </div>
      </div>
      {canDismiss || showCheck ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {stage === 'unresponsive' ? (
            <>
              {dismissButton}
              {checkButton}
            </>
          ) : (
            <>
              {checkButton}
              {dismissButton}
            </>
          )}
        </div>
      ) : null}
      {checkResult ? <p className="mt-2.5 rounded-lg bg-ink/60 px-3 py-2 text-xs leading-relaxed text-muted">{checkResult}</p> : null}
      {stage === 'unresponsive' ? (
        <button
          type="button"
          className="mt-2.5 text-left text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-fg"
          onClick={() => txTracker.abandon(record.id)}
        >
          Stop waiting and allow a new request. The earlier request may still appear in your wallet, so reject it there first.
        </button>
      ) : null}
    </div>
  )
}
