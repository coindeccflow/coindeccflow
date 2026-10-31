// Explicitly opt-in read-only integration check; no wallet or signing code.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { arc } from 'viem/chains'
import handler from '../api/arc-mainnet.mjs'

const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(request) {
    let status = 200
    const headers = new Headers()
    let body
    const response = {
      setHeader(name, value) { headers.set(name, value) },
      status(value) { status = value; return response },
      json(value) { body = JSON.stringify(value); return response },
    }
    const payload = request.method === 'POST' ? await request.text() : undefined
    await handler({ method: request.method, headers: Object.fromEntries(request.headers), body: payload }, response)
    headers.set('Content-Type', 'application/json')
    return new Response(body, { status, headers })
  },
})
try {
  const url = `http://127.0.0.1:${server.port}/api/arc-mainnet`
  const client = createPublicClient({ chain: arc, transport: http(url, { retryCount: 0 }) })
  assert.equal(await client.getChainId(), 5042)
  const decimals = await client.readContract({
    address: '0x3600000000000000000000000000000000000000',
    abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
    functionName: 'decimals',
  })
  assert.equal(decimals, 6)
  const receipt = JSON.parse(readFileSync('docs/mainnet-deployment-receipt.json', 'utf8'))
  assert.ok((await client.getCode({ address: receipt.address }))?.length > 2)
  const token = await client.readContract({
    address: receipt.address,
    abi: [{ type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
    functionName: 'usdc',
  })
  assert.equal(token.toLowerCase(), receipt.usdc.toLowerCase())
  console.log('PASS: deployed Mainnet escrow code and USDC configuration through frontend RPC gateway')
  const denied = await fetch(url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [] }) })
  assert.equal(denied.status, 400)
  console.log('PASS: viem → local HTTP gateway → Alchemy: Arc Mainnet 5042, USDC decimals 6; transaction submission rejected')
} catch {
  console.error('FAIL: read-only gateway integration check (details withheld to protect credentials)')
  process.exitCode = 1
} finally { server.stop(true) }
