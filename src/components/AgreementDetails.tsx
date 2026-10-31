import { useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { ArrowLeft, Check, CircleDashed, Send, ThumbsUp } from 'lucide-react'
import { escrowAbi } from '@/abi/escrow'
import { ActivityFeed } from '@/components/ActivityFeed'
import { Link } from '@/components/Link'
import { TimelineLegend } from '@/components/MilestoneTimeline'
import { TxButton, TxStatus } from '@/components/TxButton'
import { AddressChip, Progress, ReadErrorNotice, Spinner, Stat, StatusBadge } from '@/components/ui'
import { useAgreement } from '@/hooks/useAgreements'
import { useFlowLogs } from '@/hooks/useFlowLogs'
import { useFlowTx } from '@/hooks/useFlowTx'
import { milestoneTone, TONE_LABEL, TONE_STYLE } from '@/lib/milestones'
import {
  AgreementStatus,
  FLOW_ADDRESS,
  FLOW_CHAIN_ID,
  USDC_ADDRESS,
  formatDate,
  usd,
  type AgreementWithMilestones,
  type Milestone,
} from '@/lib/flow'

function FundPanel({ agreement, onDone }: { agreement: AgreementWithMilestones; onDone: () => void }) {
  const { address } = useAccount()
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: FLOW_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 6000 },
  })
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && FLOW_ADDRESS ? [address, FLOW_ADDRESS] : undefined,
    chainId: FLOW_CHAIN_ID,
    query: { enabled: Boolean(address && FLOW_ADDRESS), refetchInterval: 6000 },
  })

  const approveTx = useFlowTx(() => void allowance.refetch(), {
    key: `allow:${agreement.id}`,
    label: `Approve USDC for agreement #${agreement.id}`,
    href: `/agreement/${agreement.id}`,
  })
  const fundTx = useFlowTx(
    () => {
      void balance.refetch()
      void allowance.refetch()
      onDone()
    },
    { key: `fund:${agreement.id}`, label: `Fund agreement #${agreement.id}`, href: `/agreement/${agreement.id}` },
  )

  const total = agreement.totalAmount
  const hasAllowance = (allowance.data ?? 0n) >= total
  const insufficient = balance.data != null && balance.data < total

  const approve = () => {
    approveTx.tx.reset()
    approveTx
      .write({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [FLOW_ADDRESS!, total],
        chainId: FLOW_CHAIN_ID,
      })
      .catch(() => undefined)
  }
  const fund = () => {
    fundTx.tx.reset()
    fundTx
      .write({
        address: FLOW_ADDRESS!,
        abi: escrowAbi,
        functionName: 'fundAgreement',
        args: [agreement.id],
        chainId: FLOW_CHAIN_ID,
      })
      .catch(() => undefined)
  }

  return (
    <section className="surface space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Fund this agreement</h2>
        <p className="mt-1 text-sm text-muted">
          Deposit exactly {usd(total)} USDC into escrow. First approve that exact amount, then fund. Your balance:{' '}
          <span className="tabular-nums text-fg">{balance.data != null ? `${usd(balance.data)} USDC` : '…'}</span>
        </p>
      </div>
      {insufficient ? (
        <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          Your USDC balance is below {usd(total)}. Use “Get test USDC” in the Arc Studio sidebar to top up on testnet.
        </p>
      ) : null}
      <ol className="space-y-3">
        <li className="space-y-1">
          <div className="flex items-center gap-3">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${hasAllowance ? 'bg-mint/15 text-ok' : 'bg-brand/15 text-brandink'}`}>
              {hasAllowance ? <Check size={14} /> : '1'}
            </span>
            <TxButton
              label={hasAllowance ? `Approved ${usd(total)} USDC` : `Approve ${usd(total)} USDC`}
              onClick={approve}
              tx={approveTx.tx}
              variant="ghost"
              className="flex-1"
              disabled={hasAllowance || insufficient}
            />
          </div>
          <TxStatus tx={approveTx.tx} confirmedText="USDC spending approved" onRetry={approve} />
        </li>
        <li className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brandink">2</span>
            <TxButton label="Fund Agreement" onClick={fund} tx={fundTx.tx} className="flex-1" disabled={!hasAllowance || insufficient} />
          </div>
          <TxStatus tx={fundTx.tx} confirmedText="Agreement funded" onRetry={fund} />
        </li>
      </ol>
    </section>
  )
}

function RecipientBalance({ recipient }: { recipient: Address }) {
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [recipient],
    chainId: FLOW_CHAIN_ID,
    query: { refetchInterval: 6000 },
  })
  return (
    <span>
      Recipient wallet balance{' '}
      <span className="tabular-nums text-fg">{balance.data != null ? `${usd(balance.data)} USDC` : '…'}</span>
    </span>
  )
}

function MilestoneRow({
  agreement,
  milestone,
  index,
  isPayer,
  isRecipient,
  onDone,
}: {
  agreement: AgreementWithMilestones
  milestone: Milestone
  index: number
  isPayer: boolean
  isRecipient: boolean
  onDone: () => void
}) {
  const { address } = useAccount()
  const approveTx = useFlowTx(onDone, {
    key: `approve-milestone:${agreement.id}:${index}`,
    label: `Approve milestone ${index + 1} of agreement #${agreement.id}`,
    href: `/agreement/${agreement.id}`,
  })
  const releaseTx = useFlowTx(onDone, {
    key: `release-milestone:${agreement.id}:${index}`,
    label: `Release milestone ${index + 1} of agreement #${agreement.id}`,
    href: `/agreement/${agreement.id}`,
  })
  const funded = agreement.status === AgreementStatus.Funded

  const run = (kind: 'approve' | 'release') => {
    const t = kind === 'approve' ? approveTx : releaseTx
    t.tx.reset()
    t.write({
      address: FLOW_ADDRESS!,
      abi: escrowAbi,
      functionName: kind === 'approve' ? 'approveMilestone' : 'releaseMilestone',
      args: [agreement.id, BigInt(index)],
      chainId: FLOW_CHAIN_ID,
    }).catch(() => undefined)
  }

  const tone = milestoneTone(agreement, milestone, address)
  const state = milestone.released ? 'Released' : milestone.approved ? 'Approved' : tone === 'attention' ? 'Needs your approval' : 'Pending approval'
  const canApprove = funded && isPayer && !milestone.approved
  const canRelease = funded && (isPayer || isRecipient) && milestone.approved && !milestone.released

  return (
    <li className="p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <span
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${TONE_STYLE[tone].soft}`}
          title={TONE_LABEL[tone]}
        >
          {milestone.released ? <Check size={15} /> : milestone.approved ? <ThumbsUp size={14} /> : <CircleDashed size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-fg">{index + 1}. {milestone.title}</p>
              {milestone.description ? <p className="mt-0.5 text-pretty text-sm text-muted">{milestone.description}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-semibold tabular-nums">{usd(milestone.amount)}</p>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${TONE_STYLE[tone].text}`}>{state}</p>
            </div>
          </div>
          {canApprove || canRelease ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {canApprove ? <TxButton label="Approve Milestone" onClick={() => run('approve')} tx={approveTx.tx} variant="ghost" icon={<ThumbsUp size={15} />} /> : null}
              {canRelease ? <TxButton label="Release Milestone" onClick={() => run('release')} tx={releaseTx.tx} icon={<Send size={15} />} /> : null}
            </div>
          ) : null}
          <TxStatus tx={approveTx.tx} confirmedText="Milestone approved" onRetry={() => run('approve')} />
          <TxStatus tx={releaseTx.tx} confirmedText="Payment released to recipient" onRetry={() => run('release')} />
        </div>
      </div>
    </li>
  )
}

function CancelButton({ agreement, onDone }: { agreement: AgreementWithMilestones; onDone: () => void }) {
  const { write, tx } = useFlowTx(onDone, {
    key: `cancel:${agreement.id}`,
    label: `Cancel agreement #${agreement.id}`,
    href: `/agreement/${agreement.id}`,
  })
  const cancel = () => {
    tx.reset()
    write({
      address: FLOW_ADDRESS!,
      abi: escrowAbi,
      functionName: 'cancelAgreement',
      args: [agreement.id],
      chainId: FLOW_CHAIN_ID,
    }).catch(() => undefined)
  }
  return (
    <div>
      <TxButton label="Cancel agreement" variant="ghost" tx={tx} onClick={cancel} />
      <TxStatus tx={tx} confirmedText="Agreement cancelled" onRetry={cancel} />
    </div>
  )
}

export function AgreementDetails({ id }: { id: bigint }) {
  const { address } = useAccount()
  const { agreement, isLoading, notFound, readFailed, errorMessage, refetch } = useAgreement(id)
  const { logs } = useFlowLogs()
  const history = useMemo(() => logs.filter((l) => l.id === id), [logs, id])

  const back = (
    <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
      <ArrowLeft size={15} /> Dashboard
    </Link>
  )

  if (isLoading) {
    return (
      <div>
        {back}
        <div className="surface flex items-center justify-center gap-3 py-20 text-sm text-muted">
          <Spinner /> Loading agreement from the chain…
        </div>
      </div>
    )
  }
  if (!agreement) {
    return (
      <div>
        {back}
        {readFailed ? (
          <ReadErrorNotice what="this agreement" message={errorMessage} onRetry={() => void refetch()} />
        ) : (
          <div className="surface px-6 py-16 text-center">
            <h2 className="font-display text-xl font-semibold">
              {notFound ? `Agreement #${id} does not exist` : 'Agreement unavailable'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {notFound
                ? 'Check the agreement number. Agreements are numbered from 1 in the order they were created.'
                : 'Nothing was returned for this agreement.'}
            </p>
          </div>
        )}
      </div>
    )
  }

  const me = address?.toLowerCase()
  const isPayer = agreement.payer.toLowerCase() === me
  const isRecipient = agreement.recipient.toLowerCase() === me
  const done = () => void refetch()

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label !mb-2">Agreement #{agreement.id.toString()}</p>
            <h1 className="text-balance font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{agreement.title}</h1>
          </div>
          <StatusBadge status={agreement.status} />
        </div>
        <div className="mt-4 flex flex-col gap-1.5 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
          <AddressChip address={agreement.payer} label={isPayer ? 'Payer (you)' : 'Payer'} />
          <AddressChip address={agreement.recipient} label={isRecipient ? 'Recipient (you)' : 'Recipient'} />
          <span>Created {formatDate(agreement.createdAt)}</span>
          <RecipientBalance recipient={agreement.recipient} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={usd(agreement.totalAmount)} sub="USDC" />
        <Stat label="Funded" value={usd(agreement.fundedAmount)} sub="USDC deposited" />
        <Stat label="Released" value={usd(agreement.releasedAmount)} accent sub="USDC paid out" />
        <Stat label="Remaining" value={usd(agreement.remaining)} sub="USDC in escrow" />
      </section>

      {agreement.status === AgreementStatus.Created ? (
        isPayer ? (
          <>
            <FundPanel agreement={agreement} onDone={done} />
            <CancelButton agreement={agreement} onDone={done} />
          </>
        ) : (
          <p className="surface p-5 text-sm text-muted">Waiting for the payer to fund this agreement before milestones can be approved.</p>
        )
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Milestones</h2>
          <span className="text-xs tabular-nums text-muted">
            {agreement.releasedCount} of {agreement.milestoneCount} released
          </span>
        </div>
        <div className="surface overflow-hidden">
          <div className="space-y-3 p-4 pb-3 sm:px-5 sm:pt-5">
            <Progress value={agreement.releasedCount} max={agreement.milestoneCount} />
            <TimelineLegend />
          </div>
          <ul className="divide-y divide-line">
            {agreement.milestones.map((m, i) => (
              <MilestoneRow
                key={i}
                agreement={agreement}
                milestone={m}
                index={i}
                isPayer={isPayer}
                isRecipient={isRecipient}
                onDone={done}
              />
            ))}
          </ul>
        </div>
        {agreement.status === AgreementStatus.Funded && !isPayer && !isRecipient ? (
          <p className="mt-3 text-xs text-muted">Only the payer and recipient can act on this agreement.</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Transaction history</h2>
        {history.length === 0 ? (
          <p className="surface p-5 text-sm text-muted">Events appear here once they are confirmed onchain.</p>
        ) : (
          <ActivityFeed logs={history} />
        )}
      </section>
    </div>
  )
}
