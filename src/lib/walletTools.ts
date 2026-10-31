import type { Connector } from 'wagmi'

interface Eip1193 {
  request: (args: { method: string }) => Promise<unknown>
  session?: { peer?: { metadata?: { redirect?: { native?: string; universal?: string } } } }
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('wallet error'))
      },
    )
  })

async function providerOf(connector: Connector | undefined): Promise<Eip1193 | undefined> {
  if (!connector) return undefined
  return (await connector.getProvider()) as Eip1193 | undefined
}

export interface WalletCheck {
  responsive: boolean
  message: string
}

/**
 * Asks the wallet for its accounts and chain. These calls never open a popup, so a quick answer
 * proves the wallet is alive and on the right account and network. It does not prove that a
 * confirmation window is open.
 */
export async function checkWallet(
  connector: Connector | undefined,
  expected: { address?: string; chainId: number; chainName: string },
): Promise<WalletCheck> {
  try {
    const provider = await providerOf(connector)
    if (!provider) return { responsive: false, message: 'No wallet connection was found. Reconnect your wallet.' }
    const [accounts, chainHex] = await withTimeout(
      Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]),
      4_000,
    )
    const list = Array.isArray(accounts) ? (accounts as string[]) : []
    const chainId = typeof chainHex === 'string' ? Number.parseInt(chainHex, 16) : NaN
    if (list.length === 0) return { responsive: true, message: 'The wallet answered but is locked or has no account connected. Unlock it, then reconnect.' }
    if (expected.address && !list.some((a) => a.toLowerCase() === expected.address?.toLowerCase())) {
      return { responsive: true, message: 'The wallet answered, but a different account is selected. Switch back to the account you connected with.' }
    }
    if (chainId !== expected.chainId) {
      return { responsive: true, message: `The wallet answered, but it is on a different network. Switch it to ${expected.chainName}.` }
    }
    return {
      responsive: true,
      message: `The wallet is responding on ${expected.chainName}. If you see no confirmation window, click the wallet's toolbar icon: pending requests are listed there.`,
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'timeout'
    return {
      responsive: false,
      message: timedOut
        ? 'The wallet did not answer within 4 seconds. Unlock it or restart the wallet extension or app, then check again.'
        : 'The wallet returned an error when checked. Reconnect your wallet.',
    }
  }
}

/**
 * Brings the wallet to the front where a browser allows it. A website cannot open the MetaMask
 * extension window itself, so on desktop this returns instructions instead of pretending.
 */
export async function openWallet(connector: Connector | undefined): Promise<{ opened: boolean; message: string }> {
  try {
    const provider = await providerOf(connector)
    const redirect = provider?.session?.peer?.metadata?.redirect
    const target = redirect?.native || redirect?.universal
    if (target) {
      window.location.href = target
      return { opened: true, message: 'Opening your wallet app. Approve or reject the pending request there, then come back.' }
    }
  } catch {
    // Fall through to instructions.
  }
  return {
    opened: false,
    message: 'Your browser does not let websites open the wallet. Click the MetaMask icon in your browser toolbar (in the puzzle-piece menu if it is hidden). Any pending confirmation is listed there.',
  }
}
