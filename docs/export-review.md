# Export review — 31 October 2026

This is the historical review of the original Arc Studio export, before the subsequent Mainnet release. For current hosting, wallet-demo results, and submission materials, see [production release](production-release.md) and [hackathon evidence](hackathon-evidence.md).

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

## Repository and hosting handoff

The reviewed sources have since been committed to `coindeccflow/coindeccflow`, and the validated Mainnet release is live on Vercel. The repository is currently private. Public visibility and submission completeness must be checked separately; a repository link does not grant judges access to private code.

Keep real environment files, credentials, wallet material, dependency directories, build output, and broadcast artifacts out of Git. The public `.env.example` and `.env.mainnet.example` templates contain configuration placeholders, not credentials. Inspect staged filenames and the diff before publishing changes.

The current Vercel release includes both the frontend and server-side RPC function. A static-only upload of `dist` would omit that function. Use the current [release configuration](production-release.md), rather than the initial static-hosting plan. Contract deployment and live transaction commands require a separately reviewed wallet action.

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
