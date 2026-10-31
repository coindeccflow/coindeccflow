/**
 * Re-exports the escrow ABI after `forge build`:
 *   - src/abi/escrow.ts          (typed `as const` ABI for the frontend)
 *   - deploy/CoindeccFlowEscrow.abi.json (plain JSON for other apps, e.g. CoindeccPay)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const artifact = JSON.parse(readFileSync('contracts/out/CoindeccFlowEscrow.sol/CoindeccFlowEscrow.json', 'utf8')) as {
  abi: unknown
}
writeFileSync('deploy/CoindeccFlowEscrow.abi.json', `${JSON.stringify(artifact.abi, null, 2)}\n`)
writeFileSync(
  'src/abi/escrow.ts',
  `// Generated from contracts/out/CoindeccFlowEscrow.sol. Run \`bun run abi:export\` after changing the contract.\nexport const escrowAbi = ${JSON.stringify(artifact.abi)} as const\n`,
)
console.log('ABI exported')
