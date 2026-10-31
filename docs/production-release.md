# Mainnet production release candidate

Requested destination: existing `coindeccflow.vercel.app` Vercel application,
linked to `coindeccflow/coindeccflow`; verify the actual project, owner, domain,
and current production deployment before changes. Preserve the previous
production deployment ID and public Testnet values for rollback.

Mainnet production environment values:

- VITE_FLOW_CHAIN_ID=5042
- VITE_FLOW_ESCROW_ADDRESS=0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043
- VITE_FLOW_DEPLOY_BLOCK=28846016
- VITE_ARC_MAINNET_RPC_PATH=/api/arc-mainnet
- ALCHEMY_ARC_MAINNET_API_KEY: set privately as a server-only secret.
- Preserve existing Reown/WalletConnect project ID; inspect allowed domains.

Never upload `.env.local`, `.e2e`, toolchains, compiler artifacts, or test wallet
material. Deploy the reviewed Git revision; local secrets do not belong in Git.
`vercel.json` routes the known SPA pages to index.html while leaving `/api` and
static asset routes untouched. The API function must be deployed with the app,
not only the static dist directory. Configure hosting rate controls and Alchemy
quotas before public exposure; the current gateway's Origin checks are not
authentication or a global rate limit.

Validate a preview before promoting: home, direct agreement and settings links,
Mainnet chain/address, actual server-side RPC eth_chainId and escrow reads,
blocked signing/broadcast methods, sanitized errors, and no credential in
browser assets. Then promote to the existing domain and repeat public checks.
Only afterward publish Dora description with the confirmed live URL. Retain
current Dora text before replacement, preserve other form fields, and verify
the saved public description. A final hackathon submission that accepts terms
or attestations must be completed by the user.

Connector access is currently blocked by automatic approval review pending
explicit consent to the Vercel integration's potentially broad project/account
permissions. No Vercel project or production setting has been changed.
