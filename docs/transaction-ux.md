# Wallet confirmation UX

Every wallet transaction (create, USDC allowance, fund, approve, release, cancel) runs through one tracker (`src/lib/txLifecycle.ts`, instance in `src/lib/txTracker.ts`) that lives outside React. Pages, the waiting card and the tray (`src/components/TxHost.tsx`, `WalletWaitCard.tsx`) only display it.

States: idle, preparing, awaiting_wallet, submitted, confirming, success, failed, user_rejected, wallet_unresponsive, status_unknown.

| Time without a wallet answer | What the user sees | What the app does |
| --- | --- | --- |
| 0-5 s | "Waiting for wallet confirmation" | nothing else |
| 5 s | adds Dismiss | Dismiss hides the card only |
| 15 s | "Your wallet is taking longer than expected." Check Wallet, Dismiss | wording only |
| 30 s | "Still waiting for your wallet." Dismiss, Check Wallet, "Stop waiting" | wording only; the request is never reported as cancelled or timed out |

- Dismiss never cancels, resets or resends. A hidden request stays in a tray with "Show details".
- Check Wallet opens a mobile wallet app when the connection exposes a link; on desktop it reports whether the wallet answers and tells the user to click the MetaMask toolbar icon. A website cannot open the extension.
- "Stop waiting" releases the one-request lock so the user can retry without a reload. It warns that the earlier request may still be open in the wallet. If that request is confirmed later, its hash is still tracked.
- Once a hash is returned the state is submitted/confirming and the wallet card disappears. The tray shows the hash, an Arc Explorer link and the status, and keeps tracking after navigation or reload (session storage). After 90 s unseen it shows status_unknown and keeps checking; it never resends.
- Duplicate prevention: one unresolved attempt per action key (for example `fund:3`) and one open wallet request at a time. Contract checks back this up: fund, approve milestone, release and cancel revert if repeated.
- On success every balance, allowance and agreement is re-read automatically.

Tests (mocked wallets and a fake clock, no network): `bun run test:lifecycle`, `bun run test:errors`.
