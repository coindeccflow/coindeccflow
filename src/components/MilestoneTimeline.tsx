import { milestoneTone, TONE_LABEL, TONE_STYLE } from '@/lib/milestones'
import type { AgreementWithMilestones } from '@/lib/flow'

/** Compact segmented timeline: one segment per milestone, colored by state. */
export function MilestoneTimeline({ agreement, viewer }: { agreement: AgreementWithMilestones; viewer?: string }) {
  return (
    <div>
      <ol className="flex gap-1.5" aria-label="Milestone progress">
        {agreement.milestones.map((m, i) => {
          const tone = milestoneTone(agreement, m, viewer)
          return (
            <li
              key={i}
              title={`${i + 1}. ${m.title}: ${TONE_LABEL[tone]}`}
              className={`h-2 min-w-0 flex-1 rounded-full transition-colors ${TONE_STYLE[tone].fill}`}
            >
              <span className="sr-only">
                Milestone {i + 1}, {m.title}: {TONE_LABEL[tone]}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-xs tabular-nums text-muted">
        {agreement.releasedCount} of {agreement.milestoneCount} milestones released
      </p>
    </div>
  )
}

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {(['done', 'active', 'attention', 'pending'] as const).map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TONE_STYLE[tone].fill}`} aria-hidden />
          {TONE_LABEL[tone] === 'Needs your approval' ? 'Needs attention' : TONE_LABEL[tone]}
        </li>
      ))}
    </ul>
  )
}
