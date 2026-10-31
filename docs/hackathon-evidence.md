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

## Arc Mainnet (PENDING until you deploy yourself)

| Field | Value |
| --- | --- |
| Arc Mainnet escrow contract address | PENDING |
| Deployment transaction hash | PENDING |
| Deployment block | PENDING |
| Explorer link (contract) | PENDING (format: `https://explorer.arc.io/address/<address>`) |
| Source verified on explorer | PENDING |
| Verified USDC token address | `0x3600000000000000000000000000000000000000` (6 decimals). Source: Arc docs, Contract addresses. Read-only check against `rpc.mainnet.arc.io` during preparation: `symbol()` = `USDC`, `decimals()` = `6`. Re-check at deployment time. Link: <https://explorer.arc.io/address/0x3600000000000000000000000000000000000000> |
| Mainnet funding transaction hash | PENDING |
| Mainnet milestone 1 release transaction hash | PENDING |
| Mainnet milestone 2 release transaction hash | PENDING |
| Explorer links for the above | PENDING (format: `https://explorer.arc.io/tx/<hash>`) |

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
