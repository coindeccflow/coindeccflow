# CoindeccFlow Mainnet build handoff

The local Mainnet frontend targets the verified escrow at
`0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043`, starting event scans at block
`28846016` on Arc chain `5042`. The verified receipt is in
`docs/mainnet-deployment-receipt.json`. Deployment cost 0.04372545242 USDC.
The successful receipt and creation-data match confirm deployment; they do not
mean the source has been verified on the explorer or independently audited.

The local `.env.local` contains public network settings plus the server-only
Alchemy key and is ignored by Git. `.env.mainnet.example` provides the public
contract configuration without a credential. The default `.env.example` and
shared source defaults remain Testnet. Nothing has been pushed, merged, or
published to the current Vercel production project.

`bun run verify:mainnet-rpc` confirms that viem can reach the deployed escrow
through the HTTP gateway, checks its token address, and rejects transaction
submission through that gateway. Wallet transactions remain with MetaMask.
`bun run preview:mainnet` serves the production build plus the RPC gateway on
127.0.0.1:4173. It is local development tooling, not public hosting.

## Final local validation

The rebuilt Mainnet frontend passed Vite production build (2m 23s), lint,
TypeScript, gateway tests, and live deployed-contract reads through the gateway.
Generated browser files include the deployed address and exclude the real API
key. Browser inspection confirmed Arc Mainnet, chain 5042, the verified escrow,
USDC address, and deployment block 28846016; the missing-contract warning is gone.
MetaMask was not detected in the in-app browser, so use the external browser
where MetaMask is installed for the wallet walkthrough. Reown remains optional
and its project ID has not been configured. Source verification could not be
completed via the explorer API: its read endpoint returned HTTP 403.

## Completed Mainnet payment walkthrough

Agreement #1 was created and funded with 0.01 USDC, then both 0.005 USDC
milestones were approved and released through the user's MetaMask workflow.
Read-only verification confirmed the two token payouts to the configured
recipient, completed status (2), released count 2, total released 10000,
remaining agreement balance 0, and residual token allowance 0.
Receipts and evidence are in `docs/mainnet-demo-evidence.json` and
`docs/hackathon-evidence.md`. No wallet approval was performed by the agent.

## Outstanding release items

- Source verification on the explorer remains pending (API returned HTTP 403).
- Independent security audit and rerun of the Arc Foundry tests are outstanding.
  The contract has no refund, pause, rescue, or upgrade mechanism.
- Changes remain on the local development branch; no push, merge, hosted
  frontend deployment, or production Vercel update has been performed.
- Dora description changes remain deferred at the user's request.

The Mainnet demo is complete. A public frontend release remains a separately
authorized step; it must retain the server-side key handling and hosting abuse
controls documented in `docs/phase1-alchemy.md`.
