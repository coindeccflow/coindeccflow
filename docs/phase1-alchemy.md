# Phase 1 Alchemy RPC

The browser may opt into `/api/arc-mainnet` using
`VITE_ARC_MAINNET_RPC_PATH`. The gateway uses only the server environment
`ALCHEMY_ARC_MAINNET_API_KEY`; never put that key in a VITE variable.
The upstream hostname is fixed. Errors are sanitized. Only read/simulation
methods are allowed; wallet transactions continue through existing connectors.
No automatic public fallback is used when the gateway is selected, so a broken
Alchemy configuration is visible. Without the setting, existing RPCs remain.

Use an isolated Vercel project only after separate approval. Do not edit the
current production environment. Configure the server secret privately and set
provider quotas plus hosting rate limits before exposing the gateway publicly;
Origin checks do not prevent direct clients from consuming the quota.
Vite alone does not run the server function; use a compatible function runtime.

No real credential was supplied or used during implementation. Verify chain ID
5042 and USDC ERC-20 address 0x3600000000000000000000000000000000000000,
with 6 decimals, through the configured gateway before deployment approval.
The native gas denomination uses 18 decimals. No Mainnet escrow address is
invented: leave it empty until a separately authorized deployment exists.
Mainnet remains blocked by the independent contract audit and deployment steps
in the readiness audit. Testnet and Reown settings are unchanged.

Run `bun tests/mainnet-rpc.mjs` for gateway checks, `bun run check`,
`bun run build`, and the existing transaction tests. Contract tests use Foundry.

## Local verification

`bun run test:rpc` runs the gateway regression tests without a real provider.
`bun run verify:mainnet-rpc` explicitly starts a temporary loopback HTTP server,
uses viem through the gateway to read chain ID and token decimals, checks that
transaction submission is rejected, and shuts the server down. It reads the key
from the ignored `.env.local` file. It never signs or broadcasts a transaction.
This verifies the actual HTTP/viem gateway path, not a deployed Vercel function
or browser wallet session. A Vercel preview still requires separate approval.

The live read-only integration passed for chain ID 5042 and USDC decimals 6.
The gateway accepts standard requests with omitted params (including viem's
`eth_chainId` request), while rejecting unsupported methods and malformed params.

Validation on 2026-10-31: lint and TypeScript passed; gateway regressions and
live HTTP/viem integration passed. The production build with
`VITE_ARC_MAINNET_RPC_PATH=/api/arc-mainnet` passed under official Node 22.23.4
(Vite 6.4.5, 5m 53s). It emitted dependency annotation and large-chunk warnings.
The built browser files contained the proxy path and excluded the actual key.
Bun builds were interrupted after prolonged transformation; the app-bundled
Node runtime could not load Rollup because of macOS library validation.
The successful build used a checksum-verified temporary official Node runtime,
without changing system settings or repository dependencies.
No browser automation surface was available, so visual wallet interaction
remains unverified. Foundry contract tests remain blocked by missing Foundry.
No public preview, push, production change, contract deployment, or transaction
was performed.

## Isolated Mainnet preview

The ignored local `.env.local` selects chain 5042, the same-origin gateway,
and blank escrow address/deployment block. The shared default remains Testnet.
The Mainnet banner explains that agreement operations are unavailable until a
Mainnet escrow exists; the create submission button is explicitly disabled
without an escrow address, in addition to the existing submit-handler guard.
No Testnet contract address is copied into the Mainnet configuration.
A supplied public wallet can be checked read-only for deployment preparation;
no gas budget or signing authorization is inferred from supplying its address.

## Deployment preparation (read-only)

With the approved deployment ceiling of 0.05 USDC, the source was compiled
using solc 0.8.28, optimizer 200 runs, and Cancun. At Mainnet block 28844365,
Alchemy estimated 1,724,263 gas from the supplied deploying wallet: 0.04439977225
USDC at 25.75 Gwei, or 0.0488397675 with a 10% gas allowance. This is an
estimate, not a deployment or receipt. The independent audit is outstanding.

`tools/estimate-mainnet-deployment.mjs` uses an external pinned compiler module
selected via SOLC_MODULE and records compiler input, bytecode artifact, and
read-only estimate under ignored `.e2e/mainnet-deployment/`. It never signs.
`bun tools/prepare-mainnet-deployment.mjs` generates a local wallet review page
and unsigned transaction from those artifacts. Serve only index.html and
deploy.js on loopback; never expose the full workspace or environment files.
The page refreshes gas estimation before requesting a wallet transaction,
enforces chain/wallet and a 0.05 USDC maximum gas liability, preserves at least
0.04175391550860238 USDC, and blocks duplicate wallet submissions. The user
must review and sign through MetaMask. Browser-wallet availability and actual
submission remain unverified. `bun tests/deployment-review.mjs` tests fee,
reserve, wallet, chain, and duplicate-submission guards against mocked RPCs.
