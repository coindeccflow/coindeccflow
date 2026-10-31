import { useAccount } from 'wagmi'
import { useMemo, useState } from 'react'
import { ActivityFeed } from '@/components/ActivityFeed'
import { EmptyState, Spinner } from '@/components/ui'
import { useAgreementIds } from '@/hooks/useAgreements'
import { useFlowLogs } from '@/hooks/useFlowLogs'
import { FLOW_ADDRESS, addressUrl } from '@/lib/flow'

export function Activity() {
  const { address } = useAccount()
  const { logs, scannedTo, head, syncing, error } = useFlowLogs()
  const { ids } = useAgreementIds(address)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')

  const mine = useMemo(() => {
    const set = new Set(ids.map(String))
    return logs.filter((l) => set.has(l.id.toString()))
  }, [logs, ids])

  const shown = scope === 'mine' && address ? mine : logs
  const behind = head != null && scannedTo != null ? head - scannedTo : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label !mb-2">Activity</p>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Onchain events</h1>
          <p className="mt-2 text-sm text-muted">
            Read directly from the escrow contract
            {FLOW_ADDRESS ? (
              <>
                {' '}
                (
                <a href={addressUrl(FLOW_ADDRESS)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  view contract
                </a>
                )
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-card p-1 text-sm">
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`min-h-[36px] rounded-lg px-4 font-medium transition ${scope === s ? 'bg-raised text-fg' : 'text-muted'}`}
            >
              {s === 'mine' ? 'My agreements' : 'All activity'}
            </button>
          ))}
        </div>
      </div>

      {syncing && logs.length === 0 ? (
        <div className="surface flex items-center justify-center gap-3 py-16 text-sm text-muted">
          <Spinner /> Reading events from the chain…
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title="No activity yet"
          body={
            scope === 'mine' && address
              ? 'Events for agreements you pay or receive will appear here once they are confirmed.'
              : 'No events have been emitted by the escrow contract yet.'
          }
        />
      ) : (
        <ActivityFeed logs={shown} />
      )}

      <p className="text-xs tabular-nums text-muted">
        {error ??
          (scannedTo != null && head != null
            ? behind != null && behind > 0n
              ? `Indexing: scanned to block ${scannedTo} of ${head} (${behind} blocks remaining).`
              : `Up to date at block ${scannedTo}.`
            : null)}
      </p>
    </div>
  )
}
