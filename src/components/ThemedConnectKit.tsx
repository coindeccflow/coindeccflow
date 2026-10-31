import type { ReactNode } from 'react'
import { ConnectKitProvider } from 'connectkit'
import { FLOW_CHAIN_ID } from '@/lib/flow'
import { useTheme, type Theme } from '@/lib/theme'

// ConnectKit needs literal hex values, so these mirror the tokens in src/index.css.
const CONNECTKIT_THEME: Record<Theme, Record<string, string>> = {
  dark: {
    '--ck-font-family': "'DM Sans', sans-serif",
    '--ck-body-background': '#0B1426',
    '--ck-body-color': '#F8FAFF',
    '--ck-body-color-muted': '#94A3B8',
    '--ck-primary-button-background': '#121E36',
    '--ck-secondary-button-background': '#121E36',
    '--ck-focus-color': '#2D9CFF',
    '--ck-overlay-background': 'rgba(5,11,24,0.78)',
  },
  light: {
    '--ck-font-family': "'DM Sans', sans-serif",
    '--ck-body-background': '#FFFFFF',
    '--ck-body-color': '#101B35',
    '--ck-body-color-muted': '#64748B',
    '--ck-primary-button-background': '#F3F8FD',
    '--ck-secondary-button-background': '#F3F8FD',
    '--ck-focus-color': '#1673E6',
    '--ck-overlay-background': 'rgba(16,27,53,0.45)',
  },
}

/** ConnectKit provider whose modal follows the app theme. Wallet options are unchanged. */
export function ThemedConnectKit({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  return (
    <ConnectKitProvider
      mode={theme}
      options={{
        initialChainId: FLOW_CHAIN_ID,
        // The app shows its own network banner and switch button, so no blocking modal.
        enforceSupportedChains: false,
        // Show both the QR code and an "open wallet app" link for WalletConnect.
        walletConnectCTA: 'both',
      }}
      customTheme={CONNECTKIT_THEME[theme]}
    >
      {children}
    </ConnectKitProvider>
  )
}
