# CoindeccFlow

Programmable USDC milestone payments on Arc. A payer creates an agreement, funds the escrow, and approves completed milestones. The payer or recipient can then release each approved payment to the agreement’s fixed recipient.

Built with [Arc Studio](https://studio.arc.io).

[Live app](https://coindeccflow.vercel.app/) · [Completed Mainnet demo](https://coindeccflow.vercel.app/agreement/1) · [Dora project](https://dorahacks.io/build/48921)

## Live Mainnet implementation

The app is deployed on Arc Mainnet (chain ID **5042**) using escrow [`0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043`](https://explorer.arc.io/address/0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043).

Agreement #1 completed a real **0.01 USDC** payment through two approved payouts of **0.005 USDC**. The [final payout transaction](https://explorer.arc.io/tx/0xa0fa938d033f44c819a01a77ca1d7bedb8ba023a741aa391f98ecda66e0245d3) records completion. The live agreement shows both milestones released, zero remaining agreement balance, and transaction history. See [hackathon evidence](docs/hackathon-evidence.md) for the deployment, funding, and payout links.

## Features

- Wallet connection through ConnectKit, wagmi, and viem; the Mainnet walkthrough used MetaMask.
- Agreement creation with a fixed recipient and one or more USDC milestones.
- Exact-amount token approval and escrow funding.
- Payer approval of milestones, followed by payment release by the payer or recipient.
- Agreement dashboards, milestone queues, transaction tracking, and explorer links.
- Light and dark themes.

WalletConnect QR codes and mobile deep links require a separately configured Reown project ID. Injected browser wallets work without one. See [wallet connection](docs/wallet-connection.md).

## Development

Prerequisites: [Bun](https://bun.sh) for the app and [Foundry](https://book.getfoundry.sh) for Solidity tests.

```bash
bun install --frozen-lockfile
bun run dev             # local frontend; defaults to Arc Testnet
bun run contracts:build
bun run contracts:test
bun run check           # lint and TypeScript
bun run test:rpc         # mocked gateway regression tests; no wallet transaction
```

Use `.env.example` as the reference for an ignored local environment file. Configure the escrow address and deployment block for the selected network. Local Vite development uses the Testnet defaults; the live Vercel release selects Mainnet.

For local Mainnet work, use `.env.mainnet.example` as the configuration reference and provide the Alchemy key privately in the ignored `.env.local`. Build and serve the frontend together with its gateway:

```bash
COINDECCFLOW_RELEASE_NETWORK=mainnet bun tools/build-release.mjs
bun run preview:mainnet  # loopback-only frontend plus /api/arc-mainnet
```

`bun run verify:mainnet-rpc` performs live read-only gateway checks. Deployment tools and the Testnet end-to-end rehearsal send transactions; run those only with an appropriate wallet and explicit spending authorization.

### Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_FLOW_CHAIN_ID` | Public network ID; local default is Arc Testnet, 5042002. |
| `VITE_FLOW_ESCROW_ADDRESS` | Public escrow address on that network. |
| `VITE_FLOW_DEPLOY_BLOCK` | First block for event-history scans. |
| `VITE_WALLETCONNECT_PROJECT_ID` | Optional public Reown project ID for QR/mobile links. |
| `VITE_ARC_MAINNET_RPC_PATH` | Same-origin Mainnet gateway path, `/api/arc-mainnet`. |
| `ALCHEMY_ARC_MAINNET_API_KEY` | Server-only secret; never put it in a `VITE_*` variable. |
| `COINDECCFLOW_RELEASE_NETWORK` | Hosting build selector; `mainnet` uses the recorded deployment receipt. |

The Vercel project stores the Alchemy key as a Secret for Production and Preview. The build selector applies Mainnet settings inside the build process while preserving saved Testnet values. [Release configuration](docs/production-release.md) explains the deployed function, routing, and rate controls.

## Implementation status

CoindeccFlow is a working hackathon prototype with a completed Mainnet payment demonstration. “Prototype” describes its development and assurance stage. An independent professional security audit and explorer source verification are outstanding. The escrow has no owner/admin, refund, pause, rescue, or upgrade mechanism; funded agreements depend on milestone approvals and successful token transfers.

## Documentation

- [Hackathon evidence and outstanding submission items](docs/hackathon-evidence.md)
- [Mainnet build status](docs/mainnet-build-status.md)
- [Production release](docs/production-release.md)
- [RPC gateway](docs/phase1-alchemy.md)
- [Wallet connection](docs/wallet-connection.md)
- [Testing](docs/testing.md)
- [CoindeccPay integration](docs/integration.md)
- [Testnet demo walkthrough](docs/demo.md)
- [Deployment](docs/deployment.md)
- [Mainnet deployment guide](docs/mainnet-deployment.md)
- [Historical verification report](docs/verification-report.md)
- [Transaction tracking](docs/transaction-ux.md)
- [Export portability review](docs/export-review.md)
- [Documentation and credential review](docs/repository-review.md)

The frontend uses React, TypeScript, Vite, and Tailwind CSS. Contracts use Solidity, OpenZeppelin, and Foundry. Optional Arc Studio Compass sources are preserved under `scripts/arc-studio/`; their Studio-only dependencies are excluded from standalone checks.
