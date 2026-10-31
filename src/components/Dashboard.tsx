import { useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { useModal } from 'connectkit'
import { erc20Abi } from 'viem'
import { ArrowRight, CheckCheck, CircleDollarSign, Clock3, Layers, Plus, Vault } from 'lucide-react'
import { ActivityFeed } from '@/components/ActivityFeed'
import { AgreementCard } from '@/components/AgreementCard'
import { Link } from '@/components/Link'
import { EmptyState, ReadErrorNotice, Stat } from '@/components/ui'
import { useFlowLogs } from '@/hooks/useFlowLogs'
import { useMyAgreements } from '@/hooks/useMyAgreements'
import { AgreementStatus, FLOW_ADDRESS, FLOW_CHAIN, FLOW_CHAIN_ID, USDC_ADDRESS, usd } from '@/lib/flow'
import { countMilestones } from '@/lib/milestones'

const percent = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 100n) / whole))

export function Dashboard() {
  const { address, isConnected, chainId } = useAccount()
  const { setOpen } = useModal()
  const { ids, agreements, loading, readFailed, errorMessage, retry } = useMyAgreements()
  const { logs } = useFlowLogs()

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: FLOW_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  })

  const stats = useMemo(() => {
    let funded = 0n
    let released = 0n
    let escrowed = 0n
    let active = 0
    for (const a of agreements) {
      funded += a.fundedAmount
      released += a.releasedAmount
      escrowed += a.remaining
      if (a.status === AgreementStatus.Created || a.status === AgreementStatus.Funded) active += 1
    }
    return { funded, released, escrowed, active, milestones: countMilestones(agreements) }
  }, [agreements])

  const myIds = useMemo(() => new Set(ids.map(String)), [ids])
  const recent = useMemo(() => logs.filter((l) => myIds.has(l.id.toString())).slice(0, 5), [logs, myIds])

  if (!isConnected) {
    return (
      <section className="surface relative overflow-hidden px-6 py-14 text-center sm:py-20">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(50%_70%_at_50%_0%,rgb(var(--c-mint)/0.12),transparent)]"
        />
        <div className="relative">
          <p className="label !mb-3 text-ok">Milestone payments on Arc</p>
          <h1 className="mx-auto max-w-xl text-balance font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Pay when the work is done, in USDC.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-muted">
            Lock USDC in a smart contract, approve each milestone, and release payment onchain. Noncustodial, with no
            admin keys.
          </p>
          <button type="button" className="btn-primary mt-8" onClick={() => setOpen(true)}>
            Connect wallet to start
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label !mb-2">Overview</p>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Your payments</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-mono text-[13px] text-fg">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${chainId === FLOW_CHAIN_ID ? 'bg-mint' : 'bg-warn'}`} />
              {chainId === FLOW_CHAIN_ID ? FLOW_CHAIN.name : 'Wrong network'}
            </span>
            <span className="tabular-nums">
              Balance{' '}
              <span className="font-medium text-fg">
                {balance.data != null ? `${usd(balance.data)} USDC` : balance.isLoading ? '…' : '—'}
              </span>
            </span>
          </p>
        </div>
        <Link to="/create" className="btn-primary shadow-glow">
          <Plus size={16} /> Create Agreement
        </Link>
      </section>

      <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total escrowed USDC"
          icon={Vault}
          value={usd(stats.escrowed)}
          loading={loading}
          progress={percent(stats.escrowed, stats.funded)}
          sub={`of ${usd(stats.funded)} USDC funded`}
        />
        <Stat
          label="Active agreements"
          icon={Layers}
          value={stats.active}
          loading={loading}
          progress={agreements.length === 0 ? 0 : Math.round((stats.active / agreements.length) * 100)}
          sub={`${agreements.length} total across your wallet`}
        />
        <Stat
          label="Total released USDC"
          icon={CircleDollarSign}
          accent
          value={usd(stats.released)}
          loading={loading}
          progress={percent(stats.released, stats.funded)}
          sub="Paid out to recipients"
        />
        <Stat
          label="Pending milestones"
          icon={Clock3}
          value={stats.milestones.pending}
          loading={loading}
          progress={
            stats.milestones.pending === 0
              ? 0
              : Math.round((stats.milestones.readyToRelease / stats.milestones.pending) * 100)
          }
          sub={`${stats.milestones.awaitingApproval} awaiting approval · ${stats.milestones.readyToRelease} ready to release`}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Agreements</h2>
          {agreements.length > 4 ? (
            <Link to="/agreements" className="flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
        {!FLOW_ADDRESS ? null : readFailed ? (
          <ReadErrorNotice what="agreements" message={errorMessage} onRetry={retry} />
        ) : loading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((n) => (
              <div key={n} className="surface h-48 animate-pulse" />
            ))}
          </div>
        ) : agreements.length === 0 ? (
          <EmptyState
            title="No agreements yet"
            body="Create your first milestone agreement, fund it with USDC, and release payments as work is approved."
            action={
              <Link to="/create" className="btn-primary">
                <Plus size={16} /> Create Agreement
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {agreements.slice(0, 4).map((a) => (
              <AgreementCard key={a.id.toString()} agreement={a} account={address} />
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <CheckCheck size={17} className="text-brand" aria-hidden /> Recent activity
            </h2>
            <Link to="/activity" className="flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <ActivityFeed logs={recent} />
        </section>
      ) : null}
    </div>
  )
}
