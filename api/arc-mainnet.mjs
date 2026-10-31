// Read-only RPC gateway. Wallet signing and broadcasting stay with the wallet.
import { permitted, withinBudget, requestWeight } from '../server/rpc-policy.mjs'
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
  if (!calls.length || calls.length > 10 || calls.some(c =>
    !c || c.jsonrpc !== '2.0' || !permitted(c) ||
    (c.params !== undefined && !Array.isArray(c.params)) || !(typeof c.id === 'string' || typeof c.id === 'number')
  )) return fail(400, 'Unsupported RPC request')
  if (!withinBudget(calls.reduce((sum, c) => sum + requestWeight(c), 0))) {
    res.setHeader('Retry-After', '60')
    return fail(429, 'RPC rate limit exceeded')
  }
  try {
    // Alchemy Free caps log scans at 10 blocks. Route only bounded escrow/token
    // log requests to Circle's fixed public Arc endpoint, never to a caller URL.
    const groups = [
      { url: 'https://rpc.mainnet.arc.io', calls: calls.filter(c => c.method === 'eth_getLogs') },
      { url: `https://arc-mainnet.g.alchemy.com/v2/${key}`, calls: calls.filter(c => c.method !== 'eth_getLogs') },
    ].filter(group => group.calls.length)
    const replies = await Promise.all(groups.map(async group => {
      const response = await fetch(group.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Array.isArray(body) ? group.calls : group.calls[0]),
        signal: AbortSignal.timeout(10000),
      })
      if (response.status === 429) return { status: 429 }
      if (!response.ok) return { status: 502 }
      return { result: await response.json() }
    }))
    const failed = replies.find(reply => reply.status)
    if (failed) return fail(failed.status, failed.status === 429 ? 'RPC rate limit exceeded' : 'RPC unavailable')
    const results = replies.flatMap(reply => Array.isArray(reply.result) ? reply.result : [reply.result])
    // Never relay provider errors or headers, which may contain credentials.
    const safeErrors = new Map([[-32012, 'RPC block range too large'], [-32014, 'RPC block not yet imported'], [-32005, 'RPC rate limit exceeded']])
    const clean = item => item && item.error
      ? { jsonrpc: '2.0', id: item.id, error: { code: safeErrors.has(item.error.code) ? item.error.code : -32000, message: safeErrors.get(item.error.code) ?? 'RPC request failed' } }
      : { jsonrpc: '2.0', id: item?.id, result: item?.result }
    return res.status(200).json(Array.isArray(body) ? results.map(clean) : clean(results[0]))
  } catch { return fail(502, 'RPC unavailable') }
}
