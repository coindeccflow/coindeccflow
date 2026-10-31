import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const code = readFileSync('.e2e/mainnet-deployment/deploy.js','utf8')
async function check({ price=25750000000n, balance=91753915508602380n, chain='0x13b2', account='0xf08DCbdc4543B542770ab7FaDB11D9E4d1C667d7' }={}) {
 const nodes={status:{append(){},textContent:''},deploy:{disabled:false}}
 const sends=[]
 const context={document:{getElementById:id=>nodes[id],createElement:()=>({})},window:{ethereum:{async request({method,params}){
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [account]
  if(method==='eth_chainId')return chain
  if(method==='eth_estimateGas')return '0x'+(1724263n).toString(16)
  if(method==='eth_gasPrice')return '0x'+price.toString(16)
  if(method==='eth_getBalance')return '0x'+balance.toString(16)
  if(method==='eth_sendTransaction'){sends.push(params[0]);return '0x'+'a'.repeat(64)}
  throw new Error('Unexpected method')
 }}}}
 runInNewContext(code,context)
 await nodes.deploy.onclick()
 return {nodes,sends}
}
const success=await check()
assert.equal(success.sends.length,1)
const tx=success.sends[0]
assert.ok(BigInt(tx.gas)*BigInt(tx.maxFeePerGas)<=50000000000000000n)
assert.equal(tx.chainId,'0x13b2');assert.equal(tx.value,'0x0');assert.equal(tx.to,undefined)
await success.nodes.deploy.onclick();assert.equal(success.sends.length,1)
for(const input of [{price:100000000000n},{balance:50000000000000000n},{chain:'0x1'},{account:'0x0000000000000000000000000000000000000001'}]) {
 assert.equal((await check(input)).sends.length,0)
}
console.log('PASS: wallet/network checks, total fee ceiling, demo reserve, and duplicate-submission guard (mocked only)')
