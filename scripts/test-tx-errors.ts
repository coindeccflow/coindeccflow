/** Checks that wallet, connector, RPC and contract failures are classified distinctly. Run: bun run test:errors */
import { classifyTxError, type TxErrorKind } from '../src/lib/txErrors'

class Named extends Error {
  constructor(name: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = name
    Object.assign(this, extra)
  }
}
const withCause = (outer: Error, cause: Error) => Object.assign(outer, { cause })

const cases: Array<{ label: string; error: unknown; hasHash?: boolean; kind: TxErrorKind; retry: true | 'check'; titleIncludes?: string }> = [
  { label: 'wallet rejection (EIP-1193 4001)', error: withCause(new Named('TransactionExecutionError', 'User rejected the request.'), new Named('UserRejectedRequestError', 'User rejected the request.', { code: 4001 })), kind: 'rejected', retry: true },
  { label: 'wagmi chain mismatch', error: new Named('ConnectorChainMismatchError', "The current chain of the connector (id: 1) does not match the connection's chain (id: 5042002)."), kind: 'chain', retry: true },
  { label: 'wallet lacks the chain (4902)', error: new Named('SwitchChainError', 'Unrecognized chain ID "0x4cef52".', { code: 4902 }), kind: 'chain', retry: true },
  { label: 'connector not connected', error: new Named('ConnectorNotConnectedError', 'Connector not connected.'), kind: 'wallet', retry: true },
  { label: 'WalletConnect request expired', error: new Named('Error', 'Request expired. Please try again.'), kind: 'wallet', retry: 'check' },
  { label: 'WalletConnect socket dropped', error: new Named('Error', 'WebSocket connection closed abnormally with code: 3000 (Unauthorized: invalid key)'), kind: 'wallet', retry: 'check' },
  { label: 'popup blocked', error: new Named('Error', 'Failed to open popup window. Popup blocked.'), kind: 'wallet', retry: 'check' },
  { label: 'not enough gas funds', error: new Named('InsufficientFundsError', 'The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.'), kind: 'funds', retry: true },
  { label: 'contract revert (custom error)', error: new Named('ContractFunctionRevertedError', 'The contract function "createAgreement" reverted.\n\nError: InvalidRecipient(address)'), kind: 'revert', retry: true },
  { label: 'receipt wait timeout', error: new Named('WaitForTransactionReceiptTimeoutError', 'Timed out while waiting for transaction with hash "0xabc" to be confirmed.'), hasHash: true, kind: 'timeout', retry: 'check' },
  {
    label: "wallet's own RPC rate limited (the real error from your attempt)",
    error: withCause(
      new Named('ContractFunctionExecutionError', 'Request exceeds defined limit.\n\nRequest Arguments:\n  from: 0xf08D\n  to: 0x24A1\n  function: createAgreement(...)'),
      new Named('LimitExceededRpcError', 'Request exceeds defined limit.', { code: -32005, details: 'RPC 0x4cef52 Custom eth_getBlockByNumber: Request is being rate limited.' }),
    ),
    kind: 'rpc',
    retry: 'check',
    titleIncludes: "wallet's network connection",
  },
  { label: 'RPC rate limit', error: new Named('LimitExceededRpcError', 'rate limit exceeded', { code: -32005 }), kind: 'rpc', retry: 'check' },
  { label: 'RPC unreachable', error: new Named('HttpRequestError', 'HTTP request failed. Failed to fetch'), kind: 'rpc', retry: 'check' },
  { label: 'unrecognised error', error: new Named('WeirdError', 'something nobody planned for'), kind: 'unknown', retry: 'check' },
]

let failed = 0
for (const c of cases) {
  const info = classifyTxError(c.error, { hasHash: c.hasHash })
  const ok = info.kind === c.kind && info.retry === c.retry && info.detail.length > 0 && (!c.titleIncludes || info.title.includes(c.titleIncludes)) && !info.message.toLowerCase().includes('something went wrong')
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label}: kind=${info.kind} retry=${String(info.retry)} | ${info.title}`)
}
console.log(`\n${cases.length - failed}/${cases.length} classifications correct`)
process.exit(failed ? 1 : 0)
