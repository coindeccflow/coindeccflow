# Balance synchronization audit (Arc Testnet, chain 5042002)

Wallet `0xf08dcbdc4543b542770ab7fadb11d9e4d1c667d7`, escrow `0x24a142b37feaddae8985d54d00331c9c12d95c11`, USDC `0x3600000000000000000000000000000000000000` (6 decimals as ERC-20, 18 as native gas).
Reproduce with `bun run audit:balances <wallet> <block,block,...>` (read-only).

## Result

No accounting discrepancy. Every figure reconciles to the unit.

| Block | Event | Wallet USDC | Escrow USDC | Recipient USDC |
| --- | --- | --- | --- | --- |
| 69863992 | before any action | 261.279401 | n/a | n/a |
| 69865005 | after create #3 + exact approval (the 261.264897 the app showed) | 261.264897 | 0 | 115.117751 |
| 69865489 | after fundAgreement (0.20 locked) | 261.062586 | 0.200000 | 115.117751 |
| 69865872 | after approveMilestone (MetaMask's ~261.061) | 261.061150 | 0.200000 | 115.117751 |
| 69866533 | after releaseMilestone (0.10 paid out) | 261.058572 | 0.100000 | 115.217751 |

261.264897 to 261.061150 = 0.203747 = 0.200000 escrowed + 0.002311 (fund gas) + 0.001436 (approveMilestone gas).
Total wallet change since the start, 0.220829 = 0.200000 escrowed + 0.020829 gas across five transactions.
Gas on Arc is paid in USDC, so it also reduces the displayed balance.

## Checks

- App balance source: `balanceOf(wallet)` on the USDC token above, chain 5042002 (Dashboard, 8 s poll; Fund panel, 6 s poll; recipient balance, 6 s poll). No hardcoded or simulated values.
- ERC-20 view equals native balance / 10^12 (truncated) at every block checked, so MetaMask (native, 18 decimals) and the app (ERC-20, 6 decimals) show the same money.
- Escrow USDC (0.10) equals the sum of per-agreement balances (#3 only). Funds held in escrow are tracked per agreement and are not part of the wallet balance.
- Cancellation moves no tokens (allowed only before funding). The contract has no refund path.

## Weakness found and fixed

Balances were refreshed only by timers. After a confirmed transaction nothing re-read them immediately, and Arc's public RPC is load-balanced across backends at slightly different heights, so a read right after a receipt could return the pre-transaction value for several seconds. Fix: `src/lib/refresh.ts` invalidates all onchain reads and the activity feed on every confirmed transaction (immediately, then at 1.2 s, 3.5 s and 8 s), wired in `src/hooks/useFlowTx.ts`.
