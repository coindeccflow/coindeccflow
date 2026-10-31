import { useMemo, useState } from 'react'
import { useModal } from 'connectkit'
import { Plus } from 'lucide-react'
import { AgreementCard } from '@/components/AgreementCard'
import { Link } from '@/components/Link'
import { TimelineLegend } from '@/components/MilestoneTimeline'
import { EmptyState, ReadErrorNotice } from '@/components/ui'
import { useMyAgreements } from '@/hooks/useMyAgreements'
import { AgreementStatus } from '@/lib/flow'

type Filter = 'all' | 'active' | 'completed' | 'cancelled'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export function AgreementsPage() {
  const { address, isConnected, agreements, loading, readFailed, errorMessage, retry } = useMyAgreements()
  const { setOpen } = useModal()
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      all: agreements.length,
      active: agreements.filter((a) => a.status === AgreementStatus.Created || a.status === AgreementStatus.Funded).length,
      completed: agreements.filter((a) => a.status === AgreementStatus.Completed).length,
      cancelled: agreements.filter((a) => a.status === AgreementStatus.Cancelled).length,
    }),
    [agreements],
  )

  const shown = agreements.filter((a) => {
    if (filter === 'active') return a.status === AgreementStatus.Created || a.status === AgreementStatus.Funded
    if (filter === 'completed') return a.status === AgreementStatus.Completed
    if (filter === 'cancelled') return a.status === AgreementStatus.Cancelled
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label !mb-2">Agreements</p>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">All agreements</h1>
          <p className="mt-2 text-sm text-muted">Agreements you pay or receive, read live from the escrow contract.</p>
        </div>
        <Link to="/create" className="btn-primary shadow-glow">
          <Plus size={16} /> Create Agreement
        </Link>
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect your wallet"
          body="Your agreements are found by wallet address. Connect to see the ones you pay or receive."
          action={
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              Connect wallet
            </button>
          }
        />
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist" aria-label="Filter agreements">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                  filter === f.id ? 'border-brand/50 bg-brand/10 text-fg' : 'border-line bg-card text-muted hover:text-fg'
                }`}
              >
                {f.label}
                <span className="rounded-full bg-muted/15 px-1.5 text-xs tabular-nums">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {readFailed ? (
            <ReadErrorNotice what="agreements" message={errorMessage} onRetry={retry} />
          ) : loading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {[0, 1].map((n) => (
                <div key={n} className="surface h-48 animate-pulse" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              title={agreements.length === 0 ? 'No agreements yet' : 'Nothing in this view'}
              body={
                agreements.length === 0
                  ? 'Create your first milestone agreement to get started.'
                  : 'No agreements match this filter.'
              }
              action={
                agreements.length === 0 ? (
                  <Link to="/create" className="btn-primary">
                    <Plus size={16} /> Create Agreement
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <TimelineLegend />
              <div className="grid gap-3 lg:grid-cols-2">
                {shown.map((a) => (
                  <AgreementCard key={a.id.toString()} agreement={a} account={address} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
