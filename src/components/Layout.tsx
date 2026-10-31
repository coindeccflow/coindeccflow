import { useEffect, useState, type ReactNode } from 'react'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertTriangle, LogOut, Menu, Wallet } from 'lucide-react'
import { DesktopSidebar, Logo, MobileDrawer } from '@/components/Sidebar'
import { TxHost } from '@/components/TxHost'
import { WalletNotice } from '@/components/WalletNotice'
import type { Route } from '@/hooks/useRoute'
import { FLOW_ADDRESS, FLOW_CHAIN, FLOW_CHAIN_ID, shortAddress } from '@/lib/flow'

function WalletControls() {
  const { disconnect } = useDisconnect()
  const { isConnected } = useAccount()
  return (
    <div className="flex items-center gap-2">
      <ConnectKitButton.Custom>
        {({ isConnected: connected, show, address }) => (
          <button type="button" onClick={show} className="btn-ghost !min-h-[44px] !px-3.5">
            <Wallet size={15} className="text-ok" />
            <span className="tabular-nums">{connected && address ? shortAddress(address) : 'Connect wallet'}</span>
          </button>
        )}
      </ConnectKitButton.Custom>
      {isConnected ? (
        <button
          type="button"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
          className="btn-ghost !hidden !min-h-[44px] !w-11 !px-0 sm:!inline-flex"
        >
          <LogOut size={15} />
        </button>
      ) : null}
    </div>
  )
}

function NetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!FLOW_ADDRESS) {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>
          No escrow contract is configured. Set <span className="font-mono">VITE_FLOW_ESCROW_ADDRESS</span> in{' '}
          <span className="font-mono">.env</span> to the deployed CoindeccFlowEscrow address and restart the dev server.
        </p>
      </div>
    )
  }
  if (isConnected && chainId !== FLOW_CHAIN_ID) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Your wallet is on the wrong network. CoindeccFlow runs on {FLOW_CHAIN.name}.
        </span>
        <button
          type="button"
          className="btn-primary !min-h-[40px]"
          disabled={isPending}
          onClick={() => switchChain({ chainId: FLOW_CHAIN_ID })}
        >
          Switch to {FLOW_CHAIN.name}
        </button>
      </div>
    )
  }
  return null
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  // The drawer is open only for the route it was opened on, so navigating closes it without an effect.
  const routeKey = route.name === 'agreement' ? `agreement-${route.id}` : route.name
  const [openKey, setOpenKey] = useState<string | null>(null)
  const menuOpen = openKey === routeKey
  const setMenuOpen = (open: boolean) => setOpenKey(open ? routeKey : null)

  // Close the drawer with Escape and lock page scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenKey(null)
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  return (
    <div className="min-h-dvh">
      <DesktopSidebar route={route} />
      <MobileDrawer route={route} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-20 border-b border-line bg-ink/75 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg transition hover:border-brand/50 lg:hidden"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0 lg:hidden">
                <Logo hideNameOnTiny />
              </div>
              <span className="hidden items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-muted lg:flex">
                <span className={`h-1.5 w-1.5 rounded-full ${FLOW_CHAIN.isTestnet ? 'bg-mint' : 'bg-warn'}`} />
                {FLOW_CHAIN.name}
                {FLOW_CHAIN.isTestnet ? null : <span className="font-semibold text-warn">Mainnet · real USDC</span>}
              </span>
            </div>
            <WalletControls />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <WalletNotice />
          <NetworkBanner />
          {children}
        </main>
        <TxHost />
      </div>
    </div>
  )
}
