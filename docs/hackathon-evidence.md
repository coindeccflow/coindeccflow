# CoindeccFlow: hackathon evidence

Every value is either verified (with its source) or marked PENDING. Nothing here is estimated or invented. Update PENDING fields only with real values you have checked yourself.

## Project

| Field | Value |
| --- | --- |
| Project | CoindeccFlow, programmable USDC milestone payments on Arc |
| Arc Studio development evidence | Built and iterated in Arc Studio. Source of truth: this repository (`contracts/`, `src/`, `scripts/`, `docs/`). Screenshots or export of the Arc Studio project: PENDING |
| GitHub repository | PENDING |
| Live application URL | PENDING (deploy via Netlify, Vercel or Hugging Face from Arc Studio, then record the URL) |
| Demo video link | PENDING |

## Arc Mainnet (deployment and end-to-end payment demonstration verified)

| Field | Value |
| --- | --- |
| Arc Mainnet escrow contract address | `0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043` |
| Deployment transaction hash | `0xd17e192617550ec249d1bbfe7782917b256e234589d2d4b8393218131869d6c7` |
| Deployment block | 28846016 |
| Explorer link (contract) | https://explorer.arc.io/address/0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043 |
| Source verified on explorer | PENDING |
| Verified USDC token address | `0x3600000000000000000000000000000000000000` (6 decimals). Source: Arc docs, Contract addresses. Read-only check against `rpc.mainnet.arc.io` during preparation: `symbol()` = `USDC`, `decimals()` = `6`. Re-check at deployment time. Link: <https://explorer.arc.io/address/0x3600000000000000000000000000000000000000> |
| Mainnet agreement creation | [successful transaction](https://explorer.arc.io/tx/0xf41036c626bc24b9870f3fcb8c2837178be4f100ed9c5f9b1d8ba56aa955a943) — agreement #1, 0.01 USDC, two 0.005 milestones; unfunded |
| Mainnet token allowance | [successful exact 0.01 USDC approval](https://explorer.arc.io/tx/0x819eee56f030d4485f8a47f9a4dfaa243c4123a67baa8b437e3a76c5282f29ab) |
| Mainnet funding transaction hash | [confirmed 0.01 USDC funding](https://explorer.arc.io/tx/0x033468db2012ebefd30e73aa3e9f6d580f17eb6f551ced939748c32d61db4ee3) |
| Mainnet milestone 1 release transaction hash | [confirmed 0.005 USDC payout](https://explorer.arc.io/tx/0xacbbb9e11c3f9aab5e2fed6684e790b11c424f43756f39c73849c62f7ee35546) — token Transfer event verified |
| Mainnet milestone 2 release transaction hash | [confirmed final 0.005 USDC payout](https://explorer.arc.io/tx/0xa0fa938d033f44c819a01a77ca1d7bedb8ba023a741aa391f98ecda66e0245d3) — token Transfer event verified; agreement completed, remaining balance zero |
| Explorer links for the above | Linked individually above; structured evidence: `docs/mainnet-demo-evidence.json` |

Procedure: `docs/mainnet-deployment.md`.

## Arc Testnet (verified, real transactions)

Escrow contract: `0x24a142b37feaddae8985d54d00331c9c12d95c11` on Arc Testnet (chain 5042002), deployed in block 69806270.
Contract: <https://explorer.testnet.arc.io/address/0x24a142b37feaddae8985d54d00331c9c12d95c11>
Deployment transaction: [`0xe88f37ca…b566ee`](https://explorer.testnet.arc.io/tx/0xe88f37ca824fb671dde21ecce21c8f6ab29f268de48b078ea17c2ef5a4b566ee)

Live rehearsal of the full flow (agreement #1, 0.20 USDC, two milestones of 0.10), run with `bun run e2e:testnet run`, which uses the same helper code as the CoindeccPay integration. 24 of 24 checks passed. Full output: `docs/e2e-testnet-run.json`. Testnet wallets were throwaway test wallets, payer `0x44AAdb3A315549fd6B67119c3C2acF50a6d52068`, recipient `0x7b2F0A0010Cb7D772260F595BdF09B7cda47B350`.

| Step | Transaction | Block |
| --- | --- | --- |
| Create agreement | [`0x976253d8…e6e5bd`](https://explorer.testnet.arc.io/tx/0x976253d83fb96500c44f2e699b6f17ee9cd5cbb6beb2753f5933610f44e6e5bd) | 69811472 |
| USDC approve, exact 0.20 | [`0x2baa18b1…457b18`](https://explorer.testnet.arc.io/tx/0x2baa18b110b4673fb5cfa6e6382ba5093f16a0004d68ad9d1542db876f457b18) | 69811481 |
| Fund agreement (0.20 USDC) | [`0xe4716324…fe3cb5`](https://explorer.testnet.arc.io/tx/0xe471632470f09585c6934c3c120519b065ef5a5901324dc9d8b4796fb5fe3cb5) | 69811489 |
| Approve milestone 1 | [`0x10d03b32…c6960c`](https://explorer.testnet.arc.io/tx/0x10d03b32e7a3d203d7b3f0c78b9c53de04d4e745feea867bb776f29e30c6960c) | 69811497 |
| Release milestone 1 (0.10, by payer) | [`0xdb833816…dab8b`](https://explorer.testnet.arc.io/tx/0xdb83381653cd86fcc42667e1c9fd52cf48a69dbfb1fdd4d630c637e5354dab8b) | 69811506 |
| Approve milestone 2 | [`0xddbada16…d0a730`](https://explorer.testnet.arc.io/tx/0xddbada1613b2c1848f00aed630e4cce2596ff30d9af8654753b8942425a0d730) | 69811523 |
| Release milestone 2 (0.10, by recipient) | [`0xdfb3b601…f112d`](https://explorer.testnet.arc.io/tx/0xdfb3b60159bff65e6f605284cb8bd95a01a28fd249eff873789d6fd0578f112d) | 69811531 |

Observed in that run: recipient balance rose by exactly 100000 base units (0.10 USDC) after milestone 1; remaining escrow went 0.20 to 0.10 to 0; final status Completed; duplicate release, release before approval, release before funding, a non-payer fund, a non-payer approval, a second fund, and funding after cancellation all reverted with the expected error.

Not yet shown: the same flow executed by a person through the browser UI with a browser wallet. Record that run here when you do it (transaction hashes from the UI): PENDING.

## Test results

| Suite | Result | How to rerun |
| --- | --- | --- |
| Foundry, standard runtime | 66 passed, 0 failed (40 original + 26 adversarial/invariant) | `bun run contracts:test` |
| Foundry, Arc runtime (`arc-forge`, Arc Foundry v0.8.0-2) | 66 passed, 0 failed | `arc-forge test --network arc` |
| Static analysis (Slither) | 1 informational-level hit, a false positive (a counter that intentionally starts at zero) | see `docs/verification-report.md` |
| Live Arc Testnet end-to-end | 24 of 24 checks passed | `bun run e2e:testnet run` |
| Lint and typecheck | 0 errors | `bun run check` |
| Independent professional audit | PENDING | |

Details: `docs/verification-report.md`, `docs/testing.md`.

Mainnet agreement #1 completed through the browser-wallet workflow on 2026-10-31. Both milestones were approved and paid, totaling 0.01 USDC to `0x408ADdE0346D7a9aDf1B6C5A2E2AB236Fa17d412`. Read-only verification confirmed status 2, releasedCount 2, releasedAmount 10000, zero remaining agreement balance, and zero residual token allowance. Mainnet explorer source verification and independent audit remain outstanding. Production Vercel remains unchanged.
