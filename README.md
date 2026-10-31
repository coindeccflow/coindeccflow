# CoindeccFlow

Programmable USDC milestone payments on Arc. A payer creates an agreement with milestones, locks the USDC in a noncustodial smart contract, approves each milestone, and the money is released to the recipient onchain. There are no admin keys, and escrowed funds can only ever go to the recipient.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Connect a wallet and see your agreements, funded and settled USDC, and recent activity.
- Create an agreement with a title, a recipient, and one or more milestones, then review it before submitting.
- Fund an agreement with the exact USDC amount (exact-amount approval, then deposit).
- Approve milestones as the payer and release payment as the payer or the recipient.
- Browse every onchain event with links to the Arc explorer.
- Track every milestone in one queue: what needs your approval, what is ready to release, and what is done.
- Switch between dark mode (default) and light mode. The choice is saved on your device.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, wagmi, viem, ConnectKit (wallet connection), Solidity 0.8, OpenZeppelin, Foundry.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install --frozen-lockfile
bun run dev          # app on http://localhost:5173
bun run contracts:build
bun run contracts:test
bun run check        # lint and typecheck
bun run e2e:testnet run   # live Arc Testnet rehearsal with throwaway wallets (see docs/testing.md)
bun run verify:reads      # read-only check of the deployed contract and agreement reads
bun run test:errors       # checks that wallet, network and contract errors are explained correctly
```

### Environment variables

Copy `.env.example` to `.env` and fill it in.

- `VITE_FLOW_CHAIN_ID`: chain the app runs on (default Arc Testnet, 5042002).
- `VITE_FLOW_ESCROW_ADDRESS`: address of the deployed escrow contract.
- `VITE_FLOW_DEPLOY_BLOCK`: block the contract was deployed at, so activity scans start there.
- `VITE_WALLETCONNECT_PROJECT_ID`: your WalletConnect (Reown) project id. Enables QR codes and mobile wallet links. See `docs/wallet-connection.md`.
- `USDC_ADDRESS` and `RPC_URL`: only for command-line deployment with Foundry.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional outside Arc Studio. Used only by the testnet rehearsal script when provided.

Restart the dev server after changing `.env`.

## Documentation

- [Wallet connection](docs/wallet-connection.md)
- [Testing](docs/testing.md)
- [CoindeccPay integration](docs/integration.md)
- [Demo walkthrough](docs/demo.md)
- [Deployment](docs/deployment.md)
- [Arc Mainnet deployment guide](docs/mainnet-deployment.md)
- [Verification report](docs/verification-report.md)
- [Hackathon evidence](docs/hackathon-evidence.md)

## Transaction tracking

Wallet requests show a waiting card with Dismiss, guidance if the wallet is slow, and a tray that keeps following submitted transactions while you browse. See `docs/transaction-ux.md`.

## Export portability review

See `docs/export-review.md` for the export corrections, validation results, and private repository upload instructions. Studio-specific Compass sources are preserved under `scripts/arc-studio/` and excluded from standalone checks; they require unavailable Studio packages.
