# Arc Mainnet deployment guide

> Warning: Transactions on mainnet involve real funds and, once submitted, are irreversible. Arc Studio may generate or edit code or configuration that references mainnet, but Arc Studio does not deploy to, transact on, sign for, fund, or otherwise interact with mainnet on your behalf. Any code used for mainnet must be independently reviewed, tested, validated, deployed, and operated by you outside of Arc Studio. You are solely responsible for any losses, errors, or other consequences resulting from your use of any code, configuration, or output generated or edited through Arc Studio in connection with mainnet. Before proceeding, you should first use testnet, obtain an independent professional audit, and carefully review all wallet addresses, contract addresses, chain settings, permissions, and other configuration details. Only continue to mainnet after you have completed your independent review and have determined that you want to proceed.

Nothing in this repository deploys to mainnet by itself. Every step below is run by you, from your own wallet, outside Arc Studio. Never paste a private key into chat, a file, or a command.

## 1. Verified network configuration

| Item | Value | Source |
| --- | --- | --- |
| Network name | Arc | Arc docs, Connect to Arc |
| Chain ID | `5042` (hex `0x13B2`) | Arc docs, RPC endpoints |
| Primary RPC | `https://rpc.mainnet.arc.io` | Arc docs, RPC endpoints |
| Gas token | USDC (18 decimals natively) | Arc docs, Gas and fees |
| Explorer | `https://explorer.arc.io` (Blockscout) | Arc docs; `viem/chains` definition |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000`, 6 decimals | Arc docs, Contract addresses |
| Minimum base fee | 20 Gwei (transactions with a lower `maxFeePerGas` can be silently dropped) | Arc docs, EVM differences / Gas and fees |

References: <https://docs.arc.io/arc/references/rpc-endpoints.md>, <https://docs.arc.io/arc/references/contract-addresses.md>, <https://docs.arc.io/arc/references/evm-differences.md>, <https://docs.arc.io/arc/references/gas-and-fees.md>. The same chain ID, RPC, explorer and USDC values are in `src/onchain-facts.ts`.

Checked read-only against mainnet during preparation: the contract at the USDC address answers `symbol()` = `USDC` and `decimals()` = `6`. Re-check this yourself right before deploying:

```bash
arc-cast call 0x3600000000000000000000000000000000000000 "symbol()(string)" --rpc-url https://rpc.mainnet.arc.io
arc-cast call 0x3600000000000000000000000000000000000000 "decimals()(uint8)" --rpc-url https://rpc.mainnet.arc.io
```

Native and ERC-20 USDC are one balance seen two ways. The escrow only uses the 6-decimal ERC-20 view and cannot receive native value.

## 2. Pre-flight checklist (do all of these first)

1. Independent professional audit of `contracts/CoindeccFlowEscrow.sol`. The built-in review and tests are not a substitute.
2. Run the suite on Arc's runtime: `arc-forge test --network arc` (66 of 66 passed during preparation; rerun on your machine).
3. Run the live testnet rehearsal: `bun run e2e:testnet run` (see `docs/e2e-testnet-run.json`).
4. Decide how you will screen recipients. A recipient that the USDC token blocklists cannot receive funds, and that agreement's funds stay locked (see section 7).
5. Install Arc Foundry (`arc-forge`, `arc-cast`): <https://docs.arc.io/arc/tutorials/install-arc-foundry.md>. Verify the download checksum.
6. Use a fresh deployer wallet holding a small amount of mainnet USDC for gas. The contract has no owner, so the deployer holds no special rights afterwards.

## 3. Deploy

```bash
# one-time: store the deployer key in an encrypted keystore (you type the key at the prompt, nowhere else)
arc-cast wallet import flow-mainnet-deployer --interactive

export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export RPC_URL=https://rpc.mainnet.arc.io
export DEPLOYER=<your deployer wallet address>

# dry run first: simulates only, sends nothing
arc-forge script contracts/script/DeployCoindeccFlow.s.sol:DeployCoindeccFlow \
  --rpc-url $RPC_URL --account flow-mainnet-deployer --sender $DEPLOYER

# real deployment: only when you are certain
arc-forge script contracts/script/DeployCoindeccFlow.s.sol:DeployCoindeccFlow \
  --rpc-url $RPC_URL --account flow-mainnet-deployer --sender $DEPLOYER --broadcast
```

If a transaction sits pending, check that `maxFeePerGas` is at least 20 Gwei (Arc docs); pass an explicit `--gas-price` at or above that and retry.

Record the contract address and deployment transaction hash from the output, then get the deployment block:

```bash
arc-cast receipt <deployment tx hash> blockNumber --rpc-url $RPC_URL
```

Confirm the deployment on-chain:

```bash
arc-cast call <escrow address> "usdc()(address)" --rpc-url $RPC_URL        # must equal the USDC address above
arc-cast call <escrow address> "usdcDecimals()(uint8)" --rpc-url $RPC_URL   # must print 6
arc-cast call <escrow address> "agreementCount()(uint256)" --rpc-url $RPC_URL  # must print 0
```

## 4. Verify the source on the explorer

The Arc Testnet explorer runs Blockscout and Arc documents verification with `arc-forge verify-contract` plus the Blockscout verifier. The mainnet explorer exposes the same Blockscout API under `https://explorer.arc.io` (per the `viem/chains` definition), so the command is the testnet one with the mainnet URL. Dry-run the exact command on testnet first, and check <https://docs.arc.io> for any mainnet-specific note before running it.

```bash
arc-forge verify-contract <escrow address> contracts/CoindeccFlowEscrow.sol:CoindeccFlowEscrow \
  --chain-id 5042 \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api/ \
  --constructor-args $(arc-cast abi-encode "constructor(address)" 0x3600000000000000000000000000000000000000)
```

Use the same compiler settings as the deployment (`foundry.toml`). After success, the explorer address page shows a Contract tab with source and ABI. You can also submit the source manually on the explorer's contract verification page.

## 5. Point the frontend at mainnet

1. Copy the values from `.env.mainnet.example` into `.env`:
   - `VITE_FLOW_CHAIN_ID=5042`
   - `VITE_FLOW_ESCROW_ADDRESS=<your mainnet escrow address>`
   - `VITE_FLOW_DEPLOY_BLOCK=<your deployment block>`
2. Restart the dev server (Vite reads `.env` only at startup).
3. The header must show "Arc" with a "Mainnet · real USDC" label, and the explorer links must go to `explorer.arc.io`.
4. Add Arc to your wallet from <https://docs.arc.io/arc/references/connect-to-arc.md> if it is not already there.

The app never falls back to testnet addresses: with a wrong or empty address it shows a setup banner instead.

## 6. Verify mainnet transactions

Start with the smallest amount that proves the flow (the 0.20 USDC, two-milestone demo). For every step below, confirm on the explorer and with `arc-cast`:

1. Create: receipt `status` is success, `to` equals your escrow address, and an `AgreementCreated` event with the expected recipient and total is present.
2. Approve USDC: allowance for the escrow equals exactly the agreement total, no more.
3. Fund: `getAgreement(id)` shows `fundedAmount` = total and status `1` (Funded); `getAgreementBalance(id)` equals the total; the payer balance dropped by the total (plus gas).
4. Approve milestone 1, then release it: the recipient's USDC balance rose by exactly the milestone amount (plus nothing else), `getAgreementBalance(id)` fell by the same amount.
5. Release milestone 2: status is `2` (Completed), balance is `0`, `AgreementCompleted` was emitted.
6. Save every transaction hash and explorer link in `docs/hackathon-evidence.md`.

Useful commands:

```bash
arc-cast call <escrow> "getAgreement(uint256)" <id> --rpc-url $RPC_URL
arc-cast call <escrow> "getAgreementBalance(uint256)(uint256)" <id> --rpc-url $RPC_URL
arc-cast call 0x3600000000000000000000000000000000000000 "balanceOf(address)(uint256)" <wallet> --rpc-url $RPC_URL
arc-cast receipt <tx hash> --rpc-url $RPC_URL
```

## 7. Security considerations

- **No refund path.** After funding, USDC leaves escrow only by payer approval followed by release to the fixed recipient. A payer who never approves locks the funds; a recipient can never be changed. Agree terms and verify the recipient address off-chain before funding.
- **Unpayable recipients.** Arc blocks value transfers to or from blocklisted addresses at runtime. If the recipient cannot receive USDC, releases revert and the funds stay locked until the block is lifted. Screen recipients before creating an agreement.
- **Cancellation** works only before funding.
- **Stranded donations.** USDC sent directly to the escrow address (outside `fundAgreement`) cannot be recovered by anyone.
- **Token trust.** The escrow is bound to one ERC-20 at deployment and assumes standard, non-rebasing behavior. Circle controls the USDC contract, including its blocklist.
- **Unaudited.** The contract has been through automated tests (66 passing, also under Arc's runtime), a static-analysis pass, and an automated review. None of that is a formal audit.
- **Key hygiene.** Deploy and operate from wallets you control, with keystores or hardware wallets. Never share keys or seed phrases with anyone, including Arc Studio.
- **Frontend.** Double-check the contract address in the explorer before sending funds. Serve the app only from a domain you control.

## 8. Cost considerations

Arc fees are paid in USDC. The fee is `gas used × effective gas price`. Arc documents a minimum base fee of 20 Gwei and a maximum of 20,000 Gwei, so the cost of a transaction is bounded but not fixed.

Measured on Arc Testnet (effective gas price 25 Gwei at the time):

| Operation | Gas used | Fee at 25 Gwei |
| --- | --- | --- |
| Deploy escrow | 1,841,053 | 0.046 USDC |
| Create agreement (2 milestones) | 448,742 | 0.0112 USDC |
| USDC approve (exact) | 55,426 | 0.0014 USDC |
| Fund | 92,456 | 0.0023 USDC |
| Approve milestone | 57,429 | 0.0014 USDC |
| Release milestone (first / second) | 128,135 / 85,470 | 0.0032 / 0.0021 USDC |
| Cancel (unfunded) | 35,141 | 0.0009 USDC |

A complete two-milestone agreement (create, approve USDC, fund, 2 approvals, 2 releases) used about 925,000 gas, roughly 0.023 USDC at 25 Gwei. Deployment at the documented floor (20 Gwei) would be about 0.037 USDC, and at the documented ceiling (20,000 Gwei) about 36.8 USDC. Mainnet gas amounts may differ from testnet; check the gas tracker at <https://explorer.arc.io/gas-tracker> and simulate with the dry run before broadcasting. Gas for each milestone action is paid by whoever sends it, so a recipient who releases needs a little USDC.
