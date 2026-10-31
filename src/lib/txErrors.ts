/**
 * Turns a failed wallet or network request into a specific, honest explanation.
 * Distinguishes: wallet rejection, wallet/connection problems, wrong network, not enough gas,
 * contract revert, timeout, and RPC failure. Never returns a generic "something went wrong".
 */

import { arc, arcTestnet } from 'viem/chains'
import { FLOW_CHAIN, FLOW_CHAIN_ID } from '@/lib/flow'

/** Other official Arc RPC endpoints (from Arc's published list) a user can switch their wallet to. */
const WALLET_RPC_ALTERNATIVES = (FLOW_CHAIN_ID === arc.id ? arc : arcTestnet).rpcUrls.default.http.slice(1, 3)

export type TxErrorKind = 'rejected' | 'wallet' | 'chain' | 'funds' | 'revert' | 'timeout' | 'rpc' | 'unknown'

/** true = nothing was sent, safe to retry. 'check' = the transaction may have been sent; verify before retrying. */
export type RetrySafety = true | 'check'

export interface TxErrorInfo {
  kind: TxErrorKind
  title: string
  message: string
  /** Real error name, code and message from the wallet, wagmi, viem or the RPC. */
  detail: string
  retry: RetrySafety
  /** Presentation helpers, filled in by classifyTxError. Absent on infos built elsewhere. */
  variant?: ErrorVariant
  technical?: TxTechnical
}

/** What happened, in the words the presentation layer switches on. */
export type ErrorVariant =
  | 'rejected'
  | 'request_pending'
  | 'disconnected'
  | 'wrong_network'
  | 'network_missing'
  | 'popup'
  | 'wallet_link'
  | 'funds'
  | 'revert'
  | 'status_unknown'
  | 'rate_limited'
  | 'rpc_error'
  | 'unknown'

/** Developer-facing facts for the collapsed "View technical details" section. */
export interface TxTechnical {
  name: string
  code: string
  message: string
  stage: string
}

interface Layer {
  name: string
  message: string
  shortMessage: string
  code: number | string | undefined
}

const REVERT_REASONS: Record<string, string> = {
  OnlyPayer: 'Only the payer of this agreement can do that.',
  OnlyPayerOrRecipient: 'Only the payer or the recipient can do that.',
  InvalidRecipient: 'The recipient address is not allowed (zero address, yourself, the escrow, or the USDC token).',
  InvalidAgreementTitle: 'The agreement title is empty or too long.',
  InvalidMilestoneCount: 'An agreement needs between 1 and 20 milestones.',
  ArrayLengthMismatch: 'Milestone titles, descriptions and amounts do not line up.',
  InvalidMilestoneTitle: 'A milestone title is empty or too long.',
  MilestoneDescriptionTooLong: 'A milestone description is too long.',
  InvalidMilestoneAmount: 'A milestone amount is zero.',
  AgreementNotFound: 'That agreement does not exist.',
  InvalidAgreementStatus: 'The agreement is not in the right state for this action.',
  MilestoneIndexOutOfRange: 'That milestone does not exist.',
  MilestoneAlreadyApproved: 'This milestone is already approved.',
  MilestoneNotApproved: 'This milestone has not been approved yet.',
  MilestoneAlreadyReleased: 'This milestone was already released.',
  IncorrectFundingAmount: 'The escrow did not receive the exact USDC amount.',
}

function layersOf(error: unknown): Layer[] {
  const layers: Layer[] = []
  let current: unknown = error
  for (let depth = 0; current != null && depth < 8; depth += 1) {
    const e = current as { name?: unknown; message?: unknown; shortMessage?: unknown; code?: unknown; cause?: unknown }
    layers.push({
      name: typeof e.name === 'string' ? e.name : 'Error',
      message: typeof e.message === 'string' ? e.message : typeof current === 'string' ? current : 'Unknown error',
      shortMessage: typeof e.shortMessage === 'string' ? e.shortMessage : '',
      code: typeof e.code === 'number' || typeof e.code === 'string' ? e.code : undefined,
    })
    current = e.cause
  }
  return layers
}

function describe(layers: Layer[]): string {
  const root = layers[layers.length - 1]
  const top = layers[0]
  const part = (l: Layer) => {
    const text = (l.shortMessage || l.message).split('\n')[0].trim()
    return `${l.name}${l.code !== undefined ? ` (code ${l.code})` : ''}: ${text.length > 220 ? `${text.slice(0, 217)}…` : text}`
  }
  return root === top ? part(top) : `${part(top)} | cause: ${part(root)}`
}

function classifyCore(error: unknown, options: { hasHash?: boolean } = {}): TxErrorInfo {
  const layers = layersOf(error)
  const detail = describe(layers)
  const names = layers.map((l) => l.name)
  const codes = layers.map((l) => l.code)
  const text = layers.map((l) => `${l.name} ${l.shortMessage} ${l.message}`).join('\n').toLowerCase()
  const has = (re: RegExp) => re.test(text)
  const sentNote = options.hasHash ? ' A transaction hash exists, so check it on the explorer before retrying.' : ''

  if (
    names.includes('UserRejectedRequestError') ||
    codes.includes(4001) ||
    codes.includes('ACTION_REJECTED') ||
    has(/user (rejected|denied|declined|cancel)|rejected the request|request (was )?rejected|user rejected/)
  ) {
    return { kind: 'rejected', title: 'Request declined in your wallet', message: 'You declined the request in your wallet. No transaction was sent.', detail, retry: true }
  }

  // MetaMask: a request is already open and unanswered. This attempt was not sent.
  if (codes.includes(-32002) || has(/already pending|already processing|request of type .* already pending/)) {
    return {
      kind: 'wallet',
      title: 'Your wallet already has a request waiting',
      message:
        'An earlier request is still waiting in your wallet, so it would not open a new one. Open MetaMask (click its toolbar icon), approve or reject the pending request, then check the status here before trying again.',
      detail,
      retry: 'check',
    }
  }
  // MetaMask: 4900 provider disconnected from all chains, 4901 disconnected from the requested chain.
  if (codes.includes(4900) || codes.includes(4901) || has(/provider (is )?disconnected|chain (is )?disconnected|disconnected from (all )?chains?/)) {
    return {
      kind: 'wallet',
      title: codes.includes(4901) ? 'Wallet is disconnected from Arc Testnet' : 'Wallet provider is disconnected',
      message:
        'Your wallet lost its connection to the network. Unlock or reopen the wallet, reconnect it in the app if needed, then try again. This attempt was not sent.',
      detail,
      retry: true,
    }
  }

  if (names.includes('ConnectorChainMismatchError') || has(/does not match the connection|chain mismatch|different chain/)) {
    return {
      kind: 'chain',
      title: 'Wallet is on a different network',
      message: 'Your wallet is not on Arc Testnet. Switch the network in your wallet, then try again. No transaction was sent.',
      detail,
      retry: true,
    }
  }
  if (codes.includes(4902) || has(/unrecognized chain|chain.{0,20}not (been )?(added|configured|supported)|unsupported chain|chain not found/)) {
    return {
      kind: 'chain',
      title: 'Wallet does not support this network',
      message: 'Your wallet does not know, or does not support, Arc Testnet. Add the network in your wallet or use a different wallet. No transaction was sent.',
      detail,
      retry: true,
    }
  }

  if (names.some((n) => n === 'ConnectorNotConnectedError' || n === 'ConnectorUnavailableReconnectingError' || n === 'ConnectorAccountNotFoundError') || has(/connector not connected|not connected|reconnecting/)) {
    return {
      kind: 'wallet',
      title: 'Wallet is not connected',
      message: 'The wallet connection was lost. Reconnect your wallet, then try again. No transaction was sent.',
      detail,
      retry: true,
    }
  }
  if (has(/popup/)) {
    return {
      kind: 'wallet',
      title: 'Wallet popup was blocked',
      message: 'The browser blocked the wallet window. Allow popups for this site, or open the app in its own tab instead of the embedded preview. Check your wallet for a pending request before retrying.',
      detail,
      retry: 'check',
    }
  }

  if (has(/walletconnect|relay|session|pairing|topic|socket|request expired|proposal expired|recently deleted|connection request reset|subscribe/)) {
    return {
      kind: 'wallet',
      title: 'Wallet connection was interrupted',
      message: `The link to your wallet app (WalletConnect) dropped or the request expired before it was answered. Open your wallet app and check for a pending request; reconnect if needed.${sentNote}`,
      detail,
      retry: 'check',
    }
  }

  if (names.includes('InsufficientFundsError') || has(/insufficient funds|exceeds the balance|gas required exceeds|exceeds allowance/)) {
    return {
      kind: 'funds',
      title: 'Not enough USDC',
      message: 'This wallet does not have enough USDC to cover the network fee (gas on Arc is paid in USDC). Add test USDC and try again.',
      detail,
      retry: true,
    }
  }

  const revertName = Object.keys(REVERT_REASONS).find((n) => has(new RegExp(n.toLowerCase())))
  if (revertName || names.some((n) => n.includes('Revert')) || has(/execution reverted|reverted/)) {
    return {
      kind: 'revert',
      title: 'The contract rejected the transaction',
      message: `${revertName ? REVERT_REASONS[revertName] : 'The escrow contract reverted this call.'} No funds moved.`,
      detail,
      retry: options.hasHash ? 'check' : true,
    }
  }

  if (names.some((n) => n.includes('Timeout')) || has(/timed? ?out|timeout/)) {
    return {
      kind: 'timeout',
      title: 'Confirmation timed out',
      message: `The network did not confirm in time. The transaction may still be processed, so do not resubmit until you have checked.${sentNote}`,
      detail,
      retry: 'check',
    }
  }

  if (names.some((n) => n.includes('Http') || n.includes('Rpc') || n.includes('Limit')) || has(/rate limit|failed to fetch|load failed|network|http request failed|internal json-rpc|-32603|-32005|50[023]/)) {
    const rateLimited = has(/rate limit|limit exceeded|-32005/) || codes.includes(-32005)
    // A rate limit reported while the wallet was preparing or sending the transaction comes from the
    // RPC endpoint configured inside the wallet, not from this app's own connection.
    const walletSide = !options.hasHash && (has(/rpc 0x[0-9a-f]+ custom|custom eth_/) || (rateLimited && names.some((n) => n.includes('ExecutionError'))))
    if (rateLimited && walletSide) {
      return {
        kind: 'rpc',
        title: "Your wallet's network connection is rate limited",
        message:
          "Your wallet's own connection to Arc Testnet was rate limited, so it could not prepare the transaction. This is not a contract or app error, and nothing was sent. " +
          `Wait about 30 seconds and try again. If it keeps happening, open your wallet's network settings for ${FLOW_CHAIN.name} and change the RPC URL to another endpoint, for example ${WALLET_RPC_ALTERNATIVES.join(' or ')}.`,
        detail,
        retry: 'check',
      }
    }
    return {
      kind: 'rpc',
      title: 'Network (RPC) problem',
      message: `The Arc network endpoint did not answer correctly (${rateLimited ? 'rate limited' : 'request failed'}). Wait a moment, then check the status below before retrying.${sentNote}`,
      detail,
      retry: 'check',
    }
  }

  return {
    kind: 'unknown',
    title: 'Unexpected error',
    message: `The wallet or network returned an error that the app does not recognise. See the technical detail below.${sentNote}`,
    detail,
    retry: 'check',
  }
}

const VARIANT_BY_TITLE: Record<string, ErrorVariant> = {
  'Request declined in your wallet': 'rejected',
  'Your wallet already has a request waiting': 'request_pending',
  'Wallet provider is disconnected': 'disconnected',
  'Wallet is disconnected from Arc Testnet': 'disconnected',
  'Wallet is not connected': 'disconnected',
  'Wallet is on a different network': 'wrong_network',
  'Wallet does not support this network': 'network_missing',
  'Wallet popup was blocked': 'popup',
  'Wallet connection was interrupted': 'wallet_link',
  'Not enough USDC': 'funds',
  'The contract rejected the transaction': 'revert',
  'The transaction reverted onchain': 'revert',
  'Confirmation timed out': 'status_unknown',
}

function variantOf(info: TxErrorInfo): ErrorVariant {
  const byTitle = VARIANT_BY_TITLE[info.title]
  if (byTitle) return byTitle
  if (info.kind === 'rpc') return /rate limit/i.test(info.title + info.message) ? 'rate_limited' : 'rpc_error'
  if (info.kind === 'revert') return 'revert'
  if (info.kind === 'timeout') return 'status_unknown'
  return 'unknown'
}

/** Removes anything that looks like a credential before text is shown or copied. */
export function sanitizeDetail(text: string): string {
  return text
    .replace(/([?&])(_?rpc_?token|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|key|secret|signature)=[^&\s'"]+/gi, '$1$2=[redacted]')
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]')
    .replace(/\b(api[_-]?key|secret|private[_-]?key|mnemonic|seed phrase|authorization|auth[_-]?token|access[_-]?token)\b\s*[:=]\s*\S+/gi, '$1: [redacted]')
    .replace(/https?:\/\/[^\s'"]+/g, (url) => url.replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$|\?)/g, '/[redacted]'))
}

function technicalOf(error: unknown, hasHash: boolean): TxTechnical {
  const layers = layersOf(error)
  const root = layers[layers.length - 1]
  const code = layers.map((l) => l.code).find((c) => c !== undefined)
  const message = (root.shortMessage || root.message).split('\n')[0].trim()
  return {
    name: layers[0].name,
    code: code === undefined ? 'None' : String(code),
    message: sanitizeDetail(message.length > 300 ? `${message.slice(0, 297)}…` : message),
    stage: hasHash ? 'Confirmation (after submission)' : 'Wallet request (before submission)',
  }
}

/** Classifies a failure and adds the presentation variant and the technical facts. */
export function classifyTxError(error: unknown, options: { hasHash?: boolean } = {}): TxErrorInfo {
  const base = classifyCore(error, options)
  return { ...base, variant: variantOf(base), technical: technicalOf(error, Boolean(options.hasHash)) }
}

export type ErrorTone = 'neutral' | 'warn' | 'danger'

export interface TxErrorView {
  tone: ErrorTone
  title: string
  message: string
  hint?: string
  /** Retrying is established as safe: nothing was sent. Never true for an uncertain transaction. */
  canRetry: boolean
}

const CHECK_HINT = 'If you already confirmed this in your wallet, check your transaction history before trying again.'

/** Only this confirmed pre-submission state may be described as a user cancellation. */
export function isConfirmedWalletRejection(info: TxErrorInfo, hash?: string): boolean {
  return info.kind === 'rejected' && !hash && info.technical?.stage === 'Wallet request (before submission)'
}

/** The calm, user-facing wording for a classified failure. Technical facts stay in `technical`. */
export function presentTxError(info: TxErrorInfo): TxErrorView {
  const variant = info.variant ?? variantOf(info)
  const canRetry = info.retry === true
  const check = info.retry === 'check'
  switch (variant) {
    case 'rejected':
      return isConfirmedWalletRejection(info)
        ? { tone: 'neutral', title: 'Transaction cancelled', message: 'You declined the request in your wallet. No transaction was submitted.', canRetry }
        : {
            tone: 'warn',
            title: 'Transaction status not yet confirmed.',
            message: 'We could not verify whether the request was submitted. Check your wallet or transaction history before trying again.',
            canRetry: false,
          }
    case 'request_pending':
      return {
        tone: 'warn',
        title: 'Wallet confirmation pending',
        message: 'You already have a request waiting in your wallet. Please complete or reject it before trying again.',
        canRetry,
      }
    case 'disconnected':
      return { tone: 'warn', title: 'Wallet disconnected', message: 'Your wallet connection was interrupted. Reconnect your wallet to continue.', canRetry }
    case 'wrong_network':
      return { tone: 'warn', title: 'Switch network', message: `Please switch your wallet to ${FLOW_CHAIN.name} to continue.`, canRetry }
    case 'network_missing':
      return {
        tone: 'warn',
        title: 'Switch network',
        message: `Your wallet does not have ${FLOW_CHAIN.name} yet. Add the network in your wallet, then try again.`,
        canRetry,
      }
    case 'rate_limited':
    case 'rpc_error':
      return {
        tone: 'warn',
        title: 'Network is busy',
        message: "We're having trouble reaching Arc Network. Please wait a moment and try again.",
        hint:
          variant === 'rate_limited' && info.title.includes("wallet's")
            ? `If it keeps happening, change the RPC URL for ${FLOW_CHAIN.name} in your wallet's network settings. ${CHECK_HINT}`
            : check
              ? CHECK_HINT
              : undefined,
        canRetry,
      }
    case 'revert': {
      const reason = Object.values(REVERT_REASONS).find((text) => info.message.includes(text))
      return {
        tone: 'danger',
        title: 'Transaction unsuccessful',
        message: 'The blockchain rejected this transaction. No successful payment was completed.',
        hint: reason,
        canRetry,
      }
    }
    case 'status_unknown':
      return {
        tone: 'warn',
        title: 'Transaction status unavailable',
        message: "We couldn't confirm the result yet. Check your transaction history before attempting another payment.",
        canRetry: false,
      }
    case 'funds':
      return { tone: 'warn', title: info.title, message: info.message, canRetry }
    default:
      return { tone: 'warn', title: info.title, message: info.message, hint: check ? CHECK_HINT : undefined, canRetry }
  }
}

/** Plain-text report for the Copy Details button. Contains no keys, tokens or environment values. */
export function buildDetailsText(
  info: TxErrorInfo,
  hash?: string,
  context: { wallet?: string; network?: string } = {},
): string {
  const t = info.technical ?? { name: 'Error', code: 'None', message: sanitizeDetail(info.detail), stage: 'Confirmation' }
  const transaction = hash ?? (t.stage.includes('before submission')
    ? 'Not available (no transaction was submitted)'
    : 'Not available (transaction outcome not confirmed)')
  return [
    'CoindeccFlow transaction details',
    `Error name: ${sanitizeDetail(t.name)}`,
    `Error code: ${sanitizeDetail(t.code)}`,
    `Provider message: ${sanitizeDetail(t.message)}`,
    `Stage: ${sanitizeDetail(t.stage)}`,
    `Wallet: ${sanitizeDetail(context.wallet ?? 'Not identified')}`,
    `Transaction: ${sanitizeDetail(transaction)}`,
    `Network: ${sanitizeDetail(context.network ?? `${FLOW_CHAIN.name} (chain ${FLOW_CHAIN_ID})`)}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n')
}

/** Copies text, with a fallback for browsers that block the async clipboard. Returns whether it worked. */
export async function copyText(
  text: string,
  clip: { writeText?: (value: string) => Promise<void> } | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
): Promise<boolean> {
  try {
    if (clip?.writeText) {
      await clip.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
