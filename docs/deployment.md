# Deployment

## Arc Testnet (done)

The escrow is deployed on Arc Testnet; configure its address and deployment block in your local `.env` (`VITE_FLOW_ESCROW_ADDRESS`, `VITE_FLOW_DEPLOY_BLOCK`). Historical evidence is in `docs/read-verification.json`; independently confirm those values before use.

## Redeploying yourself with Foundry

The contract has no owner, so the deployer holds no special rights.

```bash
# one-time: import a deployer key into an encrypted keystore
cast wallet import flow-deployer --interactive

export USDC_ADDRESS=<USDC ERC-20 address from src/onchain-facts.ts>
export RPC_URL=<RPC URL from src/onchain-facts.ts>
forge script contracts/script/DeployCoindeccFlow.s.sol:DeployCoindeccFlow \
  --rpc-url $RPC_URL --account flow-deployer --broadcast
```

Then set `VITE_FLOW_ESCROW_ADDRESS`, `VITE_FLOW_DEPLOY_BLOCK` (and `VITE_FLOW_CHAIN_ID` if the chain changed) in `.env` and restart the dev server.

Never paste a private key into a command or file.

## Mainnet

See `docs/mainnet-deployment.md`. Arc Studio never deploys to mainnet; you deploy from your own wallet.

## Exported Arc Studio tools

The preserved `scripts/arc-studio/compass-*.ts` sources depend on Arc Studio Compass packages that are not available from the public npm registry. They are excluded from portable lint/type checks and have no package command. Do not use them as a standalone deployment route. Use the Foundry instructions above. `deploy:self` is an alternative Circle SDK tool requiring separately supplied credentials; it has not been live-tested in this review.
