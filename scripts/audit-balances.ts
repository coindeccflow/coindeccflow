/**
 * Read-only balance audit (sends no transactions). Run: bun run audit:balances <wallet> [block,block,...]
 * Reads exactly what the app reads (same USDC address, ABI and chain), pinned to single block heights,
 * and checks that wallet, escrow and per-agreement accounting agree.
 */
import { createPublicClient, erc20Abi, fallback, formatUnits, http, isAddress, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { escrowAbi } from '../src/abi/escrow'
import { FLOW_ADDRESS, FLOW_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS_ONCHAIN } from '../src/lib/flow'

const wallet = process.argv[2]
if (!wallet || !isAddress(wallet)) throw new Error('Usage: bun run audit:balances <wallet address> [block,block,...]')
if (!FLOW_ADDRESS) throw new Error('VITE_FLOW_ESCROW_ADDRESS is not set')
const escrow: Address = FLOW_ADDRESS
const account: Address = wallet
const client = createPublicClient({
  chain: arcTestnet,
  transport: fallback(arcTestnet.rpcUrls.default.http.map((url) => http(url))),
})

let failed = 0
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${detail}`)
}
const usd = (raw: bigint) => formatUnits(raw, USDC_DECIMALS_ONCHAIN)

const chainId = await client.getChainId()
check('chain id', chainId === FLOW_CHAIN_ID, `RPC ${chainId}, app ${FLOW_CHAIN_ID}`)
const [decimals, symbol] = await Promise.all([
  client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'symbol' }),
])
check('app reads the Arc USDC token', decimals === USDC_DECIMALS_ONCHAIN, `${USDC_ADDRESS} ${symbol}, ${decimals} decimals`)
const escrowToken = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'usdc' })
check('escrow holds the same token the app displays', escrowToken.toLowerCase() === USDC_ADDRESS.toLowerCase(), escrowToken)

const head = await client.getBlockNumber()
const extra = (process.argv[3] ?? '').split(',').filter(Boolean).map((b) => BigInt(b))
console.log('\nWallet balance at pinned blocks (what the app shows at that block):')
for (const blockNumber of [...extra, head]) {
  const [erc20, native] = await Promise.all([
    client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
    client.getBalance({ address: account, blockNumber }),
  ])
  const sameAsNative = native / 10n ** 12n === erc20
  check(`block ${blockNumber}`, sameAsNative, `${usd(erc20)} USDC (ERC-20, 6 dec) = native ${formatUnits(native, 18)} (18 dec, truncated)`)
}

console.log('\nEscrow accounting at block', head.toString())
const count = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'agreementCount', blockNumber: head })
let funded = 0n
let released = 0n
let remaining = 0n
for (let id = 1n; id <= count; id += 1n) {
  const a = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreement', args: [id], blockNumber: head })
  const bal = await client.readContract({ address: escrow, abi: escrowAbi, functionName: 'getAgreementBalance', args: [id], blockNumber: head })
  funded += a.fundedAmount
  released += a.releasedAmount
  remaining += bal
  check(`agreement #${id} funded - released = remaining`, a.fundedAmount - a.releasedAmount === bal, `${usd(a.fundedAmount)} - ${usd(a.releasedAmount)} = ${usd(bal)}`)
}
const held = await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [escrow], blockNumber: head })
check('escrow contract USDC = sum of agreement balances', held === remaining, `${usd(held)} held, ${usd(remaining)} owed (funded ${usd(funded)}, released ${usd(released)})`)

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`)
process.exit(failed ? 1 : 0)
