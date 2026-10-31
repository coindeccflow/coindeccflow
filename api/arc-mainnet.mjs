// Read-only RPC gateway. Wallet signing and broadcasting stay with the wallet.
const allowed = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getCode',
  'eth_call', 'eth_getLogs', 'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_getTransactionByHash', 'eth_getTransactionReceipt',
  'eth_getTransactionCount', 'eth_gasPrice', 'eth_estimateGas',
  'eth_feeHistory', 'eth_maxPriorityFeePerGas', 'net_version',
])
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const fail = (status, message) => res.status(status).json({ error: message })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return fail(405, 'POST required')
  }
  // Reject cross-origin browser use. This is not authentication or rate limiting.
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) return fail(403, 'Origin rejected')
    } catch { return fail(403, 'Origin rejected') }
  }
  const key = process.env.ALCHEMY_ARC_MAINNET_API_KEY
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) return fail(503, 'RPC unavailable')
  let body
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    if (!raw || raw.length > 65536) return fail(413, 'Request too large')
    body = JSON.parse(raw)
  } catch { return fail(400, 'Invalid JSON') }
  const calls = Array.isArray(body) ? body : [body]
  if (!calls.length || calls.length > 20 || calls.some(c =>
    !c || c.jsonrpc !== '2.0' || !allowed.has(c.method) ||
    (c.params !== undefined && !Array.isArray(c.params)) || !(typeof c.id === 'string' || typeof c.id === 'number')
  )) return fail(400, 'Unsupported RPC request')
  try {
    const response = await fetch(`https://arc-mainnet.g.alchemy.com/v2/${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return fail(502, 'RPC unavailable')
    const result = await response.json()
    // Never relay provider errors or headers, which may contain credentials.
    const clean = item => item && item.error
      ? { jsonrpc: '2.0', id: item.id, error: { code: -32000, message: 'RPC request failed' } }
      : { jsonrpc: '2.0', id: item?.id, result: item?.result }
    return res.status(200).json(Array.isArray(result) ? result.map(clean) : clean(result))
  } catch { return fail(502, 'RPC unavailable') }
}
