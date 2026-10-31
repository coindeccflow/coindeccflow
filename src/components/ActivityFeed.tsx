import { ArrowUpRight, CheckCheck, CircleCheck, FilePlus2, Landmark, XCircle, type LucideIcon } from 'lucide-react'
import { ExternalLink } from 'lucide-react'
import { Link } from '@/components/Link'
import { useBlockTimes, type FlowEventName, type FlowLog } from '@/hooks/useFlowLogs'
import { shortAddress, txUrl, usd } from '@/lib/flow'

const META: Record<FlowEventName, { label: string; icon: LucideIcon; tone: string }> = {
  AgreementCreated: { label: 'Agreement created', icon: FilePlus2, tone: 'text-brandink bg-brand/10' },
  AgreementFunded: { label: 'Agreement funded', icon: Landmark, tone: 'text-brandink bg-brand/10' },
  MilestoneApproved: { label: 'Milestone approved', icon: CircleCheck, tone: 'text-ok bg-mint/10' },
  MilestoneReleased: { label: 'Payment released', icon: ArrowUpRight, tone: 'text-ok bg-mint/10' },
  AgreementCompleted: { label: 'Agreement completed', icon: CheckCheck, tone: 'text-ok bg-mint/10' },
  AgreementCancelled: { label: 'Agreement cancelled', icon: XCircle, tone: 'text-muted bg-muted/10' },
}

function detail(log: FlowLog): string {
  switch (log.event) {
    case 'AgreementCreated':
      return `${log.title ?? ''} · ${usd(log.amount ?? 0n)} USDC`
    case 'AgreementFunded':
      return `${usd(log.amount ?? 0n)} USDC escrowed`
    case 'MilestoneApproved':
      return `Milestone ${Number(log.index ?? 0n) + 1}`
    case 'MilestoneReleased':
      return `${usd(log.amount ?? 0n)} USDC to ${shortAddress(log.recipient ?? '')} · Milestone ${Number(log.index ?? 0n) + 1}`
    case 'AgreementCompleted':
      return `${usd(log.amount ?? 0n)} USDC settled in total`
    default:
      return 'No funds moved'
  }
}

export function ActivityFeed({ logs }: { logs: FlowLog[] }) {
  const timeOf = useBlockTimes(logs.slice(0, 60).map((l) => l.blockNumber))
  return (
    <ul className="surface divide-y divide-line overflow-hidden">
      {logs.slice(0, 60).map((log) => {
        const meta = META[log.event]
        const Icon = meta.icon
        const seconds = timeOf(log.blockNumber)
        return (
          <li key={log.key} className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${meta.tone}`}>
              <Icon size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-fg">
                  {meta.label}{' '}
                  <Link to={`/agreement/${log.id}`} className="text-brand hover:underline">
                    #{log.id.toString()}
                  </Link>
                </p>
                <span className="text-xs tabular-nums text-muted">
                  {seconds ? new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : `Block ${log.blockNumber}`}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted">{detail(log)}</p>
              <a
                href={txUrl(log.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted transition hover:text-brand"
              >
                {log.txHash.slice(0, 10)}…{log.txHash.slice(-8)} <ExternalLink size={10} />
              </a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
