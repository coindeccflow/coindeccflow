# CoindeccFlow Mainnet status

Release verified on 31 October 2026.

## Live application

- [Production app](https://coindeccflow.vercel.app/)
- [Completed Mainnet agreement #1](https://coindeccflow.vercel.app/agreement/1)
- [Updated Dora project](https://dorahacks.io/build/48921)
- Network: Arc Mainnet, chain ID 5042.
- Escrow: `0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043`, deployed at block 28846016.

The release branch was merged into `main` at `5e8516738c2b9e7ccc37f3d6eeaae13dc95f4d84`. Vercel built the production deployment successfully, and the public domain passed read-only gateway and browser checks. The deployment receipt is in [mainnet-deployment-receipt.json](mainnet-deployment-receipt.json).

## Completed payment demonstration

Agreement #1 was created, funded with 0.01 USDC, and completed through two approved payouts of 0.005 USDC each. The user reviewed and signed the wallet transactions in MetaMask. Read-only checks confirmed completed status, two released milestones, both token transfers, zero remaining agreement balance, and zero residual allowance.

[Structured payment evidence](mainnet-demo-evidence.json) and [explorer links](hackathon-evidence.md) record the actual transactions.

## Validation

- Production frontend build, lint, and TypeScript checks passed.
- Gateway policy, provider-error sanitization, and multicall regressions passed.
- Public Vercel gateway checks passed for chain ID, token decimals, deployed escrow code, agreement/milestone reads through wagmi, and completion events.
- Signing/broadcast methods and unrelated browser origins were rejected.
- The real Alchemy credential was absent from 89 public browser assets inspected at release.
- The live agreement displayed all seven lifecycle history entries and both released milestones.

Alchemy provides contract/state reads through the server-only gateway. Bounded event-history requests use Arc’s fixed public endpoint through that gateway. Existing local Testnet defaults remain available. Reown QR/mobile connections require their optional project ID; the demonstrated Mainnet connection used MetaMask.

## Remaining items

- Independent professional security audit.
- Explorer source verification; the earlier verifier API attempt returned HTTP 403. Successful deployment and runtime reads do not establish source verification.
- Submission materials not yet independently confirmed: Arc Studio project URL, walkthrough video, public repository access, and the final hackathon entry status. See [hackathon evidence](hackathon-evidence.md).

The escrow is a working hackathon prototype. It has no refund, pause, rescue, or upgrade mechanism. See [production release](production-release.md) for hosting configuration and rollback details.
