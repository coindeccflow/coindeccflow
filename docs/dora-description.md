# CoindeccFlow — Programmable USDC milestone payments on Arc

[Live app](https://coindeccflow.vercel.app/) · [Completed Mainnet demo](https://coindeccflow.vercel.app/agreement/1)

CoindeccFlow helps clients, freelancers, and service providers connect payments to agreed milestones. The payer creates an agreement with a fixed recipient and USDC amounts, funds the escrow, and approves completed milestones. The payer or recipient can then release the approved payment onchain.

Built with Arc Studio, the app provides wallet connection, agreement and milestone dashboards, transaction lifecycle tracking, and explorer links. Its Solidity escrow has no owner or administrator; payments go only to the recipient chosen when the agreement is created.

## Working implementation

The full payment lifecycle has been demonstrated on both Arc Testnet and Arc Mainnet. On Mainnet, agreement #1 was created, funded with 0.01 USDC, and completed through two approved milestone payouts of 0.005 USDC each. Read-only verification confirmed both USDC Transfer events to the configured recipient, completed agreement status, zero remaining escrow balance, and zero residual token allowance.

The frontend uses React, TypeScript, Vite, wagmi, viem, and ConnectKit, with MetaMask used for the Mainnet walkthrough. Alchemy provides contract and state reads through a server-side gateway, keeping its API key out of browser assets. Bounded event-history queries use Arc’s public endpoint through the same restricted gateway. Testnet configuration remains supported. The production build, lint, TypeScript checks, and RPC gateway tests pass.

## Mainnet evidence

- Network: Arc Mainnet, chain ID 5042.
- [Escrow contract](https://explorer.arc.io/address/0x20fBfF6d3048A0583fB969cD74DB1501A9C9C043)
- [Contract deployment](https://explorer.arc.io/tx/0xd17e192617550ec249d1bbfe7782917b256e234589d2d4b8393218131869d6c7)
- [Agreement creation](https://explorer.arc.io/tx/0xf41036c626bc24b9870f3fcb8c2837178be4f100ed9c5f9b1d8ba56aa955a943)
- [USDC escrow funding](https://explorer.arc.io/tx/0x033468db2012ebefd30e73aa3e9f6d580f17eb6f551ced939748c32d61db4ee3)
- [First 0.005 USDC payout](https://explorer.arc.io/tx/0xacbbb9e11c3f9aab5e2fed6684e790b11c424f43756f39c73849c62f7ee35546)
- [Final 0.005 USDC payout and completion](https://explorer.arc.io/tx/0xa0fa938d033f44c819a01a77ca1d7bedb8ba023a741aa391f98ecda66e0245d3)
- [Source repository](https://github.com/coindeccflow/coindeccflow)

## Prototype status

This is a hackathon prototype. Independent security auditing and explorer source verification are outstanding. The current escrow has no refund, pause, upgrade, or rescue mechanism, so funded agreements can remain locked if milestones are not approved or a payout cannot complete. The demonstrated Mainnet flow is a controlled builder-run test, not evidence of readiness for unrestricted public deposits.

CoindeccFlow — Pay when the work is done.
