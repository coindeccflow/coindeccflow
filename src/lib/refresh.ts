import type { QueryClient } from '@tanstack/react-query'

/** wagmi stores every onchain read under one of these query keys. */
const CHAIN_READ_KEYS = new Set(['readContract', 'readContracts', 'balance'])

/** Delays (ms) after a confirmed transaction at which the app re-reads the chain. */
const REFRESH_DELAYS_MS = [0, 1200, 3500, 8000]

export const FLOW_REFRESH_EVENT = 'flow:refresh'

/**
 * Re-reads every onchain value (wallet USDC balance, allowance, agreements, milestones, recipient balance)
 * and the activity feed right after a transaction is confirmed.
 *
 * It runs several times because Arc's public RPC is load-balanced across backends at slightly different
 * heights: the first read after a receipt can land on a backend that has not imported the block yet and
 * return the pre-transaction balance. The later passes replace that value within a few seconds.
 */
export function refreshChainData(queryClient: QueryClient): void {
  const run = () => {
    void queryClient.invalidateQueries({ predicate: (query) => CHAIN_READ_KEYS.has(String(query.queryKey[0])) })
    window.dispatchEvent(new Event(FLOW_REFRESH_EVENT))
  }
  for (const delay of REFRESH_DELAYS_MS) {
    if (delay === 0) run()
    else window.setTimeout(run, delay)
  }
}
