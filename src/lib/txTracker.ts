import { getPublicClient } from 'wagmi/actions'
import type { Hash } from 'viem'
import { config } from '@/config'
import { FLOW_CHAIN_ID } from '@/lib/flow'
import { withBackoff } from '@/lib/logScanner'
import { createTxTracker } from '@/lib/txLifecycle'

const STORAGE_KEY = `coindeccflow:tracked-tx:v1:${FLOW_CHAIN_ID}`

interface Saved {
  key: string
  label: string
  hash: Hash
  startedAt: number
  href?: string
}

/**
 * The app-wide tracker. It lives outside React, so a transaction keeps being tracked while the
 * user moves between pages, and submitted transactions are picked up again after a reload.
 */
export const txTracker = createTxTracker({
  readReceipt: async (hash) => {
    const client = getPublicClient(config, { chainId: FLOW_CHAIN_ID as 5042002 | 5042 })
    if (!client) throw new Error('No public client for the app chain')
    try {
      return await withBackoff(() => client.getTransactionReceipt({ hash }))
    } catch (error) {
      // viem throws when the network has not seen the transaction yet. That is "not found", not a failure.
      if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null
      throw error
    }
  },
  now: () => Date.now(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  persist: (items: Saved[]) => {
    try {
      if (items.length === 0) sessionStorage.removeItem(STORAGE_KEY)
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage unavailable. Tracking still works until the page is closed.
    }
  },
})

try {
  const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[]
  if (Array.isArray(saved) && saved.length > 0) txTracker.restore(saved)
} catch {
  // A corrupt entry is ignored.
}
