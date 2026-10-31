import { useCallback, useRef, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { escrowAbi } from '@/abi/escrow'
import { FLOW_ADDRESS, FLOW_CHAIN_ID, describeReadError } from '@/lib/flow'
import { withBackoff } from '@/lib/logScanner'

export type GuardResult =
  | { kind: 'unchecked' }
  | { kind: 'checking' }
  | { kind: 'safe' }
  | { kind: 'duplicate'; id: bigint }
  | { kind: 'pending' }
  | { kind: 'unknown'; message: string }

export interface CreationMatch {
  recipient: Address
  title: string
  total: bigint
}

/**
 * Prevents duplicate agreements after an uncertain result.
 * snapshot() records the payer's agreement ids before sending. check() later looks, onchain, for a
 * NEW agreement with the same recipient, title and total, and for a still-pending transaction.
 * A retry is offered only when both come back clean.
 */
export function useCreationGuard() {
  const { address } = useAccount()
  const client = usePublicClient({ chainId: FLOW_CHAIN_ID })
  const baseline = useRef<Set<string> | null>(null)
  const [ready, setReady] = useState(false)
  const [result, setResult] = useState<GuardResult>({ kind: 'unchecked' })

  const readIds = useCallback(async (): Promise<bigint[]> => {
    if (!client || !address || !FLOW_ADDRESS) throw new Error('Wallet or network is not ready')
    const ids = await withBackoff(() =>
      client.readContract({ address: FLOW_ADDRESS!, abi: escrowAbi, functionName: 'getAgreementIdsByPayer', args: [address] }),
    )
    return [...ids]
  }, [client, address])

  const snapshot = useCallback(async () => {
    try {
      baseline.current = new Set((await readIds()).map(String))
    } catch {
      baseline.current = null // Unverifiable. check() will say so instead of guessing.
    }
    setReady(true)
  }, [readIds])

  const check = useCallback(
    async (match: CreationMatch): Promise<GuardResult> => {
      setResult({ kind: 'checking' })
      let next: GuardResult
      try {
        if (!baseline.current) throw new Error('No snapshot of your agreements was taken before sending')
        if (!client || !address || !FLOW_ADDRESS) throw new Error('Wallet or network is not ready')
        const known = baseline.current
        const fresh = (await readIds()).filter((id) => !known.has(String(id)))
        let duplicate: bigint | null = null
        for (const id of fresh) {
          const agreement = await withBackoff(() =>
            client.readContract({ address: FLOW_ADDRESS!, abi: escrowAbi, functionName: 'getAgreement', args: [id] }),
          )
          if (
            agreement.recipient.toLowerCase() === match.recipient.toLowerCase() &&
            agreement.title === match.title &&
            agreement.totalAmount === match.total
          ) {
            duplicate = id
            break
          }
        }
        if (duplicate != null) {
          next = { kind: 'duplicate', id: duplicate }
        } else {
          const [latest, pending] = await Promise.all([
            withBackoff(() => client.getTransactionCount({ address, blockTag: 'latest' })),
            withBackoff(() => client.getTransactionCount({ address, blockTag: 'pending' })),
          ])
          next = pending > latest ? { kind: 'pending' } : { kind: 'safe' }
        }
      } catch (error) {
        next = { kind: 'unknown', message: describeReadError(error) }
      }
      setResult(next)
      return next
    },
    [client, address, readIds],
  )

  return { ready, result, snapshot, check, reset: () => setResult({ kind: 'unchecked' }) }
}
