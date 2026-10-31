import type { ReactNode } from 'react'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { ExternalLink, LogOut } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AddressChip } from '@/components/ui'
import { WALLETCONNECT_CONFIGURED } from '@/config'
import { FLOW_ADDRESS, FLOW_CHAIN, FLOW_CHAIN_ID, FLOW_DEPLOY_BLOCK, USDC_ADDRESS, addressUrl } from '@/lib/flow'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface divide-y divide-line">
      <h2 className="px-5 py-4 font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-sm text-muted">{label}</p>
      <div className="min-w-0 text-sm text-fg sm:text-right">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { setOpen } = useModal()
  const { switchChain, isPending } = useSwitchChain()
  const onTarget = chainId === FLOW_CHAIN_ID

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="label !mb-2">Settings</p>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Preferences</h1>
      </div>

      <Group title="Appearance">
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-muted">Choose how CoindeccFlow looks. Your choice is saved on this device.</p>
          <ThemeToggle />
        </div>
      </Group>

      <Group title="Wallet">
        <Row label="Status">
          {isConnected ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Connected
            </span>
          ) : (
            'Not connected'
          )}
        </Row>
        {address ? (
          <Row label="Address">
            <AddressChip address={address} />
          </Row>
        ) : null}
        {isConnected ? (
          <Row label="Network">
            <span className="inline-flex flex-wrap items-center gap-3 sm:justify-end">
              <span className={onTarget ? 'text-ok' : 'text-warn'}>{onTarget ? FLOW_CHAIN.name : 'Wrong network'}</span>
              {onTarget ? null : (
                <button type="button" className="btn-primary !min-h-[40px]" disabled={isPending} onClick={() => switchChain({ chainId: FLOW_CHAIN_ID })}>
                  Switch to {FLOW_CHAIN.name}
                </button>
              )}
            </span>
          </Row>
        ) : null}
        <div className="px-5 py-4">
          {isConnected ? (
            <button type="button" className="btn-ghost" onClick={() => disconnect()}>
              <LogOut size={16} /> Disconnect wallet
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              Connect wallet
            </button>
          )}
        </div>
      </Group>

      <Group title="Network and contract">
        <Row label="Network">
          {FLOW_CHAIN.name} · chain {FLOW_CHAIN_ID}
        </Row>
        <Row label="Escrow contract">
          {FLOW_ADDRESS ? <AddressChip address={FLOW_ADDRESS} /> : <span className="text-warn">Not configured</span>}
        </Row>
        <Row label="USDC token">
          <AddressChip address={USDC_ADDRESS} />
        </Row>
        {FLOW_DEPLOY_BLOCK != null ? <Row label="Deployed at block"><span className="tabular-nums">{FLOW_DEPLOY_BLOCK.toString()}</span></Row> : null}
        {FLOW_ADDRESS ? (
          <div className="px-5 py-4">
            <a href={addressUrl(FLOW_ADDRESS)} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              View contract on explorer <ExternalLink size={14} />
            </a>
          </div>
        ) : null}
      </Group>

      <Group title="Connection methods">
        <Row label="Browser and in-app wallets">Available</Row>
        <Row label="Coinbase Wallet">Available</Row>
        <Row label="WalletConnect (QR and mobile apps)">
          <span className={WALLETCONNECT_CONFIGURED ? 'text-ok' : 'text-warn'}>
            {WALLETCONNECT_CONFIGURED ? 'Configured' : 'Not configured'}
          </span>
        </Row>
      </Group>

      <p className="text-center text-xs text-muted">Powered by CoindeccPay</p>
    </div>
  )
}
