import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { getAddress, isAddress, parseEventLogs, zeroAddress } from 'viem'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Plus, ShieldCheck, Sparkles, Trash2, XCircle } from 'lucide-react'
import { escrowAbi } from '@/abi/escrow'
import { TxButton, TxStatus } from '@/components/TxButton'
import { Spinner } from '@/components/ui'
import { useCreationGuard } from '@/hooks/useCreationGuard'
import { useFlowTx } from '@/hooks/useFlowTx'
import { navigate } from '@/hooks/useRoute'
import { FLOW_ADDRESS, FLOW_CHAIN, FLOW_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS_ONCHAIN, shortAddress, txUrl, usd } from '@/lib/flow'
import { formatUnitsExact, parseAmount } from '@/onchain-money'
import { isConfirmedWalletRejection } from '@/lib/txErrors'

interface DraftMilestone {
  title: string
  description: string
  amount: string
}

const STEPS = ['Details', 'Recipient', 'Milestones', 'Review', 'Confirm'] as const
const MAX_MILESTONES = 20
const byteLength = (value: string) => new TextEncoder().encode(value).length

function tryParse(value: string): bigint | null {
  if (!value.trim()) return null
  try {
    return parseAmount(FLOW_CHAIN_ID, value).raw
  } catch {
    return null
  }
}

function Stepper({ step }: { step: number }) {
  return (
    <div>
      <ol className="flex items-center" aria-label="Progress">
        {STEPS.map((name, i) => {
          const done = i < step
          const current = i === step
          return (
            <li key={name} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <span
                aria-current={current ? 'step' : undefined}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                  done
                    ? 'bg-mint text-[#04101F]'
                    : current
                      ? 'bg-brand text-onbrand shadow-glow'
                      : 'border border-line bg-raised text-muted'
                }`}
              >
                {done ? <Check size={14} aria-hidden /> : i + 1}
              </span>
              {i < STEPS.length - 1 ? (
                <span className={`mx-1.5 h-0.5 flex-1 rounded-full transition-colors sm:mx-2 ${done ? 'bg-mint' : 'bg-muted/20'}`} aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Step {step + 1} of {STEPS.length} · <span className="text-fg">{STEPS[step]}</span>
      </p>
    </div>
  )
}

function ErrorList({ errors, show }: { errors: string[]; show: boolean }) {
  if (!show || errors.length === 0) return null
  return (
    <ul className="space-y-1 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn" role="alert">
      {errors.slice(0, 4).map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="surface space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function RetryCheck({ result }: { result: ReturnType<typeof useCreationGuard>['result'] }) {
  let text: ReactNode = 'Checking the network for an agreement that may already have been created…'
  let tone = 'text-muted'
  if (result.kind === 'safe') {
    text = 'Checked onchain: no matching agreement was created and no transaction from your wallet is pending. It is safe to try again.'
    tone = 'text-ok'
  } else if (result.kind === 'duplicate') {
    text = `An agreement with these exact details already exists onchain (#${result.id}). Do not create it again.`
    tone = 'text-warn'
  } else if (result.kind === 'pending') {
    text = 'A transaction from your wallet is still pending. Wait for it to finish, then check again. Retrying now could create a duplicate.'
    tone = 'text-warn'
  } else if (result.kind === 'unknown') {
    text = `Could not verify whether an agreement was created (${result.message}). Check again, or review your wallet history before creating a new one.`
    tone = 'text-warn'
  }
  return (
    <p className={`flex items-start gap-2 text-xs ${tone}`} role="status">
      {result.kind === 'checking' || result.kind === 'unchecked' ? <Spinner size={12} /> : <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden />}
      <span>{text}</span>
    </p>
  )
}

export function CreateAgreement() {
  const { address } = useAccount()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [recipient, setRecipient] = useState('')
  const [total, setTotal] = useState('')
  const [milestones, setMilestones] = useState<DraftMilestone[]>([{ title: '', description: '', amount: '' }])

  const guard = useCreationGuard()

  const { write, tx } = useFlowTx(
    (receipt) => {
        const [created] = parseEventLogs({ abi: escrowAbi, eventName: 'AgreementCreated', logs: receipt.logs })
      if (created) navigate(`/agreement/${created.args.id}`)
    },
    {
      key: 'create-agreement',
      label: 'Create agreement',
      href: (receipt) => {
        const [created] = parseEventLogs({ abi: escrowAbi, eventName: 'AgreementCreated', logs: receipt.logs })
        return created ? `/agreement/${created.args.id}` : undefined
      },
    },
  )

  const parsed = useMemo(() => {
    const totalRaw = tryParse(total)
    const amounts = milestones.map((m) => tryParse(m.amount))
    const allocated = amounts.reduce<bigint>((sum, a) => sum + (a ?? 0n), 0n)
    return { totalRaw, amounts, allocated }
  }, [total, milestones])

  const errors = useMemo(() => {
    const details: string[] = []
    const recipientErrors: string[] = []
    const milestoneErrors: string[] = []

    if (!title.trim()) details.push('Add an agreement title.')
    else if (byteLength(title) > 100) details.push('Title must be 100 bytes or fewer.')
    if (parsed.totalRaw == null || parsed.totalRaw <= 0n) details.push('Enter a total USDC amount (up to 6 decimals).')

    if (!isAddress(recipient)) recipientErrors.push('Enter a valid recipient wallet address.')
    else if (getAddress(recipient) === zeroAddress) recipientErrors.push('Recipient cannot be the zero address.')
    else if (address && getAddress(recipient) === address) recipientErrors.push('Recipient must be different from your wallet.')
    else if (getAddress(recipient) === USDC_ADDRESS || getAddress(recipient) === FLOW_ADDRESS) {
      recipientErrors.push('Recipient cannot be the USDC token or the escrow contract.')
    }

    milestones.forEach((m, i) => {
      const n = i + 1
      if (!m.title.trim()) milestoneErrors.push(`Milestone ${n} needs a title.`)
      else if (byteLength(m.title) > 100) milestoneErrors.push(`Milestone ${n} title must be 100 bytes or fewer.`)
      if (byteLength(m.description) > 500) milestoneErrors.push(`Milestone ${n} description must be 500 bytes or fewer.`)
      const amount = parsed.amounts[i]
      if (amount == null || amount <= 0n) milestoneErrors.push(`Milestone ${n} needs an amount greater than zero.`)
    })
    if (parsed.totalRaw != null && parsed.totalRaw > 0n && parsed.allocated !== parsed.totalRaw) {
      milestoneErrors.push('Milestone amounts must add up to the agreement total.')
    }
    return { details, recipient: recipientErrors, milestones: milestoneErrors }
  }, [title, recipient, address, parsed, milestones])

  const allErrors = [...errors.details, ...errors.recipient, ...errors.milestones]
  const stepErrors = [errors.details, errors.recipient, errors.milestones][step] ?? []
  const touched = [
    Boolean(title || total),
    Boolean(recipient),
    milestones.some((m) => m.title || m.amount || m.description),
  ][step]

  // What an onchain duplicate check compares against.
  const match = useMemo(
    () =>
      isAddress(recipient) && parsed.totalRaw != null
        ? { recipient: getAddress(recipient), title: title.trim(), total: parsed.totalRaw }
        : null,
    [recipient, title, parsed.totalRaw],
  )

  const update = (index: number, patch: Partial<DraftMilestone>) =>
    setMilestones((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const diff = parsed.totalRaw != null ? parsed.totalRaw - parsed.allocated : null

  // Before anything is sent, remember which agreements the payer already has.
  const { ready: guardReady, snapshot, check } = guard
  useEffect(() => {
    if (step === 3 && !guardReady) void snapshot()
  }, [step, guardReady, snapshot])

  // After an uncertain failure, look onchain before offering a retry.
  const uncertain = tx.phase === 'failed' && tx.info?.retry === 'check'
  useEffect(() => {
    if (uncertain && match) void check(match)
  }, [uncertain, match, check])

  const submit = () => {
    if (!FLOW_ADDRESS || allErrors.length > 0 || !isAddress(recipient)) return
    tx.reset()
    write({
      address: FLOW_ADDRESS,
      abi: escrowAbi,
      functionName: 'createAgreement',
      args: [
        getAddress(recipient),
        title.trim(),
        milestones.map((m) => m.title.trim()),
        milestones.map((m) => m.description.trim()),
        parsed.amounts.map((a) => a ?? 0n),
      ],
      chainId: FLOW_CHAIN_ID,
    }).catch(() => undefined) // The failure is classified and shown by the transaction state.
  }

  const loadDemo = () => {
    setTitle('CoindeccFlow demo agreement')
    setTotal('0.20')
    setMilestones([
      { title: 'Milestone 1', description: 'First deliverable', amount: '0.10' },
      { title: 'Milestone 2', description: 'Final deliverable', amount: '0.10' },
    ])
  }

  const splitEvenly = () => {
    if (parsed.totalRaw == null || parsed.totalRaw <= 0n) return
    const count = BigInt(milestones.length)
    const share = parsed.totalRaw / count
    setMilestones((rows) =>
      rows.map((row, i) => {
        const raw = i === rows.length - 1 ? parsed.totalRaw! - share * (count - 1n) : share
        return { ...row, amount: formatUnitsExact(raw, USDC_DECIMALS_ONCHAIN) }
      }),
    )
  }

  const confirming = step === 4
  const walletRequestDeclined = tx.phase === 'failed' && tx.info != null && isConfirmedWalletRejection(tx.info, tx.hash)
  const phases = [
    { label: walletRequestDeclined ? 'Wallet request declined' : 'Approve in your wallet', active: tx.phase === 'pending', done: ['confirming', 'confirmed'].includes(tx.phase) },
    { label: 'Confirming onchain', active: tx.phase === 'confirming', done: tx.phase === 'confirmed' },
    { label: 'Agreement created', active: false, done: tx.phase === 'confirmed' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="label !mb-2">Create Agreement</p>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">New milestone agreement</h1>
      </div>
      <Stepper step={step} />

      {step < 4 && tx.phase === 'confirming' ? (
        <p className="surface p-4 text-sm text-warn" role="status">
          A creation transaction you sent has not confirmed yet. Wait for it
          {tx.hash ? (
            <>
              , or{' '}
              <a href={txUrl(tx.hash)} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                check it on the explorer
              </a>
            </>
          ) : null}
          , before creating this agreement again.
        </p>
      ) : null}

      {step === 0 ? (
        <Panel title="Agreement details" hint="Name the agreement and set the total USDC you will lock in escrow.">
          <div className="flex justify-end">
            <button type="button" onClick={loadDemo} className="flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-ok hover:underline">
              <Sparkles size={13} /> Use 0.20 USDC demo
            </button>
          </div>
          <div>
            <label className="label" htmlFor="title">Agreement title</label>
            <input id="title" className="field" placeholder="Brand identity project" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="total">Total amount (USDC)</label>
            <input id="total" inputMode="decimal" className="field tabular-nums" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </Panel>
      ) : null}

      {step === 1 ? (
        <Panel title="Recipient wallet" hint="Funds can only ever be released to this address. It cannot be changed later.">
          <div>
            <label className="label" htmlFor="recipient">Recipient address</label>
            <input id="recipient" className="field font-mono" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
          </div>
          <p className="text-pretty rounded-xl border border-line bg-raised p-3.5 text-xs text-muted">
            Double-check the address. Release to a wallet that cannot receive USDC (for example a blocklisted address) would fail and leave the funds locked.
          </p>
        </Panel>
      ) : null}

      {step === 2 ? (
        <Panel title="Milestones" hint="Split the payment into stages. The amounts must add up to the total.">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm font-medium tabular-nums ${diff === 0n ? 'text-ok' : 'text-muted'}`}>
              {usd(parsed.allocated)} / {parsed.totalRaw != null ? usd(parsed.totalRaw) : '0.00'} USDC allocated
            </p>
            <button type="button" onClick={splitEvenly} disabled={parsed.totalRaw == null} className="min-h-[36px] text-xs font-medium text-brand hover:underline disabled:opacity-40">
              Split evenly
            </button>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-line bg-raised p-4">
                <div className="flex items-center justify-between">
                  <span className="label !mb-0">Milestone {i + 1}</span>
                  {milestones.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove milestone ${i + 1}`}
                      onClick={() => setMilestones((rows) => rows.filter((_, idx) => idx !== i))}
                      className="grid h-10 w-10 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                  <input className="field" placeholder="Title" value={m.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={`Milestone ${i + 1} title`} />
                  <input inputMode="decimal" className="field tabular-nums" placeholder="0.00 USDC" value={m.amount} onChange={(e) => update(i, { amount: e.target.value })} aria-label={`Milestone ${i + 1} amount`} />
                </div>
                <textarea className="field min-h-[64px] resize-y" placeholder="Description (optional)" value={m.description} onChange={(e) => update(i, { description: e.target.value })} aria-label={`Milestone ${i + 1} description`} />
              </div>
            ))}
          </div>
          {milestones.length < MAX_MILESTONES ? (
            <button type="button" className="btn-ghost w-full border-dashed" onClick={() => setMilestones((rows) => [...rows, { title: '', description: '', amount: '' }])}>
              <Plus size={16} /> Add milestone
            </button>
          ) : null}
        </Panel>
      ) : null}

      {step === 3 ? (
        <Panel title="Review agreement" hint="Check every detail. Creating the agreement is one transaction and moves no funds.">
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="space-y-1 bg-raised p-5">
              <p className="label !mb-1">Agreement</p>
              <p className="font-display text-xl font-semibold">{title.trim()}</p>
              <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-ok">
                {usd(parsed.allocated)} <span className="text-base font-medium text-muted">USDC</span>
              </p>
            </div>
            <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
              <div>
                <p className="label">Payer (you)</p>
                <p className="font-mono text-sm">{address ? shortAddress(address) : 'Connect wallet'}</p>
              </div>
              <div className="min-w-0">
                <p className="label">Recipient</p>
                <p className="break-all font-mono text-sm">{recipient}</p>
              </div>
            </div>
            <ol className="space-y-3 border-t border-line p-5">
              {milestones.map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i + 1}. {m.title.trim()}</p>
                    {m.description.trim() ? <p className="mt-0.5 text-xs text-muted">{m.description.trim()}</p> : null}
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums">{usd(parsed.amounts[i] ?? 0n)} USDC</p>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-pretty text-xs text-muted">
            You fund the agreement with USDC next. Once funded, USDC can only be released to the recipient, one approved milestone at a time. Network: {FLOW_CHAIN.name}.
          </p>
        </Panel>
      ) : null}

      {confirming ? (
        <Panel title="Onchain confirmation" hint="Your wallet asks you to approve one transaction. Nothing is final until it is confirmed.">
          <ol className="space-y-3">
            {phases.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    p.done ? 'bg-mint/15 text-ok' : p.active ? 'bg-brand/15 text-brandink' : 'bg-muted/15 text-muted'
                  }`}
                >
                  {walletRequestDeclined && p.label === 'Wallet request declined' ? <XCircle size={15} aria-hidden /> : p.done ? <CheckCircle2 size={15} aria-hidden /> : p.active ? <Spinner size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={p.done || p.active ? 'text-fg' : 'text-muted'}>{p.label}</span>
              </li>
            ))}
          </ol>
          <TxStatus tx={tx} confirmedText="Agreement created. Opening details…" hideActions />
          {tx.phase === 'failed' && uncertain ? <RetryCheck result={guard.result} /> : null}
          {tx.phase === 'failed' && tx.info?.retry === true ? (
            <p className="flex items-center gap-2 text-xs text-ok">
              <ShieldCheck size={14} aria-hidden /> Nothing was created, so it is safe to try again.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {!confirming ? <ErrorList errors={stepErrors} show={Boolean(touched)} /> : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <button type="button" className="btn-ghost" disabled={tx.busy} onClick={() => setStep(step === 4 ? 3 : step - 1)}>
            <ArrowLeft size={16} /> Back
          </button>
        ) : null}
        {step < 3 ? (
          <button type="button" className="btn-primary flex-1" disabled={stepErrors.length > 0} onClick={() => setStep(step + 1)}>
            Continue <ArrowRight size={16} />
          </button>
        ) : null}
        {step === 3 ? (
          <TxButton
            label="Create agreement onchain"
            tx={tx}
            className="flex-1"
            disabled={!FLOW_ADDRESS || allErrors.length > 0 || !guardReady}
            onClick={() => {
              setStep(4)
              submit()
            }}
          />
        ) : null}
        {confirming && tx.phase === 'failed' && (tx.info?.retry === true || guard.result.kind === 'safe') ? (
          <TxButton label="Try Again" tx={tx} className="flex-1" onClick={submit} />
        ) : null}
        {confirming && tx.phase === 'failed' && uncertain && guard.result.kind === 'duplicate' ? (
          <button type="button" className="btn-primary flex-1" onClick={() => navigate(`/agreement/${guard.result.kind === 'duplicate' ? guard.result.id : ''}`)}>
            Open the existing agreement
          </button>
        ) : null}
        {confirming && tx.phase === 'failed' && uncertain && match && (guard.result.kind === 'pending' || guard.result.kind === 'unknown') ? (
          <button type="button" className="btn-primary flex-1" onClick={() => void check(match)}>
            Check again
          </button>
        ) : null}
        {confirming && tx.phase === 'failed' && uncertain && guard.result.kind === 'unknown' ? (
          <TxButton label="Create a new one anyway" variant="ghost" tx={tx} onClick={submit} />
        ) : null}
      </div>
    </div>
  )
}
