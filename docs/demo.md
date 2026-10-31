# Demo: 0.20 USDC, two milestones

Uses real USDC on the configured network (Arc Testnet by default). Use two wallets to show both roles, or one wallet as payer plus a second address you control as recipient.

1. Connect the payer wallet. Get test USDC from the Arc Studio sidebar if needed.
2. Create Agreement. Click "Use 0.20 USDC demo", paste the recipient address, review, and submit.
3. On the agreement page, approve exactly 0.20 USDC, then Fund Agreement. Wait for "Confirmed".
4. Approve Milestone 1.
5. Release Milestone 1. The recipient receives 0.10 USDC.
6. Check the Remaining stat: 0.10 USDC.
7. Approve Milestone 2, then Release Milestone 2.
8. The status becomes Completed and Remaining is 0.00.
9. Open Activity to see every event with its transaction hash and explorer link.

Transaction hashes are real and shown only after confirmation. Nothing is simulated.

Mainnet demonstration happens only after you have reviewed the contract and decided to proceed, and is run from your own wallet outside Arc Studio.
