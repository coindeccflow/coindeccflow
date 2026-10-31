// App-specific RPC policy, not a general-purpose Ethereum relay.
const targets = new Set([
  '0x20fbff6d3048a0583fb969cd74db1501a9c9c043',
  '0x3600000000000000000000000000000000000000',
])
const address = x => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x)
const hash = x => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x)
const quantity = x => typeof x === 'string' && /^0x[0-9a-fA-F]{1,16}$/.test(x)
const block = x => ['latest','pending','safe','finalized','earliest'].includes(x) || quantity(x)
const target = x => typeof x === 'string' && targets.has(x.toLowerCase())
export function permitted(call) {
 const p = call.params ?? []
 switch(call.method) {
  case 'eth_chainId': case 'eth_blockNumber': case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': case 'net_version': return p.length === 0
  case 'eth_call': case 'eth_estimateGas': {
   const tx=p[0]
   return p.length>=1 && p.length<=2 && tx && target(tx.to) &&
    Object.keys(tx).every(k=>['to','from','data','input','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','type','nonce'].includes(k)) &&
    (!tx.from || address(tx.from)) && (!tx.value || tx.value==='0x0') &&
    (!tx.data || /^0x[0-9a-fA-F]{0,32768}$/.test(tx.data)) &&
    (!tx.input || /^0x[0-9a-fA-F]{0,32768}$/.test(tx.input)) && (p[1]===undefined || block(p[1]))
  }
  case 'eth_getCode': return p.length<=2 && target(p[0]) && (p[1]===undefined||block(p[1]))
  case 'eth_getBalance': case 'eth_getTransactionCount': return p.length<=2 && address(p[0]) && (p[1]===undefined||block(p[1]))
  case 'eth_getTransactionByHash': case 'eth_getTransactionReceipt': return p.length===1 && hash(p[0])
  case 'eth_getBlockByNumber': return p.length===2 && block(p[0]) && p[1]===false
  case 'eth_getBlockByHash': return p.length===2 && hash(p[0]) && p[1]===false
  case 'eth_feeHistory': return p.length===3 && quantity(p[0]) && BigInt(p[0])<=100n && block(p[1]) && Array.isArray(p[2]) && p[2].length<=20 && p[2].every(x=>typeof x==='number'&&x>=0&&x<=100)
  case 'eth_getLogs': {
   const f=p[0]
   if(p.length!==1||!f||!Object.keys(f).every(k=>['address','fromBlock','toBlock','blockHash','topics'].includes(k)))return false
   const addresses=Array.isArray(f.address)?f.address:[f.address]
   if(!addresses.length||addresses.length>2||!addresses.every(target))return false
   if(f.topics && (!Array.isArray(f.topics)||f.topics.length>4||!f.topics.every(t=>t===null||hash(t)||(Array.isArray(t)&&t.length<=10&&t.every(hash)))))return false
   if(f.blockHash)return hash(f.blockHash)&&f.fromBlock===undefined&&f.toBlock===undefined
   return quantity(f.fromBlock)&&quantity(f.toBlock)&&BigInt(f.toBlock)>=BigInt(f.fromBlock)&&BigInt(f.toBlock)-BigInt(f.fromBlock)<=9999n
  }
  default: return false
 }
}
// Defense in depth only: per-instance budget, not a distributed hosting limit.
let windowStart=0, used=0
export function withinBudget(weight,now=Date.now()) {
 if(now-windowStart>=60000){windowStart=now;used=0}
 if(used+weight>240)return false
 used+=weight;return true
}
