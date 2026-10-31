# Mainnet production release candidate

Requested destination: existing `coindeccflow.vercel.app` Vercel application,
linked to `coindeccflow/coindeccflow`; verify the actual project, owner, domain,
and current production deployment before changes. Preserve the previous
production deployment ID and public Testnet values for rollback.

Preserve existing Vercel environment variable values. Add only:

- COINDECCFLOW_RELEASE_NETWORK=mainnet for the intended Mainnet deployment.
- ALCHEMY_ARC_MAINNET_API_KEY: store privately as a server-only secret.

`tools/build-release.mjs` selects the verified receipt's chain, escrow, block,
and RPC path inside the build subprocess when the new selector is mainnet.
It does not modify stored Testnet values, files, or existing environment entries.
Preserve any existing Reown/WalletConnect project ID and allowed domains.
User explicitly authorized server-only key storage in this Vercel project;
this authorization does not mean the key has been uploaded successfully.

Never upload `.env.local`, `.e2e`, toolchains, compiler artifacts, or test wallet
material. Deploy the reviewed Git revision; local secrets do not belong in Git.
`vercel.json` routes the known SPA pages to index.html while leaving `/api` and
static asset routes untouched. The API function must be deployed with the app,
not only the static dist directory. Configure distributed hosting rate controls and Alchemy quotas before public
exposure. The gateway now restricts contract targets, method payloads, log
ranges, batch size and per-instance weighted request volume. Origin checks are
not authentication, and the per-instance budget is not a distributed rate limit.

Validate a preview before promoting: home, direct agreement and settings links,
Mainnet chain/address, actual server-side RPC eth_chainId and escrow reads,
blocked signing/broadcast methods, sanitized errors, and no credential in
browser assets. Then promote to the existing domain and repeat public checks.
Only afterward publish Dora description with the confirmed live URL. Retain
current Dora text before replacement, preserve other form fields, and verify
the saved public description. A final hackathon submission that accepts terms
or attestations must be completed by the user.

Vercel management is through the user-selected website, not Composio.
The website requested email-code verification before environment access, and
browser attachment subsequently failed. Existing variables remain unchanged;
no server secret has been uploaded by this session. Reconfirm browser access
and account verification before any environment write or deployment.

Pre-deployment validation of the restricted gateway passed: local RPC policy
and error-sanitization tests, lint, TypeScript, live read-only Mainnet token and
escrow checks, and production frontend build (2m 52s). The selector was tested
with Testnet values in the inherited environment; its subprocess produced the
verified Mainnet frontend without modifying persisted variables. Browser asset
scan confirmed the deployed escrow and excluded the real Alchemy key.
Hosted Production secret configuration and distributed rate controls remain
unverified until Vercel account/browser access is restored.

Vercel website configuration verified on 2026-10-31: the existing Alchemy key
was added as non-revealable Secret entries for Production and Preview, and
COINDECCFLOW_RELEASE_NETWORK was added as Config for Production and Preview.
The original three VITE_FLOW_* entries were not edited. Preview deployment
`dpl_4JLAKiMsqZmeRexbRgfV6ydQeTKT` built successfully at revision 186a18a,
but frontend agreement reads exposed a rejected multicall request path.
Production promotion was held. Restricted aggregate3 support now validates
every nested target against escrow/USDC, limits batch width, and counts nested
calls against the budget. The actual wagmi readContracts path passed live
read-only regression testing after the fix. A fresh hosted preview must pass
before promotion; no verification or rate-control completion is implied.

The fixed hosted preview at release revision ee95514 rendered agreement #1
as Completed, with total/funded/released 0.01 USDC and zero remaining balance.
A Vercel fixed-window rule named "CoindeccFlow RPC request limit" was added
and published: Request Path Equals /api/arc-mainnet; 100 requests per 60 seconds,
keyed by IP Address; excess requests return 429. No paid plan upgrade was made.
The Alchemy Free log API returned a documented 10-block range restriction, so
only eth_getLogs is routed to the fixed public Circle Arc endpoint. All other
permitted reads still use Alchemy with the server-only key. Mixed batches are
split across the two fixed providers and retain sanitized errors and limits.
Live gateway tests verified completion events across the demo block range.
