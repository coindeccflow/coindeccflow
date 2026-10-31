/**
 * Read-only check that the app can read agreements from the deployed escrow.
 * Sends NO transactions and needs no wallet or funds.
 *
 *   bun run verify:reads
 *
 * It uses the same RPC list, ABI, multicall batching and event scanner as the app, and writes
 * docs/read-verification.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, fallback, http, type Address, type Hex, type PublicClient } from 'viem'
import { arcTestnet } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { escrowAbi } from '../src/abi/escrow'
import { FLOW_ADDRESS, FLOW_CHAIN_ID, FLOW_DEPLOY_BLOCK, USDC_ADDRESS, toAgreement } from '../src/lib/flow'
import { scanLogs, withBackoff, type FlowLog } from '../src/lib/logScanner'

const results: Array<{ check: string; pass: boolean; detail: string }> = []
const record = (check: string, pass: boolean, detail: string) => {
  results.push({ check, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${check}: ${detail}`)
}

/** Compares deployed code with the compiled artifact, ignoring the immutable slots (constructor values). */
function matchesArtifact(onchain: Hex): { match: boolean; detail: string } {
  const path = 'contracts/out/CoindeccFlowEscrow.sol/CoindeccFlowEscrow.json'
  if (!existsSync(path)) return { match: false, detail: 'artifact missing, run forge build' }
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as {
    deployedBytecode: { object: string; immutableReferences?: Record<string, Array<{ start: number; length: number }>> }
  }
  const expected = artifact.deployedBytecode.object.replace(/^0x/, '')
  const actual = onchain.replace(/^0x/, '')
  if (expected.length !== actual.length) return { match: false, detail: `length ${actual.length / 2} vs ${expected.length / 2} bytes` }
  const masked = new Set<number>()
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences ?? {})) {
    for (const { start, length } of refs) for (let i = start; i < start + length; i += 1) masked.add(i)
  }
  for (let byte = 0; byte < expected.length / 2; byte += 1) {
    if (masked.has(byte)) continue
    if (expected.slice(byte * 2, byte * 2 + 2) !== actual.slice(byte * 2, byte * 2 + 2)) {
      return { match: false, detail: `first difference at byte ${byte}` }
    }
  }
  return { match: true, detail: `${expected.length / 2} bytes, ${masked.size} immutable bytes ignored` }
}

async function main() {
  if (!FLOW_ADDRESS) throw new Error('VITE_FLOW_ESCROW_ADDRESS is not set')
  const escrow: Address = FLOW_ADDRESS

  const client = createPublicClient({
    chain: arcTestnet,
    transport: fallback(arcTestnet.rpcUrls.default.http.map((url) => http(url, { retryCount: 1 })), { rank: false }),
    batch: { multicall: true },
  }) as PublicClient

  const chainId = await client.getChainId()
  record('chain id', chainId === FLOW_CHAIN_ID, `RPC reports ${chainId}, app expects ${FLOW_CHAIN_ID} (Arc Testnet)`)

  const head = await client.getBlockNumber()
  record('RPC reachable', true, `head block ${head}`)

  const code = await client.getCode({ address: escrow })
  record('escrow has bytecode', Boolean(code && code !== '0x'), `${escrow}, ${code ? (code.length - 2) / 2 : 0} bytes`)
  if (code) {
    const m = matchesArtifact(code)
    record('bytecode matches compiled contract', m.match, m.detail)
  }

  const multicallCode = await client.getCode({ address: arcTestnet.contracts.multicall3.address })
  record('multicall3 deployed (batched reads)', Boolean(multicallCode && multicallCode !== '0x'), arcTestnet.contracts.multicall3.address)

  const token = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'usdc' })
  const decimals = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'usdcDecimals' })
  record('escrow token is the Arc USDC', token.toLowerCase() === USDC_ADDRESS.toLowerCase(), `${token}, ${decimals} decimals`)

  const count = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'agreementCount' })
  record('agreementCount readable', true, `${count} agreements exist`)

  // Same batched calls the app makes, for the rehearsal wallets and for a wallet with no agreements.
  const readFor = async (who: Address) => {
    const [asPayer, asRecipient] = await Promise.all([
      client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreementIdsByPayer', args: [who] }),
      client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreementIdsByRecipient', args: [who] }),
    ])
    const ids = [...new Set([...asPayer, ...asRecipient])]
    const agreements = await Promise.all(
      ids.map(async (id) => {
        const [raw, milestones] = await Promise.all([
          client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreement', args: [id] }),
          client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getMilestones', args: [id] }),
        ])
        return toAgreement(raw, milestones)
      }),
    )
    return { ids, agreements }
  }

  if (existsSync('.e2e/wallets.json')) {
    const wallets = JSON.parse(readFileSync('.e2e/wallets.json', 'utf8')) as { payerKey: Hex; recipientKey: Hex }
    const payer = privateKeyToAccount(wallets.payerKey).address
    const recipient = privateKeyToAccount(wallets.recipientKey).address
    const asPayer = await readFor(payer)
    record(
      'agreements for the rehearsal payer',
      asPayer.ids.length > 0,
      asPayer.agreements.map((a) => `#${a.id} "${a.title}" status ${a.status}, ${a.releasedCount}/${a.milestoneCount} released, remaining ${a.remaining}`).join('; '),
    )
    const asRecipient = await readFor(recipient)
    record('agreements for the rehearsal recipient', asRecipient.ids.length > 0, `ids ${asRecipient.ids.join(', ')}`)
  }

  const nobody = privateKeyToAccount(generatePrivateKey()).address
  const empty = await readFor(nobody)
  record('wallet with no agreements returns an empty list (not an error)', empty.ids.length === 0, `ids [] for ${nobody}`)

  // Event scan exactly as the Activity page does it.
  const from = FLOW_DEPLOY_BLOCK ?? head - 5000n
  const logs: FlowLog[] = []
  const scan = await scanLogs(client, escrow, from, head, { onChunk: (batch) => logs.push(...batch) })
  const names = logs.filter((l) => l.id === 1n).map((l) => l.event)
  record(
    'event scan from deployment block',
    logs.length > 0,
    `${logs.length} events in ${scan.requests} requests of up to ${scan.chunk} blocks (blocks ${from} to ${head}); agreement #1: ${names.join(', ')}`,
  )

  const block = await withBackoff(() => client.getBlock({ blockNumber: logs[0]?.blockNumber ?? head }))
  record('block timestamps readable', block.timestamp > 0n, `block ${block.number} at ${new Date(Number(block.timestamp) * 1000).toISOString()}`)

  const failed = results.filter((r) => !r.pass)
  writeFileSync(
    'docs/read-verification.json',
    `${JSON.stringify({ chainId, escrow, headBlock: head.toString(), ranAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2)}\n`,
  )
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Report: docs/read-verification.json`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
