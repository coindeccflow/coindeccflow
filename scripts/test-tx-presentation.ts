/**
 * Presentation tests for wallet transaction errors. Mocked errors only: no wallet, no network,
 * no transaction. Run: bun run test:presentation
 */
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { TxErrorNotice } from '../src/components/TxErrorNotice'
import {
  buildDetailsText,
  classifyTxError,
  copyText,
  isConfirmedWalletRejection,
  presentTxError,
  sanitizeDetail,
  type TxErrorInfo,
} from '../src/lib/txErrors'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`)
}
const err = (name: string, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { name }, extra)
const wrap = (cause: unknown, message = 'The contract function "createAgreement" reverted.') => err('ContractFunctionExecutionError', message, { cause })

const rejection = wrap(err('UserRejectedRequestError', 'MetaMask Tx Signature: User denied transaction signature.', { code: 4001 }), 'User rejected the request.')
const pendingRequest = wrap(err('RpcRequestError', 'Request of type wallet_sendTransaction already pending for origin', { code: -32002 }), 'Request already pending.')
const disconnected = wrap(err('ProviderDisconnectedError', 'The Provider is disconnected from all chains.', { code: 4900 }), 'The provider disconnected.')
const wrongNetwork = err('ConnectorChainMismatchError', "The current chain of the connector (id: 1) does not match the connection's chain (id: 5042002).")
const rateLimited = wrap(err('LimitExceededRpcError', 'RPC 0x4cef52 Custom eth_getBlockByNumber: Request is being rate limited.', { code: -32005 }), 'Request exceeds defined limit.')
const reverted = wrap(err('ContractFunctionRevertedError', 'execution reverted: MilestoneAlreadyReleased'))
const timedOut = err('WaitForTransactionReceiptTimeoutError', 'Timed out while waiting for transaction with hash 0xabc to be confirmed.')

const html = (info: TxErrorInfo, props: Record<string, unknown> = {}) => renderToString(createElement(TxErrorNotice, { info, ...props }))

// 1-7: wording
const rej = presentTxError(classifyTxError(rejection))
check('1. user rejects (4001): "Transaction cancelled", neutral, no alarm', rej.title === 'Transaction cancelled' && rej.tone === 'neutral' && rej.message === 'You declined the request in your wallet. No transaction was submitted.' && rej.canRetry)
check('1. only a verified pre-submission rejection is called cancelled', isConfirmedWalletRejection(classifyTxError(rejection)) && !isConfirmedWalletRejection(classifyTxError(rejection, { hasHash: true })) && !isConfirmedWalletRejection({ kind: 'rejected', title: '', message: '', detail: '', retry: true }))
const rejectedAfterSubmission = presentTxError(classifyTxError(rejection, { hasHash: true }))
check('1. rejection with a submitted hash is never called cancelled', rejectedAfterSubmission.title === 'Transaction status not yet confirmed.' && !rejectedAfterSubmission.canRetry)
const pend = presentTxError(classifyTxError(pendingRequest))
check('2. request already pending (-32002)', pend.title === 'Wallet confirmation pending' && pend.message.includes('complete or reject it before trying again') && !pend.canRetry)
const disc = presentTxError(classifyTxError(disconnected))
check('3. wallet disconnected (4900)', disc.title === 'Wallet disconnected' && disc.message === 'Your wallet connection was interrupted. Reconnect your wallet to continue.')
const net = presentTxError(classifyTxError(wrongNetwork))
check('4. wrong network', net.title === 'Switch network' && net.message === 'Please switch your wallet to Arc Testnet to continue.')
const rate = presentTxError(classifyTxError(rateLimited))
check('5. RPC rate limit', rate.title === 'Network is busy' && rate.message === "We're having trouble reaching Arc Network. Please wait a moment and try again." && !rate.canRetry)
const rev = presentTxError(classifyTxError(reverted))
check('6. transaction reverts', rev.title === 'Transaction unsuccessful' && rev.message === 'The blockchain rejected this transaction. No successful payment was completed.' && rev.hint === 'This milestone was already released.')
const lifecycleRevert: TxErrorInfo = { kind: 'revert', title: 'The transaction reverted onchain', message: 'mined but reverted', detail: 'Receipt status: reverted', retry: true }
check('6. mined-but-reverted receipt uses the same wording', presentTxError(lifecycleRevert).title === 'Transaction unsuccessful')
const unk = presentTxError(classifyTxError(timedOut, { hasHash: true }))
check('7. status unknown: timeout is not reported as failure', unk.title === 'Transaction status unavailable' && unk.message.includes('Check your transaction history before attempting another payment') && !unk.canRetry)

// 8: technical details collapsed by default, expandable
const rejInfo = classifyTxError(rejection)
const collapsed = html(rejInfo)
const panelAt = collapsed.indexOf('id="tx-error-details')
const visiblePart = collapsed.slice(0, panelAt)
check('8. collapsed by default', collapsed.includes('aria-expanded="false"') && collapsed.includes('Need help?') && !collapsed.includes('View technical details'))
check('8. no technical text in the visible area', !/ContractFunctionExecutionError|4001|User denied|MetaMask Tx Signature/.test(visiblePart))
check('8. collapsed panel is hidden from view and assistive tech', /aria-hidden="true"/.test(collapsed) && /invisible/.test(collapsed.slice(panelAt - 20)))
const expanded = html(rejInfo, { defaultOpen: true, hash: undefined })
check('8. expanded shows safe transaction information only', ['Transaction information', 'Cancelled by you', 'Wallet not identified', 'Arc Testnet', 'Funds transferred', 'None', 'Copy diagnostic information'].every((t) => expanded.includes(t)) && expanded.includes('aria-expanded="true"') && !/ContractFunctionExecutionError|User denied|4001/.test(expanded))
const identified = html(rejInfo, { defaultOpen: true, walletName: 'Coinbase Wallet', networkName: 'Arc Testnet' })
check('8. support panel uses the connected wallet name', identified.includes('Coinbase Wallet'))
const withHash = html(classifyTxError(timedOut, { hasHash: true }), { defaultOpen: true, hash: `0x${'ab'.repeat(32)}` })
check('8. transaction hash shown when one exists, with explorer link', withHash.includes('ab'.repeat(32)) && withHash.includes('View on Arc Explorer'))
check('8. pending outcome is not called cancelled and funds remain unconfirmed', withHash.includes('Transaction status not yet confirmed.') && withHash.includes('Not yet confirmed') && !withHash.includes('Cancelled by you'))

// 9: copy details
let copied = ''
const okCopy = await copyText('hello', { writeText: (v) => ((copied = v), Promise.resolve()) })
check('9. Copy Details writes to the clipboard', okCopy && copied === 'hello')
const failCopy = await copyText('x', { writeText: () => Promise.reject(new Error('denied')) })
check('9. clipboard failure is reported, not hidden', failCopy === false)
const secretError = err('HttpRequestError', 'POST https://rpc.example.org/v1/AbCdEfGhIjKlMnOpQrStUvWxYz123456?_rpc_token=TOPSECRET99&apiKey=KEY123 failed. Authorization: Bearer abcdef0123456789 api_key=SHHH private key: 0xdead', { code: -32603 })
const report = buildDetailsText(classifyTxError(secretError))
check('9. copied report contains no tokens, keys or credentials', !/TOPSECRET99|KEY123|abcdef0123456789|SHHH|AbCdEfGhIjKlMnOpQrStUvWxYz123456/.test(report) && report.includes('[redacted]'), report.split('\n')[3].slice(0, 90))
check('9. report has the required fields', ['Error name:', 'Error code:', 'Provider message:', 'Stage:', 'Wallet:', 'Transaction:', 'Network:'].every((t) => report.includes(t)))
check('9. sanitizer leaves plain text alone', sanitizeDetail('User denied transaction signature') === 'User denied transaction signature')

// 10: retry stays safe
const retryHtml = (info: TxErrorInfo) => html(info, { onRetry: () => undefined, onBack: () => undefined })
check('10. safe rejection offers Try Again and Back', retryHtml(rejInfo).includes('Try Again') && retryHtml(rejInfo).includes('>Back<'))
check('10. pending wallet request does not offer Try Again', !retryHtml(classifyTxError(pendingRequest)).includes('Try Again'))
check('10. uncertain timeout does not offer Try Again', !retryHtml(classifyTxError(timedOut, { hasHash: true })).includes('Try Again'))
check('10. RPC rate limit (may have been sent) does not offer Try Again', !retryHtml(classifyTxError(rateLimited)).includes('Try Again'))
check('10. no retry button without a retry handler', !html(rejInfo, { onBack: () => undefined }).includes('Try Again'))

console.log(failures === 0 ? '\nAll presentation checks passed' : `\n${failures} presentation check(s) FAILED`)
process.exit(failures ? 1 : 0)
