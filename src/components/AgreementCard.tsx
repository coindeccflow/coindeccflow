import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Link } from '@/components/Link'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import { StatusBadge } from '@/components/ui'
import { shortAddress, usd, type AgreementWithMilestones } from '@/lib/flow'

/** Agreement summary card: parties, money, status and milestone timeline. All values come from the contract. */
export function AgreementCard({ agreement, account }: { agreement: AgreementWithMilestones; account?: string }) {
  const isPayer = Boolean(account) && agreement.payer.toLowerCase() === account?.toLowerCase()
  const counterparty = isPayer ? agreement.recipient : agreement.payer
  const RoleIcon = isPayer ? ArrowUpRight : ArrowDownLeft

  return (
    <Link
      to={`/agreement/${agreement.id}`}
      className="surface group block p-5 transition hover:-translate-y-0.5 hover:border-brand/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <RoleIcon size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display text-[17px] font-semibold text-fg">{agreement.title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              #{agreement.id.toString()} · {isPayer ? 'To' : 'From'}{' '}
              <span className="font-mono tabular-nums">{shortAddress(counterparty)}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={agreement.status} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: agreement.totalAmount, strong: true },
          { label: 'Released', value: agreement.releasedAmount, ok: true },
          { label: 'Remaining', value: agreement.remaining },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{item.label}</dt>
            <dd
              className={`mt-1 truncate font-display text-[17px] font-semibold tabular-nums ${item.ok ? 'text-ok' : 'text-fg'}`}
            >
              {usd(item.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-muted">USDC</p>

      <div className="mt-4">
        <MilestoneTimeline agreement={agreement} viewer={account} />
      </div>
    </Link>
  )
}
