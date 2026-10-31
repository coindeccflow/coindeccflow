import type { AgreementWithMilestones, Milestone } from '@/lib/flow'
import { AgreementStatus } from '@/lib/flow'

/** done = released, active = approved and ready to release, attention = needs the viewer's approval, pending = waiting. */
export type MilestoneTone = 'done' | 'active' | 'attention' | 'pending'

export const TONE_LABEL: Record<MilestoneTone, string> = {
  done: 'Completed',
  active: 'Ready to release',
  attention: 'Needs your approval',
  pending: 'Pending',
}

/** Classes that work in both themes (all colors come from theme tokens). */
export const TONE_STYLE: Record<MilestoneTone, { fill: string; text: string; soft: string }> = {
  done: { fill: 'bg-mint', text: 'text-ok', soft: 'bg-mint/15 text-ok' },
  active: { fill: 'bg-brand', text: 'text-brandink', soft: 'bg-brand/15 text-brandink' },
  attention: { fill: 'bg-warn', text: 'text-warn', soft: 'bg-warn/15 text-warn' },
  pending: { fill: 'bg-muted/35', text: 'text-muted', soft: 'bg-muted/15 text-muted' },
}

export function milestoneTone(agreement: AgreementWithMilestones, milestone: Milestone, viewer?: string): MilestoneTone {
  if (milestone.released) return 'done'
  if (agreement.status !== AgreementStatus.Funded) return 'pending'
  if (milestone.approved) return 'active'
  const isPayer = Boolean(viewer) && agreement.payer.toLowerCase() === viewer?.toLowerCase()
  return isPayer ? 'attention' : 'pending'
}

/** Counts used by the dashboard and milestones page, derived only from onchain agreement data. */
export function countMilestones(agreements: readonly AgreementWithMilestones[]) {
  let awaitingApproval = 0
  let readyToRelease = 0
  for (const a of agreements) {
    if (a.status !== AgreementStatus.Funded) continue
    for (const m of a.milestones) {
      if (m.released) continue
      if (m.approved) readyToRelease += 1
      else awaitingApproval += 1
    }
  }
  return { awaitingApproval, readyToRelease, pending: awaitingApproval + readyToRelease }
}
