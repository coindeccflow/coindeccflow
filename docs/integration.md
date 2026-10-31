# CoindeccPay integration

CoindeccFlow is a standalone contract and does not touch any CoindeccPay contract. CoindeccPay can call it through the helpers in `src/lib/integration.ts`, which use plain viem clients (no React).

| Helper | What it does |
| --- | --- |
| `createPaymentAgreement(clients, { recipient, title, milestones })` | Creates an agreement; the connected wallet is the payer. Returns the hash and new agreement id. |
| `fundPaymentAgreement(clients, agreementId)` | Approves the exact USDC amount if the allowance is short, then funds. Returns every confirmed hash. |
| `approvePaymentMilestone(clients, agreementId, index)` | Payer approves a milestone. |
| `releasePaymentMilestone(clients, agreementId, index)` | Payer or recipient releases an approved milestone. |
| `getPaymentAgreement(publicClient, agreementId)` | Reads the agreement, milestones, and remaining escrow balance. |

Each write resolves only after the transaction is confirmed with a successful receipt.

```ts
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { createPaymentAgreement, fundPaymentAgreement } from '@/lib/integration'

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(window.ethereum!), account })

const { agreementId } = await createPaymentAgreement(
  { publicClient, walletClient },
  { recipient, title: 'Design sprint', milestones: [{ title: 'Draft', amountUsdc: '0.10' }, { title: 'Final', amountUsdc: '0.10' }] },
)
await fundPaymentAgreement({ publicClient, walletClient }, agreementId)
```

Contract ABI: `deploy/CoindeccFlowEscrow.abi.json` (regenerate with `bun run abi:export` after `forge build`).

Events to index in CoindeccPay receipts: AgreementCreated, AgreementFunded, MilestoneApproved, MilestoneReleased, AgreementCompleted, AgreementCancelled. When scanning, start from the contract's deployment block, never block 0.
