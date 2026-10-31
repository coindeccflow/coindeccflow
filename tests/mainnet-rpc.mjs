import { strict as assert } from 'node:assert'
import handler from '../api/arc-mainnet.mjs'
const originalFetch = globalThis.fetch
process.env.ALCHEMY_ARC_MAINNET_API_KEY = 'test-secret'
let requests = 0
 globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x13b2' }) } }
async function run(method, body, headers = {}) {
  const output = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this }, json(data) { this.data = data; return this } }
  await handler({ method, body, headers }, output)
  return output
}
try {
  const call = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
  assert.equal((await run('POST', call)).data.result, '0x13b2')
  assert.equal((await run('POST', { ...call, params: undefined })).data.result, '0x13b2')
  assert.equal((await run('GET', call)).statusCode, 405)
  assert.equal((await run('POST', { ...call, method: 'eth_sendRawTransaction' })).statusCode, 400)
  assert.equal((await run('POST', [])).statusCode, 400)
  assert.equal((await run('POST', call, { origin: 'https://evil.example', host: 'app.example' })).statusCode, 403)
  assert.equal(requests, 2)
  const routes = []
  globalThis.fetch = async (url, options) => {
    routes.push(new URL(url).hostname)
    const sent = JSON.parse(options.body)
    const answer = c => ({ jsonrpc: '2.0', id: c.id, result: c.method === 'eth_getLogs' ? [] : '0x13b2' })
    return { ok: true, json: async () => Array.isArray(sent) ? sent.map(answer) : answer(sent) }
  }
  const mixed = await run('POST', [call, { jsonrpc: '2.0', id: 2, method: 'eth_getLogs', params: [{ address: '0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043', fromBlock: '0x1', toBlock: '0x2' }] }])
  assert.equal(mixed.data.length, 2)
  assert.deepEqual(new Set(routes), new Set(['rpc.mainnet.arc.io', 'arc-mainnet.g.alchemy.com']))
  for (const code of [-32012, -32014, -32005]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code, message: 'test-secret' } }) })
    const result = await run('POST', call)
    assert.equal(result.data.error.code, code)
    assert.ok(!JSON.stringify(result.data).includes('test-secret'))
  }
  globalThis.fetch = async () => { throw new Error('test-secret') }
  const failed = await run('POST', call)
  assert.equal(failed.statusCode, 502)
  assert.ok(!JSON.stringify(failed.data).includes('test-secret'))
  delete process.env.ALCHEMY_ARC_MAINNET_API_KEY
  assert.equal((await run('POST', call)).statusCode, 503)
  console.log('Mainnet RPC gateway checks passed')
} finally { globalThis.fetch = originalFetch }