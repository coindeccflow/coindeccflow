/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Wallet connectors:
 *  - MetaMask and other injected wallets (browser extensions, in-app wallet browsers)
 *  - Coinbase Wallet
 *  - WalletConnect v2 (QR code on desktop, deep links on mobile), only when
 *    VITE_WALLETCONNECT_PROJECT_ID is set. No project id is bundled with the app.
 */

import { fallback, http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { getDefaultConnectors } from 'connectkit'

if (import.meta.env.DEV) {
  void import('./tracing').then(({ registerChain }) => {
    for (const chain of [arcTestnet, arc]) {
      for (const url of chain.rpcUrls.default.http) registerChain(chain.id, url)
    }
  })
}

/**
 * The official Arc RPC list (Circle's primary endpoint first, then the providers Arc documents).
 * The primary is always tried first; the others are used only when it fails, for example when the
 * public endpoint answers "rate limit exceeded".
 */
const arcTransport = (urls: readonly string[]) =>
  fallback(
    urls.map((url) => http(url, { retryCount: 1 })),
    { rank: false },
  )

const rawProjectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim()
/** WalletConnect Cloud project id from the environment. Undefined when not configured. */
export const WALLETCONNECT_PROJECT_ID = rawProjectId ? rawProjectId : undefined
export const WALLETCONNECT_CONFIGURED = Boolean(WALLETCONNECT_PROJECT_ID)

const origin = typeof window === 'undefined' ? '' : window.location.origin

// The chain the app targets goes first: WalletConnect requests the first configured chain
// as the session's required chain, and wallets reject sessions that require unknown chains.
const targetsMainnet = Number(import.meta.env.VITE_FLOW_CHAIN_ID ?? arcTestnet.id) === arc.id
const chains = targetsMainnet
  ? ([arc, arcTestnet, mainnet] as const)
  : ([arcTestnet, arc, mainnet] as const)

export const config = createConfig({
  // Ethereum mainnet is only needed for ENS resolution. `arc` (Arc mainnet) is selected by
  // VITE_FLOW_CHAIN_ID=5042 once an escrow is deployed there. Nothing is deployed to mainnet by default.
  chains,
  connectors: getDefaultConnectors({
    app: {
      name: 'CoindeccFlow',
      description: 'Programmable USDC milestone payments on Arc, powered by CoindeccPay',
      url: origin,
      // WalletConnect wallets show this icon; it must be an absolute URL on this origin.
      icon: `${origin}/coindeccflow.svg`,
    },
    walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
    enableAaveAccount: false,
  }),
  transports: {
    [arcTestnet.id]: arcTransport(arcTestnet.rpcUrls.default.http),
    [arc.id]: arcTransport(arc.rpcUrls.default.http),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
