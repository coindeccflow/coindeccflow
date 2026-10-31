import { useMemo } from 'react'
import { useModal } from 'connectkit'
import { ChevronRight } from 'lucide-react'
import { Link } from '@/components/Link'
import { TimelineLegend } from '@/components/MilestoneTimeline'
import { EmptyState, ReadErrorNotice } from '@/components/ui'
import { useMyAgreements } from '@/hooks/useMyAgreements'
import { AgreementStatus, usd, type AgreementWithMilestones, type Milestone } from '@/lib/flow'
import { milestoneTone, TONE_LABEL, TONE_STYLE, type MilestoneTone } from '@/lib/milestones'

interface Item {
  agreement: AgreementWithMilestones
  milestone: Milestone
  index: number
  tone: MilestoneTone
}

function Row({ item }: { item: Item }) {
  const style = TONE_STYLE[item.tone]
  return (
    <li>
      <Link
        to={`/agreement/${item.agreement.id}`}
        className="flex min-h-[64px] items-center gap-3.5 px-4 py-3 transition hover:bg-raised sm:px-5"
      >
        <span className={`h-9 w-1 shrink-0 rounded-full ${style.fill}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {item.index + 1}. {item.milestone.title}
          </p>
          <p className="truncate text-xs text-muted">
            #{item.agreement.id.toString()} · {item.agreement.title}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-base font-semibold tabular-nums">{usd(item.milestone.amount)}</p>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${style.text}`}>{TONE_LABEL[item.tone]}</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  )
}

function Section({ title, hint, items }: { title: string; hint: string; items: Item[] }) {
  if (items.length === 0) return null
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-xs tabular-nums text-muted">{items.length}</span>
      </div>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <ul className="surface divide-y divide-line overflow-hidden">
        {items.map((item) => (
          <Row key={`${item.agreement.id}-${item.index}`} item={item} />
        ))}
      </ul>
    </section>
  )
}

export function MilestonesPage() {
  const { address, isConnected, agreements, loading, readFailed, errorMessage, retry } = useMyAgreements()
  const { setOpen } = useModal()

  const groups = useMemo(() => {
    const me = address?.toLowerCase()
    const attention: Item[] = []
    const ready: Item[] = []
    const waiting: Item[] = []
    const done: Item[] = []
    for (const agreement of agreements) {
      if (agreement.status === AgreementStatus.Cancelled) continue
      agreement.milestones.forEach((milestone, index) => {
        const tone = milestoneTone(agreement, milestone, address)
        const item = { agreement, milestone, index, tone }
        if (milestone.released) done.push(item)
        else if (agreement.status !== AgreementStatus.Funded) return
        else if (milestone.approved) ready.push(item)
        else if (agreement.payer.toLowerCase() === me) attention.push(item)
        else waiting.push(item)
      })
    }
    return { attention, ready, waiting, done }
  }, [agreements, address])

  const nothing =
    groups.attention.length + groups.ready.length + groups.waiting.length + groups.done.length === 0

  return (
    <div className="space-y-8">
      <div>
        <p className="label !mb-2">Milestones</p>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Milestone queue</h1>
        <p className="mt-2 text-sm text-muted">What needs approval, what is ready to pay out, and what is done.</p>
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect your wallet"
          body="Milestones are found by wallet address. Connect to see the ones on your agreements."
          action={
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              Connect wallet
            </button>
          }
        />
      ) : readFailed ? (
        <ReadErrorNotice what="milestones" message={errorMessage} onRetry={retry} />
      ) : loading ? (
        <div className="surface h-48 animate-pulse" />
      ) : nothing ? (
        <EmptyState
          title="No active milestones"
          body="Milestones appear here once an agreement is funded. Unfunded agreements wait for the payer to deposit USDC."
          action={
            <Link to="/agreements" className="btn-ghost">
              View agreements
            </Link>
          }
        />
      ) : (
        <>
          <TimelineLegend />
          <Section title="Needs your approval" hint="You are the payer. Approve a milestone once the work is delivered." items={groups.attention} />
          <Section title="Ready to release" hint="Approved by the payer. The payer or recipient can release the payment." items={groups.ready} />
          <Section title="Waiting for the payer" hint="You are the recipient. These milestones are not approved yet." items={groups.waiting} />
          <Section title="Completed" hint="Released to the recipient onchain." items={groups.done} />
        </>
      )}
    </div>
  )
}
