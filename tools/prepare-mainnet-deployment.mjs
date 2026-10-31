import { readFileSync, writeFileSync } from 'node:fs'
import { encodeDeployData } from 'viem'
const dir = '.e2e/mainnet-deployment'
const artifact = JSON.parse(readFileSync(`${dir}/artifact.json`, 'utf8'))
const report = JSON.parse(readFileSync(`${dir}/estimate.json`, 'utf8'))
const data = encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args: [report.usdc] })
const tx = { from: report.sender, chainId: '0x13b2', data, value: '0x0' }
writeFileSync(`${dir}/unsigned.json`, JSON.stringify(tx, null, 2))
const script = `
const tx = ${JSON.stringify(tx)};
const cap = 50000000000000000n;
const reserve = 41753915508602380n;
const out = document.getElementById('status');
const button = document.getElementById('deploy');
let pending = false;
button.onclick = async () => {
 if (pending) return;
 pending = true; button.disabled = true;
 let submitted = false;
 try {
  if (!window.ethereum) throw new Error('Open this page in the browser where MetaMask is installed.');
  const rpc = (method, params=[]) => window.ethereum.request({method, params});
  const accounts = await rpc('eth_requestAccounts');
  if (accounts[0]?.toLowerCase() !== tx.from.toLowerCase()) throw new Error('Select the deploying wallet shown above in MetaMask.');
  if (BigInt(await rpc('eth_chainId')) !== 5042n) throw new Error('Switch MetaMask to Arc Mainnet and try again.');
  const gas = BigInt(await rpc('eth_estimateGas', [{from:tx.from,data:tx.data,value:'0x0'}]));
  const limit = (gas * 110n + 99n) / 100n;
  const price = BigInt(await rpc('eth_gasPrice'));
  // Include modest fee headroom while keeping the strict total deployment cap.
  const maxFee = (price * 101n + 99n) / 100n;
  if (maxFee < 20000000000n || limit * maxFee > cap) throw new Error('Current fee estimate exceeds the 0.05 USDC deployment cap. Nothing sent.');
  const balance = BigInt(await rpc('eth_getBalance',[tx.from,'latest']));
  if (balance < reserve + limit * maxFee) throw new Error('Deployment would use the reserved demo balance. Nothing sent.');
  if ((await rpc('eth_accounts'))[0]?.toLowerCase() !== tx.from.toLowerCase() || BigInt(await rpc('eth_chainId')) !== 5042n) throw new Error('Wallet changed. Nothing sent.');
  out.textContent = 'Review the contract deployment in MetaMask. Maximum network fee: ' + (Number(limit * maxFee)/1e18).toFixed(8) + ' USDC. Confirm only if MetaMask shows Arc Mainnet and the correct wallet.';
  submitted = true; // Never enable automatic retries once a wallet request might be submitted.
  const hash = await rpc('eth_sendTransaction', [{...tx,gas:'0x'+limit.toString(16),maxFeePerGas:'0x'+maxFee.toString(16),maxPriorityFeePerGas:'0x0'}]);
  out.textContent = 'Submitted. Save this transaction hash and return it to the chat: ' + hash;
  const link = document.createElement('a'); link.href='https://explorer.arc.io/tx/'+hash;link.textContent='View deployment receipt';out.append(document.createElement('br'),link);
 } catch (e) {
  out.textContent = submitted ? 'Wallet request ended or its outcome is uncertain. Check MetaMask Activity before retrying; do not submit a duplicate.' : (e.message || 'Preflight failed. Nothing sent.');
 } finally { if (!submitted) {pending=false;button.disabled=false;} }
};`
writeFileSync(`${dir}/deploy.js`, script)
writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>CoindeccFlow Mainnet deployment review</title><style>body{max-width:780px;margin:50px auto;padding:24px;font:18px system-ui;line-height:1.6;background:#091321;color:#eef4ff}button{padding:16px;font:inherit}code{overflow-wrap:anywhere}a{color:#71c9ff}</style><h1>Deploy CoindeccFlow to Arc Mainnet</h1><p>This creates a new escrow contract. It does not fund an agreement.</p><p>Wallet: <code>${report.sender}</code><br>Network: Arc Mainnet (5042)<br>USDC constructor argument: <code>${report.usdc}</code><br>Deployment ceiling: <strong>0.05 USDC</strong><br>Reserved for demo: at least <strong>0.04175391550860238 USDC</strong></p><p>Estimate: ${report.estimatedFeeUSDC} USDC, checked ${report.checkedAt}. A fresh estimate runs before the wallet request.</p><p>Independent audit outstanding. This escrow has no refund, pause, rescue, or upgrade mechanism. Do not accept public deposits.</p><p>Review the network and maximum fee in MetaMask before approving. Reject the request if it differs from this page.</p><button id="deploy">Review deployment in MetaMask</button><p id="status" role="status">No transaction submitted. This button requests a paid deployment for your approval.</p><script src="/deploy.js"></script>`)
console.log('Local deployment review files prepared. No transaction signed or sent.')
