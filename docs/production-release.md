# Mainnet production release

Released on 31 October 2026 to the existing [CoindeccFlow Vercel domain](https://coindeccflow.vercel.app/).

## Release record

| Item | Value |
| --- | --- |
| Source repository | `coindeccflow/coindeccflow` |
| Mainnet release branch | `phase1/alchemy-mainnet-rpc` |
| Validated release revision | `5be087ca5ad5f8ff0184990468a2deb1f69cfdc0` |
| Main release merge | `5e8516738c2b9e7ccc37f3d6eeaae13dc95f4d84` |
| Production deployment | `dpl_FW3pnsFC3c6fDRSq9RMYY1Ps5pBq` |
| Previous production deployment retained for rollback | `dpl_FyhKVHh4yPjCngDfnFwf5U9XbUie` |
| Payment evidence | [Completed agreement #1](https://coindeccflow.vercel.app/agreement/1) |
| Published project description | [Dora project 48921](https://dorahacks.io/build/48921) |

## Environment configuration

`ALCHEMY_ARC_MAINNET_API_KEY` is stored as a non-revealable Vercel Secret for Production and Preview. Its value belongs only in the server environment. `COINDECCFLOW_RELEASE_NETWORK=mainnet` is a Config entry in those environments.

The existing three `VITE_FLOW_*` entries were preserved. `tools/build-release.mjs` reads the recorded deployment receipt and supplies the Mainnet chain, escrow address, deployment block, and `/api/arc-mainnet` path to the build subprocess. It does not overwrite saved Testnet values. Reown remains an optional, separate public project-ID setting.

Local environment files, test-wallet material, compiler output, screenshots, and toolchains are excluded by `.gitignore`. Never commit credentials or prefix a secret with `VITE_`.

## Hosting and RPC controls

Vercel builds the app with `bun tools/build-release.mjs` and deploys both `dist` and the `/api/arc-mainnet` server function. Publishing only `dist` would omit the gateway. `vercel.json` rewrites the known application routes while leaving API and asset requests intact.

The gateway permits app-specific read/simulation methods, escrow/USDC targets, and validated Multicall3 reads whose nested targets are also restricted. It bounds payload size, batch width, log ranges, and per-instance weighted request volume. Transaction signing and broadcasting remain with the wallet. Provider errors are sanitized.

Contract/state reads use Alchemy. Only bounded `eth_getLogs` requests use Arc’s fixed public endpoint, because Alchemy Free restricts log scans to ten-block ranges. Callers cannot supply upstream URLs.

A published Vercel firewall rule applies to exactly `/api/arc-mainnet`: 100 requests per 60 seconds per IP, with HTTP 429 above the limit. Origin rejection and the per-instance budget add protection; they are not authentication or a hard global spending cap.

## Validation and rollback

The hosted preview passed before the release was merged into `main`. Public production checks then confirmed chain 5042, USDC decimals 6, deployed escrow code, completed agreement/milestone reads, and completion events. Signing/broadcast requests and unrelated browser origins were rejected. Direct agreement and Settings routes worked. A scan of 89 public browser assets found no real Alchemy credential.

The public agreement displayed the complete 0.01 USDC payment and seven lifecycle entries. Dora’s saved public description included the live app, completed demo, and actual transaction links. These checks sent no paid transactions.

Keep the previous production deployment available for rollback through Vercel. Restoring a frontend deployment does not reverse blockchain transactions. The independent audit, explorer source verification, and unconfirmed submission materials are tracked in [hackathon evidence](hackathon-evidence.md).
