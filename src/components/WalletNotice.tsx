import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useMutationState } from '@tanstack/react-query'
import { Info, X } from 'lucide-react'
import { WALLETCONNECT_CONFIGURED } from '@/config'

function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true // cross-origin access to window.top throws: we are inside a frame
  }
}

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const hasInjectedProvider = () => typeof (window as unknown as { ethereum?: unknown }).ethereum !== 'undefined'

function connectErrorMessage(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected')) {
    return 'The connection request was cancelled in your wallet.'
  }
  if (message.includes('provider not found') || message.includes('not found')) {
    return 'No wallet was found in this browser. Pick a wallet app from the list, or open this page inside your wallet’s built-in browser.'
  }
  if (message.includes('already pending') || message.includes('-32002')) {
    return 'Your wallet already has a pending connection request. Open it and approve or reject it, then try again.'
  }
  if (message.includes('timeout') || message.includes('expired') || message.includes('relay')) {
    return 'The wallet did not respond in time. Try again, and keep your wallet app open.'
  }
  return 'Could not connect to your wallet. Try again, pick a different wallet, or open this page in your wallet’s built-in browser.'
}

/**
 * Explains, in plain language, why a wallet may not connect in this environment:
 * embedded previews, missing wallet providers, missing WalletConnect setup, or a failed attempt.
 * It only reads state. It never requests a connection or a transaction.
 */
export function WalletNotice() {
  const { isConnected } = useAccount()
  const [injected, setInjected] = useState(true)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [embedded] = useState(isEmbedded)
  const [mobile] = useState(isMobileDevice)

  // Wallet extensions and in-app browsers can inject their provider a moment after load.
  useEffect(() => {
    const check = () => setInjected(hasInjectedProvider())
    check()
    const timer = window.setTimeout(check, 1200)
    window.addEventListener('ethereum#initialized', check)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('ethereum#initialized', check)
    }
  }, [])

  const attempts = useMutationState({
    filters: { mutationKey: ['connect'] },
    select: (mutation) => ({
      status: mutation.state.status,
      error: mutation.state.error,
      at: mutation.state.submittedAt,
    }),
  })
  const last = attempts[attempts.length - 1]

  if (isConnected) return null

  const notes: string[] = []
  if (last?.status === 'error' && last.at !== dismissedAt) notes.push(connectErrorMessage(last.error))
  if (embedded) {
    notes.push(
      'You are viewing this inside an embedded preview. Browsers and wallet apps often block wallet connections from embedded frames, including on iPhone. Open the deployed app URL directly in Safari or in your wallet’s built-in browser.',
    )
  }
  if (!injected && !WALLETCONNECT_CONFIGURED) {
    notes.push(
      mobile
        ? 'No wallet is available in this browser, and mobile wallet linking is not set up for this deployment. Open this page inside your wallet’s built-in browser (MetaMask, Coinbase Wallet) to connect.'
        : 'No browser wallet was detected. Install a wallet extension such as MetaMask or Coinbase Wallet, then reload.',
    )
    if (import.meta.env.DEV) {
      notes.push(
        'Developer note: set VITE_WALLETCONNECT_PROJECT_ID in .env (free project at cloud.reown.com) and restart the dev server to enable WalletConnect QR codes and mobile deep links.',
      )
    }
  } else if (!injected && mobile) {
    notes.push('On iPhone, choose your wallet app in the Connect list. It opens the app to approve the connection.')
  }

  if (notes.length === 0) return null

  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-4 text-sm text-brandink">
      <Info size={18} className="mt-0.5 shrink-0" />
      <ul className="min-w-0 flex-1 space-y-2">
        {notes.map((note) => (
          <li key={note} className="text-pretty">
            {note}
          </li>
        ))}
      </ul>
      {last?.status === 'error' ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissedAt(last.at)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-brandink hover:bg-brand/20"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}
