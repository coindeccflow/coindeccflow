// Read-only discovery and verification; never submits transactions.
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, getContractAddress } from 'viem'
import { arc } from 'viem/chains'
const dir='.e2e/mainnet-deployment'
const estimate=JSON.parse(readFileSync(`${dir}/estimate.json`,'utf8'))
const unsigned=JSON.parse(readFileSync(`${dir}/unsigned.json`,'utf8'))
const artifact=JSON.parse(readFileSync(`${dir}/artifact.json`,'utf8'))
const c=createPublicClient({chain:arc,transport:http('https://arc-mainnet.g.alchemy.com/v2/'+process.env.ALCHEMY_ARC_MAINNET_API_KEY,{retryCount:0})})
try {
 if(await c.getChainId()!==5042)throw new Error('Wrong chain')
 const nonce=await c.getTransactionCount({address:estimate.sender})
 if(!nonce){console.log('No confirmed outgoing transactions from deploying wallet.');process.exit(0)}
 const address=getContractAddress({from:estimate.sender,nonce:BigInt(nonce-1)})
 const code=await c.getCode({address})
 if(!code||code==='0x'){console.log('Most recent wallet transaction did not create a contract at the expected address. Transaction hash needed.');process.exit(0)}
 let low=BigInt(estimate.block),high=await c.getBlockNumber()
 if(await c.getTransactionCount({address:estimate.sender,blockNumber:low})>=nonce)throw new Error('Latest transaction predates deployment preparation; hash needed')
 while(low+1n<high){const mid=(low+high)/2n;const n=await c.getTransactionCount({address:estimate.sender,blockNumber:mid});if(n>=nonce)high=mid;else low=mid}
 const block=await c.getBlock({blockNumber:high,includeTransactions:true})
 const tx=block.transactions.find(t=>t.from.toLowerCase()===estimate.sender.toLowerCase()&&t.nonce===nonce-1)
 if(!tx||tx.to||tx.input.toLowerCase()!==unsigned.data.toLowerCase())throw new Error('Transaction is not the prepared deployment; hash needed')
 const receipt=await c.getTransactionReceipt({hash:tx.hash})
 if(receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==address.toLowerCase())throw new Error('Deployment receipt did not confirm success')
 const read=functionName=>c.readContract({address,abi:artifact.abi,functionName})
 const [usdc,decimals,count]=await Promise.all([read('usdc'),read('usdcDecimals'),read('agreementCount')])
 if(usdc.toLowerCase()!==estimate.usdc.toLowerCase()||Number(decimals)!==6)throw new Error('Deployed token configuration mismatch')
 const report={verifiedAt:new Date().toISOString(),chainId:5042,transactionHash:tx.hash,address,block:receipt.blockNumber.toString(),status:receipt.status,creationDataMatchesPreparedArtifact:true,usdc,usdcDecimals:Number(decimals),agreementCount:count.toString(),gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString()}
 writeFileSync(`${dir}/verified-receipt.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}catch{console.error('Could not verify deployment automatically. Please provide the transaction hash from MetaMask Activity; provider details withheld.');process.exitCode=1}
