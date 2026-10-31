// Read-only payout verification against the deployed token's Transfer event.
import{readFileSync,writeFileSync}from'node:fs'
import{createPublicClient,http,erc20Abi,decodeEventLog,formatUnits}from'viem'
import{arc}from'viem/chains'
const plan=JSON.parse(readFileSync('.e2e/mainnet-demo/plan.json','utf8'))
const observation=JSON.parse(readFileSync('.e2e/mainnet-demo/observed.json','utf8'))
const abi=JSON.parse(readFileSync('.e2e/mainnet-deployment/artifact.json','utf8')).abi
const token='0x3600000000000000000000000000000000000000'
const c=createPublicClient({chain:arc,transport:http('https://arc-mainnet.g.alchemy.com/v2/'+process.env.ALCHEMY_ARC_MAINNET_API_KEY,{retryCount:0})})
try{
 if(observation.latestReceipt.action!=='releaseMilestone')throw Error('Latest receipt is not a payout')
 const receipt=await c.getTransactionReceipt({hash:observation.latestReceipt.hash})
 if(receipt.status!=='success'||receipt.to?.toLowerCase()!==plan.escrow.toLowerCase())throw Error('Unexpected receipt')
 const transfers=receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase()).flatMap(l=>{try{const e=decodeEventLog({abi:erc20Abi,data:l.data,topics:l.topics});return e.eventName==='Transfer'?[e.args]:[]}catch{return []}})
 const match=transfers.find(t=>t.from.toLowerCase()===plan.escrow.toLowerCase()&&t.to.toLowerCase()===plan.recipient.toLowerCase()&&t.value===5000n)
 if(!match)throw Error('Expected token payout not found')
 const remaining=await c.readContract({address:plan.escrow,abi,functionName:'getAgreementBalance',args:[1n]})
 const report={verifiedAt:new Date().toISOString(),transactionHash:receipt.transactionHash,token,from:match.from,recipient:match.to,paidRaw:match.value.toString(),paidUSDC:formatUnits(match.value,6),remainingEscrowRaw:remaining.toString(),remainingEscrowUSDC:formatUnits(remaining,6),receiptStatus:receipt.status}
 writeFileSync('.e2e/mainnet-demo/latest-payout.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}catch{console.error('Payout verification failed; no transaction sent.');process.exitCode=1}
