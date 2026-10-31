/**
 * Simulates wallet and network behaviour against the transaction lifecycle with a fake clock.
 * No wallet, network or transaction is involved. Run: bun run test:lifecycle
 */
import type { Hash, TransactionReceipt } from 'viem'
import { createTxTracker, waitStage, type TxPhase } from '../src/lib/txLifecycle'

const HASH = ('0x' + 'ab'.repeat(32)) as Hash
const okReceipt = { status: 'success', logs: [] } as unknown as TransactionReceipt
const revertedReceipt = { status: 'reverted', logs: [] } as unknown as TransactionReceipt

function harness(readReceipt: (hash: Hash) => Promise<TransactionReceipt | null>) {
  let clock = 0
  let seq = 0
  const queue: Array<{ at: number; fn: () => void; id: number; cancelled: boolean }> = []
  const tracker = createTxTracker({
    readReceipt,
    now: () => clock,
    setTimer: (fn, ms) => {
      const item = { at: clock + ms, fn, id: ++seq, cancelled: false }
      queue.push(item)
      return item
    },
    clearTimer: (handle) => {
      ;(handle as { cancelled: boolean }).cancelled = true
    },
  })
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }
  const advance = async (ms: number) => {
    const target = clock + ms
    for (;;) {
      const due = queue.filter((t) => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      due.cancelled = true
      clock = due.at
      due.fn()
      await flush()
    }
    clock = target
    await flush()
  }
  return { tracker, advance, flush, secs: () => clock / 1000 }
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`)
}
const phase = (h: ReturnType<typeof harness>, key: string): TxPhase => h.tracker.getLatest(key)?.phase ?? 'idle'
const named = (name: string, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { name }, extra)

async function popupOpensNormally() {
  let reads = 0
  const h = harness(() => Promise.resolve(++reads < 3 ? null : okReceipt))
  const wallet = deferred<Hash>()
  let sends = 0
  h.tracker.begin({ key: 'fund:3', label: 'Fund', send: () => (sends++, wallet.promise) })
  check('1. wallet popup flow: awaiting wallet', phase(h, 'fund:3') === 'awaiting_wallet')
  await h.advance(2_000)
  wallet.resolve(HASH)
  await h.flush()
  check('1. hash returned: submitted, wallet lock released', phase(h, 'fund:3') === 'submitted' && !h.tracker.lockHolder())
  await h.advance(8_000)
  check('1. receipt found: success', phase(h, 'fund:3') === 'success' && sends === 1, `sends=${sends}`)
}

async function popupNeverAppears() {
  const h = harness(() => Promise.resolve(okReceipt))
  const wallet = deferred<Hash>()
  const begun = h.tracker.begin({ key: 'create', label: 'Create Agreement', send: () => wallet.promise })
  await h.advance(14_900)
  check('2. before 15s: plain waiting', phase(h, 'create') === 'awaiting_wallet' && !h.tracker.getLatest('create')?.walletSlow)
  await h.advance(200)
  check('2. at 15s: "hasn\'t responded" hint, still awaiting', phase(h, 'create') === 'awaiting_wallet' && h.tracker.getLatest('create')?.walletSlow === true)
  await h.advance(15_000)
  check('2. at 30s: wallet_unresponsive (request not claimed cancelled)', phase(h, 'create') === 'wallet_unresponsive')
  const id = h.tracker.getLatest('create')!.id
  h.tracker.dismiss(id)
  check('3. dismiss hides the screen but keeps the single-request lock', h.tracker.getLatest('create')?.dismissed === true && h.tracker.lockHolder()?.key === 'create')
  const same = h.tracker.begin({ key: 'create', label: 'Create Agreement', send: () => Promise.resolve(HASH) })
  const other = h.tracker.begin({ key: 'fund:3', label: 'Fund', send: () => Promise.resolve(HASH) })
  check('3. duplicate and concurrent submissions refused while the request may be pending', !same.ok && !other.ok && (!other.ok && other.reason === 'busy'))
  h.tracker.abandon(id)
  const next = h.tracker.begin({ key: 'fund:3', label: 'Fund', send: () => Promise.resolve(HASH) })
  check('3. "stop waiting" releases the lock so the user is never trapped', next.ok)
  if (begun.ok) {
    wallet.resolve(HASH)
    await h.flush()
  }
  check('2. a late approval is still tracked (not lost)', h.tracker.list().some((r) => r.key === 'create' && r.hash === HASH))
}

async function rejectionAndErrors() {
  const h = harness(() => Promise.resolve(null))
  h.tracker.begin({ key: 'a', label: 'A', send: () => Promise.reject(named('UserRejectedRequestError', 'User rejected the request.', { code: 4001 })) })
  await h.flush()
  check('4. 4001 user rejection: user_rejected, lock released', phase(h, 'a') === 'user_rejected' && !h.tracker.lockHolder())
  h.tracker.begin({ key: 'b', label: 'B', send: () => Promise.reject(named('RpcRequestError', "Request of type 'eth_sendTransaction' already pending for origin", { code: -32002 })) })
  await h.flush()
  check('5. -32002 request already pending: explained, retry needs a check', phase(h, 'b') === 'failed' && h.tracker.getLatest('b')?.info?.title === 'Your wallet already has a request waiting' && h.tracker.getLatest('b')?.info?.retry === 'check')
  h.tracker.begin({ key: 'c', label: 'C', send: () => Promise.reject(named('ProviderDisconnectedError', 'The Provider is disconnected from all chains.', { code: 4900 })) })
  await h.flush()
  check('6. 4900 provider disconnected: explained, safe to retry', phase(h, 'c') === 'failed' && h.tracker.getLatest('c')?.info?.retry === true)
  h.tracker.begin({ key: 'd', label: 'D', send: () => Promise.reject(named('ChainDisconnectedError', 'The Provider is not connected to the requested chain.', { code: 4901 })) })
  await h.flush()
  check('6. 4901 chain disconnected: explained', phase(h, 'd') === 'failed' && (h.tracker.getLatest('d')?.info?.title ?? '').includes('Arc Testnet'))
  h.tracker.begin({ key: 'e', label: 'E', send: () => Promise.reject(named('LimitExceededRpcError', 'Request exceeds defined limit.', { code: -32005 })) })
  await h.flush()
  check('7. RPC rate limit while preparing: failed with an RPC explanation', phase(h, 'e') === 'failed' && h.tracker.getLatest('e')?.info?.kind === 'rpc')
  h.tracker.begin({ key: 'a', label: 'A again', send: () => Promise.resolve(HASH) })
  check('8. reconnect / retry after rejection: a new attempt is allowed', phase(h, 'a') === 'awaiting_wallet')
}

async function rateLimitedPolling() {
  let calls = 0
  const h = harness(() => {
    calls += 1
    return calls <= 3 ? Promise.reject(named('LimitExceededRpcError', 'rate limit exceeded', { code: -32005 })) : Promise.resolve(okReceipt)
  })
  h.tracker.begin({ key: 'rel', label: 'Release', send: () => Promise.resolve(HASH) })
  await h.flush()
  await h.advance(30_000)
  check('9. RPC rate limiting while confirming never marks the payment failed', phase(h, 'rel') === 'success', `receipt polls=${calls}`)
}

async function delayedConfirmation() {
  let ready = false
  let sends = 0
  const h = harness(() => Promise.resolve(ready ? okReceipt : null))
  h.tracker.begin({ key: 'rel2', label: 'Release', send: () => (sends++, Promise.resolve(HASH)) })
  await h.flush()
  // No subscriber is attached: the user has left the page and nobody is listening.
  await h.advance(16_000)
  check('10. delayed: confirming, transaction not resent', phase(h, 'rel2') === 'confirming' && sends === 1)
  await h.advance(80_000)
  check('10. still unseen after 90s: status_unknown (no automatic retry)', phase(h, 'rel2') === 'status_unknown' && sends === 1)
  ready = true
  await h.advance(10_000)
  check('10. tracking continued with no page open: success when the receipt appears', phase(h, 'rel2') === 'success' && sends === 1)
}

async function revertedAndResumed() {
  const h = harness(() => Promise.resolve(revertedReceipt))
  h.tracker.begin({ key: 'x', label: 'X', send: () => Promise.resolve(HASH) })
  await h.flush()
  check('11. mined but reverted: failed, safe to retry, no funds moved', phase(h, 'x') === 'failed' && h.tracker.getLatest('x')?.info?.retry === true)
  const resumed = harness(() => Promise.resolve(okReceipt))
  resumed.tracker.restore([{ key: 'create', label: 'Create Agreement', hash: HASH, startedAt: 0 }])
  await resumed.flush()
  check('12. page reloaded: submitted transaction is picked up and confirmed', phase(resumed, 'create') === 'success')
}

async function duplicatePrevention() {
  const h = harness(() => Promise.resolve(null))
  let sends = 0
  const first = h.tracker.begin({ key: 'approve-ms:3:1', label: 'Approve milestone', send: () => (sends++, Promise.resolve(HASH)) })
  await h.flush()
  const second = h.tracker.begin({ key: 'approve-ms:3:1', label: 'Approve milestone', send: () => (sends++, Promise.resolve(HASH)) })
  check('13. double click while submitted: second attempt refused', first.ok && !second.ok && sends === 1)
}

function waitingScreenThresholds(): Promise<void> {
  const at = (ms: number) => waitStage(ms)
  check('14. 0-4.9 s: plain waiting, no Dismiss', at(0) === 'waiting' && at(4_999) === 'waiting')
  check('14. 5 s: Dismiss appears', at(5_000) === 'dismissable' && at(14_999) === 'dismissable')
  check('14. 15 s: "taking longer than expected" with Check Wallet', at(15_000) === 'slow' && at(29_999) === 'slow')
  check('14. 30 s: "still waiting" recovery guidance', at(30_000) === 'unresponsive' && at(600_000) === 'unresponsive')
  return Promise.resolve()
}

async function dismissThenWalletAnswers() {
  const h = harness(() => Promise.resolve(null))
  const wallet = deferred<Hash>()
  let sends = 0
  const first = h.tracker.begin({ key: 'fund:3', label: 'Fund', send: () => (sends++, wallet.promise) })
  await h.advance(6_000)
  const id = h.tracker.getLatest('fund:3')!.id
  h.tracker.dismiss(id)
  const again = h.tracker.begin({ key: 'fund:3', label: 'Fund', send: () => (sends++, wallet.promise) })
  check('15. Dismiss hides the card only: request still awaiting, nothing resent', h.tracker.getLatest('fund:3')?.phase === 'awaiting_wallet' && h.tracker.getLatest('fund:3')?.dismissed === true && !again.ok && sends === 1)
  h.tracker.reopen(id)
  check('15. a hidden request can be reopened from the tray', h.tracker.getLatest('fund:3')?.dismissed === false)
  h.tracker.dismiss(id)
  wallet.resolve(HASH)
  await h.flush()
  const record = h.tracker.getLatest('fund:3')
  check('15. wallet answers after Dismiss: submitted with its hash, no longer "waiting for wallet"', first.ok && record?.phase === 'submitted' && record.hash === HASH)
}

async function mockedWalletProviders() {
  ;(globalThis as { window?: unknown }).window = globalThis
  const { checkWallet, openWallet } = await import('../src/lib/walletTools')
  const connectorOf = (request: (method: string) => Promise<unknown>, session?: unknown) =>
    ({ getProvider: () => Promise.resolve({ request: ({ method }: { method: string }) => request(method), session }) }) as never
  const want = { address: '0xAbC0000000000000000000000000000000000001', chainId: 5042002, chainName: 'Arc Testnet' }
  const good = await checkWallet(connectorOf((m) => Promise.resolve(m === 'eth_accounts' ? [want.address.toLowerCase()] : '0x4cef52')), want)
  check('16. mocked MetaMask responding on Arc Testnet', good.responsive && good.message.includes('responding'), good.message.slice(0, 60))
  const locked = await checkWallet(connectorOf((m) => Promise.resolve(m === 'eth_accounts' ? [] : '0x4cef52')), want)
  check('16. mocked locked wallet is reported', locked.responsive && locked.message.includes('locked'))
  const wrongChain = await checkWallet(connectorOf((m) => Promise.resolve(m === 'eth_accounts' ? [want.address] : '0x1')), want)
  check('16. mocked wallet on the wrong network is reported', wrongChain.message.includes('different network'))
  const none = await checkWallet(undefined, want)
  check('16. no wallet connection is reported', !none.responsive)
  const desktop = await openWallet(connectorOf(() => Promise.resolve([])))
  check('16. desktop extension: no pretend popup, only instructions', !desktop.opened && desktop.message.includes('toolbar'))
}

async function navigateAwayDuringConfirmation() {
  const h = harness(() => Promise.resolve(null))
  h.tracker.begin({ key: 'release:3:1', label: 'Release', send: () => Promise.resolve(HASH) })
  const detach = h.tracker.attach('release:3:1')
  detach()
  await h.flush()
  await h.advance(20_000)
  check('17. user left the page: still tracked and not mounted', h.tracker.getLatest('release:3:1')?.phase === 'confirming' && !h.tracker.isMounted('release:3:1'), String(h.tracker.getLatest('release:3:1')?.phase))
}

for (const run of [popupOpensNormally, popupNeverAppears, rejectionAndErrors, rateLimitedPolling, delayedConfirmation, revertedAndResumed, duplicatePrevention, waitingScreenThresholds, dismissThenWalletAnswers, mockedWalletProviders, navigateAwayDuringConfirmation]) {
  await run()
}
console.log(failures === 0 ? '\nAll lifecycle scenarios passed' : `\n${failures} scenario check(s) FAILED`)
process.exit(failures ? 1 : 0)
