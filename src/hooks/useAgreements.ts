import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { escrowAbi } from '@/abi/escrow'
import {
  FLOW_ADDRESS,
  FLOW_CHAIN_ID,
  describeReadError,
  toAgreement,
  type AgreementWithMilestones,
  type RawAgreement,
  type RawMilestone,
} from '@/lib/flow'

const REFETCH_MS = 6000
/** Transient RPC failures (rate limits, dropped requests) are retried with backoff before any error is shown. */
const RETRY = { retry: 3, retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) }

/** Agreement ids where the account is payer or recipient, newest first. */
export function useAgreementIds(account: Address | undefined) {
  const enabled = Boolean(FLOW_ADDRESS && account)
  const query = useReadContracts({
    contracts: [
      {
        address: FLOW_ADDRESS,
        abi: escrowAbi,
        functionName: 'getAgreementIdsByPayer',
        args: account ? [account] : undefined,
        chainId: FLOW_CHAIN_ID,
      },
      {
        address: FLOW_ADDRESS,
        abi: escrowAbi,
        functionName: 'getAgreementIdsByRecipient',
        args: account ? [account] : undefined,
        chainId: FLOW_CHAIN_ID,
      },
    ],
    query: { enabled, refetchInterval: REFETCH_MS, ...RETRY },
  })

  const ids = useMemo(() => {
    const set = new Set<bigint>()
    for (const entry of query.data ?? []) {
      if (entry.status === 'success') for (const id of entry.result) set.add(id)
    }
    return [...set].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
  }, [query.data])

  const entries = query.data ?? []
  const anySuccess = entries.some((entry) => entry.status === 'success')
  const failedEntry = entries.find((entry) => entry.status === 'failure')
  // A read counts as failed only when nothing could be read. An empty result is a valid answer, not an error.
  const readFailed = enabled && !anySuccess && (query.isError || Boolean(failedEntry))
  const cause = query.error ?? (failedEntry?.status === 'failure' ? failedEntry.error : undefined)
  return {
    ids,
    isLoading: enabled && query.isLoading,
    /** True when the contract could not be read (RPC or wrong address), as opposed to "no agreements". */
    readFailed,
    errorMessage: readFailed ? describeReadError(cause) : null,
    refetch: query.refetch,
  }
}

/** Full agreement data (with milestones) for a list of ids. */
export function useAgreementsByIds(ids: readonly bigint[]) {
  const enabled = Boolean(FLOW_ADDRESS) && ids.length > 0
  const query = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: FLOW_ADDRESS, abi: escrowAbi, functionName: 'getAgreement', args: [id], chainId: FLOW_CHAIN_ID } as const,
      { address: FLOW_ADDRESS, abi: escrowAbi, functionName: 'getMilestones', args: [id], chainId: FLOW_CHAIN_ID } as const,
    ]),
    query: { enabled, refetchInterval: REFETCH_MS, ...RETRY },
  })

  const agreements = useMemo(() => {
    const out: AgreementWithMilestones[] = []
    const data = query.data ?? []
    for (let i = 0; i < ids.length; i += 1) {
      const head = data[i * 2]
      const milestones = data[i * 2 + 1]
      if (head?.status === 'success' && milestones?.status === 'success') {
        out.push(
          toAgreement(head.result as RawAgreement, milestones.result as readonly RawMilestone[]),
        )
      }
    }
    return out
  }, [query.data, ids])

  const data = query.data ?? []
  const failedEntry = data.find((entry) => entry.status === 'failure')
  const readFailed = enabled && agreements.length === 0 && (query.isError || Boolean(failedEntry))
  const cause = query.error ?? (failedEntry?.status === 'failure' ? failedEntry.error : undefined)
  return {
    agreements,
    isLoading: enabled && query.isLoading,
    readFailed,
    errorMessage: readFailed ? describeReadError(cause) : null,
    refetch: query.refetch,
  }
}

/**
 * One agreement by id. `notFound` is true only when the contract itself reports
 * AgreementNotFound. An RPC failure is reported as `readFailed` instead.
 */
export function useAgreement(id: bigint) {
  const enabled = Boolean(FLOW_ADDRESS)
  const query = useReadContracts({
    contracts: [
      { address: FLOW_ADDRESS, abi: escrowAbi, functionName: 'getAgreement', args: [id], chainId: FLOW_CHAIN_ID },
      { address: FLOW_ADDRESS, abi: escrowAbi, functionName: 'getMilestones', args: [id], chainId: FLOW_CHAIN_ID },
    ],
    query: { enabled, refetchInterval: REFETCH_MS, ...RETRY },
  })

  const [head, milestones] = query.data ?? []
  const agreement =
    head?.status === 'success' && milestones?.status === 'success'
      ? toAgreement(head.result, milestones.result)
      : undefined
  const notFound = head?.status === 'failure' && head.error.message.includes('AgreementNotFound')
  const readFailed = !agreement && !notFound && (head?.status === 'failure' || query.isError)
  const cause = query.error ?? (head?.status === 'failure' ? head.error : undefined)

  return {
    agreement,
    isLoading: enabled && query.isLoading,
    notFound,
    readFailed,
    errorMessage: readFailed ? describeReadError(cause) : null,
    refetch: query.refetch,
  }
}
