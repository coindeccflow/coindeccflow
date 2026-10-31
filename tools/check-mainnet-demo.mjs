// Read-only receipt and agreement verification.
import{readFileSync,writeFileSync}from'node:fs'
import{createPublicClient,http,formatUnits,decodeFunctionData,erc20Abi}from'viem'
import{arc}from'viem/chains'
const plan=JSON.parse(readFileSync('.e2e/mainnet-demo/plan.json','utf8'))
const abi=JSON.parse(readFileSync('.e2e/mainnet-deployment/artifact.json','utf8')).abi
const c=createPublicClient({chain:arc,transport:http('https://arc-mainnet.g.alchemy.com/v2/'+process.env.ALCHEMY_ARC_MAINNET_API_KEY,{retryCount:0})})
try{
 const count=await c.readContract({address:plan.escrow,abi,functionName:'agreementCount'})
 const balance=await c.getBalance({address:plan.payer})
 console.log('Agreement count:',count.toString(),'Payer USDC:',formatUnits(balance,18))
 const ids=await c.readContract({address:plan.escrow,abi,functionName:'getAgreementIdsByPayer',args:[plan.payer]})
 const agreements=[]
 for(const id of ids.slice(-5)){
  const agreement=await c.readContract({address:plan.escrow,abi,functionName:'getAgreement',args:[id]})
  const milestones=await c.readContract({address:plan.escrow,abi,functionName:'getMilestones',args:[id]})
  agreements.push({id,agreement,milestones})
 }
 const token='0x3600000000000000000000000000000000000000'
 const allowance=await c.readContract({address:token,abi:erc20Abi,functionName:'allowance',args:[plan.payer,plan.escrow]})
 const nonce=await c.getTransactionCount({address:plan.payer})
 let low=28846016n,high=await c.getBlockNumber()
 while(low+1n<high){const mid=(low+high)/2n;const n=await c.getTransactionCount({address:plan.payer,blockNumber:mid});if(n>=nonce)high=mid;else low=mid}
 const block=await c.getBlock({blockNumber:high,includeTransactions:true})
 const creation=block.transactions.find(t=>t.from.toLowerCase()===plan.payer.toLowerCase()&&t.nonce===nonce-1)
 let receipt
 if(creation){
  const isToken=creation.to?.toLowerCase()===token.toLowerCase()
  const decoded=decodeFunctionData({abi:isToken?erc20Abi:abi,data:creation.input})
  if(isToken&&(decoded.functionName!=='approve'||decoded.args[0].toLowerCase()!==plan.escrow.toLowerCase()))throw Error('Unexpected token action')
  if(!['approve','createAgreement','fundAgreement','approveMilestone','releaseMilestone'].includes(decoded.functionName))throw Error('Unexpected escrow action')
  const r=await c.getTransactionReceipt({hash:creation.hash})
  if(r.status!=='success'||r.from.toLowerCase()!==plan.payer.toLowerCase()||r.to?.toLowerCase()!==(isToken?token:plan.escrow).toLowerCase())throw Error('Unexpected receipt')
  receipt={action:decoded.functionName,hash:r.transactionHash,block:r.blockNumber,status:r.status,gasUsed:r.gasUsed,feeUSDC:formatUnits(r.gasUsed*r.effectiveGasPrice,18)}
 }
 const result={checkedAt:new Date().toISOString(),count,agreements,allowanceRaw:allowance,latestReceipt:receipt}
 const json=JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v,2)
 writeFileSync('.e2e/mainnet-demo/observed.json',json);console.log(json)
}catch{console.error('Read-only demo check unavailable; no transaction sent.');process.exitCode=1}
