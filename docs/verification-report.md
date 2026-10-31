# Verification report

Historical scope: the original contract/Testnet validation. Current Mainnet deployment, browser-wallet demonstration, and production checks are recorded in [Mainnet status](mainnet-build-status.md).

Scope: `contracts/CoindeccFlowEscrow.sol` (unchanged since deployment), the frontend, and the deployed Arc Testnet instance. Passing tests are evidence, not proof of security. This report separates what was observed from what was reasoned about.

## 1. Contract review (manual, line by line)

| Area | Finding | Evidence |
| --- | --- | --- |
| Outflow paths | USDC leaves the contract in exactly one place: `safeTransfer(agreement.recipient, amount)` inside `releaseMilestone`. No owner, admin, rescue, sweep, `delegatecall`, `selfdestruct`, or payable/fallback code exists. | Source read; unknown-selector and value-sending tests; live: all outflows were release transactions |
| Withdrawal authority | Recipient is fixed at creation and never reassigned. Only the payer or recipient can call release; the amount is the milestone amount; the destination is always the recipient. | Source; `test_PartiesImmutableAcrossAllActions`; invariant `PartiesNeverChange` |
| Funding | Only the payer, only in `Created` status, pulls exactly the total, and checks the balance delta equals the amount (rejects fee-on-transfer tokens). | Source; fee-on-transfer test; live double-fund revert |
| Approval permissions | `approveMilestone` is payer-only, requires `Funded`, and cannot repeat. The recipient cannot approve. | Source; unit tests; live: recipient approval reverted `OnlyPayer` |
| Duplicate release | `released` is set and `releasedAmount`/`releasedCount` updated before the transfer; a second release reverts. After completion the status check blocks any release. | Source; unit and fuzz tests; live: duplicate and post-completion releases reverted |
| Reentrancy | Every state-changing function is `nonReentrant`, and release follows checks-effects-interactions. Reentrancy through a malicious token was attempted against fund, release (same and other milestone) and create; all failed. USDC itself has no transfer hooks. | Source; 4 reentrancy tests; Slither found no reentrancy |
| Cancellation | Payer-only, only while `Created` (nothing deposited). A cancelled agreement cannot be funded, approved or released. No funds move. | Source; unit tests; live: fund after cancel reverted |
| Accounting | `getAgreementBalance` = funded minus released per agreement. Token balance always covers the sum of per-agreement balances. Direct donations are ignored by accounting and unrecoverable. | Invariant tests (256 runs of 128,000 calls each); live balance deltas matched exactly |
| Arithmetic | Solidity 0.8 checked math; the sum of milestone amounts is the total, so mismatched totals are impossible; overflow reverts. | Overflow tests |

## 2. Limitations that remain by design

- **Funds can lock.** If the payer never approves, or the recipient is blocklisted by the USDC token, the agreement's funded USDC stays locked. There is no refund or re-route, deliberately, because any such path would be an extra withdrawal path. Screen recipients before funding.
- **Payer discretion.** The payer alone decides when milestones are approved. The recipient has no recourse inside the contract.
- **Unrecoverable donations.** Tokens sent straight to the contract address are stranded.
- **No audit.** An independent professional audit has not happened.

## 3. Automated checks

- Foundry: 66 of 66 pass on the standard runtime and 66 of 66 on Arc's runtime (`arc-forge test --network arc`, Arc Foundry v0.8.0-2, checksum verified).
- Adversarial suite (26 tests): value and unknown-selector rejection, an attacker handler that cannot gain USDC, a blocklisted recipient (atomic revert, no partial state), donations, cancel semantics, state machine, out-of-order releases, overflow.
- Slither: one result, "uninitialized local" on the running total in `createAgreement`. False positive: the variable intentionally starts at zero.

## 4. Live Arc Testnet verification (real transactions)

Script: `scripts/e2e-testnet.ts`. Result: 24 of 24 checks passed, 10 transactions, all successful. Hashes are in `docs/hackathon-evidence.md` and `docs/e2e-testnet-run.json`. It drove the deployed contract and real USDC through the exact helper code used for the CoindeccPay integration: create, exact approval, fund, approve, release by payer, release by recipient, completion, cancel, and nine revert checks.

## 5. Frontend verification

| Check | Result |
| --- | --- |
| Uses the deployed contract | Verified: the address comes from `VITE_FLOW_ESCROW_ADDRESS` (the testnet deployment), the ABI is generated from the compiled contract, and the deployed address responded to every call in the live run. |
| ABI matches deployed bytecode | Verified indirectly: all functions and events the app uses worked on the deployed address. |
| USDC address and decimals | From the generated registry; the contract's own `usdcDecimals()` returned 6. |
| Event decoding | The same event definitions decoded the live run (7 events for agreement #1). |
| Static review of UI flows | Done (see section 6 for what was fixed). |
| Executed through a browser wallet | Not verified. See below. |

**Limitation:** Arc Studio's sandbox has no browser wallet extension, so I could not click through the UI with a connected wallet. The live run above used throwaway local test wallets and the same contract, ABI and helper functions, not the React components or the wallet popup. Connecting a wallet, the network switch prompt, and wallet signing dialogs remain to be confirmed by you in the preview. Steps are in `docs/demo.md`.

## 6. Issues found and fixed in this pass

1. **Integration helpers failed for local (private key) accounts.** They passed only the account address to the wallet client, which made viem ask the RPC to sign (`eth_sendTransaction` is unsupported). They now pass the account object. Browser wallets were unaffected, but CoindeccPay server or script usage would have failed. Found by the live run.
2. **"Agreement not found" never appeared.** The details page keyed it off an error that this read never raises. It now reads the contract's own `AgreementNotFound` revert and separates it from an RPC failure.
3. **Silent read failures.** The dashboard now says when agreements could not be read, instead of showing an empty list.
4. **Arc RPC behavior.** Arc's load-balanced RPC can answer error `-32014` when a node has not imported the newest block. The event scanner now retries that with a short backoff instead of treating it as a failure and shrinking its scan range.
5. **Recipient checks.** The create form now also rejects the USDC token and escrow addresses as recipients (the contract already did).
6. **Evidence in the UI.** The agreement page shows the recipient's live USDC balance so a release can be seen to land.
7. **Mainnet readiness.** Arc mainnet is now a configured network, selected only by `VITE_FLOW_CHAIN_ID=5042`. Testnet stays the default, and a "Mainnet · real USDC" label shows when it is active.
