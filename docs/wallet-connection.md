# Wallet connection

CoindeccFlow connects wallets through ConnectKit on top of wagmi and viem (RainbowKit is not installed in this project; ConnectKit provides the same WalletConnect v2, QR and mobile deep-link features).

## Connectors

| Connector | When it works |
| --- | --- |
| MetaMask and other injected wallets | Desktop extensions, and mobile when the page is opened inside a wallet's built-in browser. Wallets that announce themselves (EIP-6963) are listed individually. |
| Coinbase Wallet | Desktop extension, mobile app, and Coinbase Wallet's built-in browser. |
| WalletConnect v2 | Only when `VITE_WALLETCONNECT_PROJECT_ID` is set. Shows a QR code on desktop and "open wallet app" deep links on mobile (MetaMask, Rainbow, Trust and others). |

A WalletConnect project id is public configuration, but it is yours to create. None is bundled with the app.

## WalletConnect setup (required for QR codes and iPhone deep links)

1. Create a free project at <https://cloud.reown.com> (formerly WalletConnect Cloud) and copy its Project ID.
2. Add it to `.env`: `VITE_WALLETCONNECT_PROJECT_ID=<your project id>`.
3. In the Reown dashboard, add every domain that serves the app to the project's allowed domains (your deployed HTTPS URL, and `localhost` for local work). Requests from domains that are not allowed are refused, which looks like a QR code that never loads.
4. Restart the dev server. Vite reads `.env` only at startup. On a deployed app, set the same variable in your host's environment settings and redeploy.

Without a project id the app still works with injected wallets and Coinbase Wallet, and shows a notice explaining what is missing.

## Why the iPhone preview showed only "Browser"

- Safari on iPhone has no wallet extensions, so there is no injected wallet to list. The old configuration offered only a generic injected connector, so the modal showed a single "Browser" entry. Selecting it had nothing to connect to and fell back to a QR view that could not be completed.
- The old configuration also had no WalletConnect connector, which is the only way to reach a wallet app from Safari.
- Inside Arc Studio, the app runs in an embedded frame. Browsers and wallet apps commonly block wallet injection, popups and app deep links from embedded frames. That is a browser rule, not something the app can switch off. The app detects when it is embedded and says so.

## Testing on an iPhone

Use a standalone public HTTPS URL, not the Arc Studio preview:

1. Deploy the app (Netlify, Vercel or Hugging Face from Arc Studio's Integrations menu) with `VITE_WALLETCONNECT_PROJECT_ID` set in the host's environment variables.
2. Add the deployed domain to the Reown project's allowed domains.
3. Open the URL in Safari on the iPhone, tap Connect wallet, and choose your wallet app. The wallet opens, you approve the connection, and you return to Safari.
4. Alternatively, open the same URL inside MetaMask's or Coinbase Wallet's built-in browser; the injected wallet is used directly and no QR is involved.
5. Add Arc Testnet if the wallet does not have it: choose "Switch to Arc Testnet" in the app, or add it manually (chain ID 5042002, RPC `https://rpc.testnet.arc.io`, currency USDC, explorer `https://explorer.testnet.arc.io`).
6. Get test USDC, then run the demo in `docs/demo.md`.

Connecting only reads your address. The app never sends a transaction or a signature request on connect; every transaction starts from a button you press.

## Network handling

The public Vercel release runs on Arc Mainnet (5042). Local source defaults remain Arc Testnet (5042002). The release selector sets the Mainnet chain inside the build process; manual configuration can also select it with `VITE_FLOW_CHAIN_ID=5042`. If the connected wallet is on another chain, the app asks it to switch to the app’s configured network. Chain parameters match the generated Arc registry.

The iPhone steps above describe the Testnet rehearsal. Do not use test tokens or the Testnet contract address for the live Mainnet app. Reown QR/mobile links require their project ID and allowed domains; the completed Mainnet demonstration used MetaMask.
