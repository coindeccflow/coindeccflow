# Export review — 31 October 2026

Original archive SHA-256: `911a1be387dfcf4f59d5f5b92662b021548d7b514b6cf63309a7f22deac8fd37`.

## Changes

- Preserve `.env.mainnet.example` through Git; ignore local broadcast and Compass verification output.
- Resolve deployment project paths relative to script files rather than `/home/user/app`.
- Preserve Compass scripts under `scripts/arc-studio/`. Their packages are absent from the manifest; the public npm registry returned HTTP 404 for `@circlefin/compass-chains`. Remove the unusable package command and explicitly exclude these optional sources from lint and TypeScript checks. This does not repair Compass runtime deployment; use the existing Foundry route.
- Load Studio tracing and console capture only during Vite development. Production bundles must not contain this instrumentation.
- Run lint without automatic source fixes.
- Correct references to the absent AGENTS.md. Keep frontend environment values blank; do not silently activate an existing deployment.
- Preserve Solidity contracts, ABI, historical evidence, and original lockfile.

## Scope and limitations

No upload, deployment, wallet connection, funding, or live transaction tests were performed. Known dummy keys in vendored forge-std test fixtures are preserved. No obvious project credentials were found in the original review. This is not a formal security audit or dependency vulnerability audit.

## Private repository upload steps

1. Confirm `https://github.com/coindeccflow/coindeccflow` shows Private.
2. Extract this corrected ZIP into a new folder. Keep package.json at the repository root and include hidden configuration files.
3. Prefer cloning the existing repository and copying the extracted sources into it, including dotfiles. Preserve any existing repository content; review conflicts rather than overwrite blindly.
4. Inspect every staged filename and the staged diff. Do not stage a real .env, private keys, wallets, node_modules, dist, or broadcast output. Do not force-add ignored files.
5. Commit locally with `Initial commit — CoindeccFlow Arc Testnet milestone escrow` after reviewing the changes.
6. Push only when the owner explicitly authorizes upload. Repository upload is separate from deployment.

For later frontend hosting, install with Bun using the frozen lockfile, build with `bun run build`, and publish `dist` only after deployment is authorized. Configure the public VITE_FLOW_* values at build time; never put secrets in VITE_* variables. Confirm the existing testnet escrow address and deployment block independently; do not redeploy merely to host the frontend. Configure Reown allowed origins if WalletConnect is enabled. Contract deployment tools and live testnet rehearsal commands send transactions and are separate from the offline checks.

## Validation completed

- Frozen-lockfile dependency installation passed (832 packages); dependency lifecycle scripts were disabled during installation.
- Lint and TypeScript checks passed with optional Studio Compass sources explicitly excluded.
- Transaction error classification: 14/14 passed.
- Transaction lifecycle scenarios: passed.
- Transaction presentation and credential-redaction checks: passed.
- Solidity source and bun.lock are byte-for-byte unchanged from the original export.
- Foundry is unavailable locally, so contract tests were not rerun. No live rehearsal commands were run.

- Production build passed: 6,436 modules transformed. Third-party annotation warnings and large-chunk warnings remain (largest JavaScript chunk approximately 1.59 MB, 514 kB gzip).
- Production JavaScript scan found none of the Studio console/tracing message markers.
- Built with locally installed Bun 1.4.4 (the export pins 1.3.14); the frozen lockfile was honored.
