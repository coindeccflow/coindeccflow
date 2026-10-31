import { useAccount } from 'wagmi'
import { useAgreementIds, useAgreementsByIds } from '@/hooks/useAgreements'

/** Every agreement the connected wallet pays or receives, read live from the contract. */
export function useMyAgreements() {
  const { address, isConnected } = useAccount()
  const idsQuery = useAgreementIds(address)
  const dataQuery = useAgreementsByIds(idsQuery.ids)
  const readFailed = idsQuery.readFailed || dataQuery.readFailed
  return {
    address,
    isConnected,
    ids: idsQuery.ids,
    agreements: dataQuery.agreements,
    loading: idsQuery.isLoading || dataQuery.isLoading,
    readFailed,
    errorMessage: idsQuery.errorMessage ?? dataQuery.errorMessage,
    retry: () => {
      void idsQuery.refetch()
      void dataQuery.refetch()
    },
  }
}
