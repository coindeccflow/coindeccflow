// Read-only: compiles locally and calls eth_estimateGas; never signs/broadcasts.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createPublicClient, http, encodeDeployData, formatUnits } from 'viem'
import { arc } from 'viem/chains'

const sender = '0xf08DCbdc4543B542770ab7FaDB11D9E4d1C667d7'
const usdc = '0x3600000000000000000000000000000000000000'
const ceiling = 50000000000000000n // 0.05 native USDC, 18 decimals
const solcPath = process.env.SOLC_MODULE
if (!solcPath) throw new Error('Set SOLC_MODULE to the pinned solc 0.8.28 module')
const { default: solc } = await import(pathToFileURL(resolve(solcPath)).href)
if (!solc.version().startsWith('0.8.28+')) throw new Error('Compiler version mismatch')
const sources = {
  'contracts/CoindeccFlowEscrow.sol': { content: readFileSync('contracts/CoindeccFlowEscrow.sol', 'utf8') },
}
const settings = {
  optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'metadata'] } },
}
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings }), {
  import(name) {
    const base = resolve('node_modules/@openzeppelin/contracts')
    const path = resolve('node_modules', name)
    if (!path.startsWith(base + sep)) return { error: 'Import outside expected dependency' }
    try {
      const content = readFileSync(path, 'utf8')
      sources[name] = { content }
      return { contents: content }
    } catch { return { error: 'Dependency unavailable' } }
  },
}))
if (output.errors?.some(e => e.severity === 'error')) {
  console.error(output.errors.filter(e => e.severity === 'error').map(e => e.formattedMessage).join('\n'))
  process.exit(1)
}
const contract = output.contracts['contracts/CoindeccFlowEscrow.sol'].CoindeccFlowEscrow
const data = encodeDeployData({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, args: [usdc] })
const dir = '.e2e/mainnet-deployment'
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/compiler-input.json`, JSON.stringify({ language: 'Solidity', sources, settings }, null, 2))
writeFileSync(`${dir}/artifact.json`, JSON.stringify({ compiler: solc.version(), ...contract }, null, 2))
const key = process.env.ALCHEMY_ARC_MAINNET_API_KEY
if (!key) throw new Error('Missing server-side Alchemy key')
const client = createPublicClient({ chain: arc, transport: http(`https://arc-mainnet.g.alchemy.com/v2/${key}`, { retryCount: 0 }) })
try {
  if (await client.getChainId() !== 5042) throw new Error('Wrong chain')
  const decimals = await client.readContract({ address: usdc, abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }], functionName: 'decimals' })
  if (decimals !== 6) throw new Error('Wrong token decimals')
  const [gas, gasPrice, balance, block] = await Promise.all([
    client.estimateGas({ account: sender, data, value: 0n }),
    client.getGasPrice(), client.getBalance({ address: sender }), client.getBlockNumber(),
  ])
  const bufferedGas = (gas * 110n + 99n) / 100n
  const report = {
    checkedAt: new Date().toISOString(), chainId: 5042, block: block.toString(), sender, usdc,
    compiler: solc.version(), bytecodeSha256: createHash('sha256').update(data).digest('hex'),
    estimatedGas: gas.toString(), gasPriceGwei: formatUnits(gasPrice, 9),
    estimatedFeeUSDC: formatUnits(gas * gasPrice, 18),
    feeWithTenPercentGasBufferUSDC: formatUnits(bufferedGas * gasPrice, 18),
    budgetCeilingUSDC: '0.05', fitsBufferedBudget: bufferedGas * gasPrice <= ceiling,
    walletBalanceUSDC: formatUnits(balance, 18), reserveAfterCeilingUSDC: formatUnits(balance - ceiling, 18),
    status: 'READ_ONLY_ESTIMATE_NO_TRANSACTION_SENT',
  }
  writeFileSync(`${dir}/estimate.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch {
  console.error('Mainnet estimation failed; provider details withheld to protect credentials. No transaction sent.')
  process.exitCode = 1
}
