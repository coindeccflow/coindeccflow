# Alchemy Mainnet RPC gateway

The live Mainnet frontend uses the same-origin `/api/arc-mainnet` function. The Alchemy key is read only from the server environment as `ALCHEMY_ARC_MAINNET_API_KEY`; it must never be a `VITE_*` value or part of browser assets.

## Request routing and restrictions

- Alchemy handles permitted contract and state reads.
- Bounded `eth_getLogs` requests use the fixed public Arc endpoint. Alchemy Free’s ten-block scan limit prevents the app’s historical scans from using that provider.
- Upstream URLs and escrow/USDC targets are fixed in server code.
- Multicall3 is allowed only for validated `aggregate3` requests whose inner calls target the configured escrow or USDC contract.
- Payloads, batch width, log ranges, and weighted per-instance request volume are bounded. The Vercel firewall adds a published 100-request/60-second limit per IP for this path.
- Unrelated browser origins are rejected and provider errors are sanitized. These controls are not authentication or a hard global spend cap.
- Signing and broadcasting methods are rejected. Wallet transactions continue through the existing connectors and require wallet approval.

The Vercel Secret and release selector are configured for Production and Preview. The selector applies Mainnet settings from the verified deployment receipt without overwriting saved Testnet configuration. See [production release](production-release.md).

## Local validation

Vite alone does not run the server function. Use the loopback-only preview tool to serve the production build and gateway together. Provide the key privately in an ignored `.env.local`, using `.env.mainnet.example` as the configuration reference.

```bash
bun run test:rpc
bun run verify:mainnet-rpc
COINDECCFLOW_RELEASE_NETWORK=mainnet bun tools/build-release.mjs
bun run preview:mainnet
```

The mocked regression suite verifies the gateway policy and sanitized failures. The opt-in live suite starts a temporary loopback server and checks actual viem/wagmi reads, deployed escrow/token settings, completed agreement #1, and bounded completion events. It never signs or broadcasts.

The release also passed public Vercel read-only checks. A scan of 89 public browser assets at release found no Alchemy credential. The completed Mainnet wallet demonstration and current assurance limitations are recorded in [Mainnet status](mainnet-build-status.md); passing RPC checks does not constitute a contract security audit.
