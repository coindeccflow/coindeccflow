// Select the verified Mainnet build without changing saved Testnet variables.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const env={...process.env}
if(env.COINDECCFLOW_RELEASE_NETWORK==='mainnet') {
 const receipt=JSON.parse(readFileSync('docs/mainnet-deployment-receipt.json','utf8'))
 if(receipt.status!=='success'||receipt.chainId!==5042)throw Error('Unverified Mainnet configuration')
 Object.assign(env,{VITE_FLOW_CHAIN_ID:'5042',VITE_FLOW_ESCROW_ADDRESS:receipt.address,VITE_FLOW_DEPLOY_BLOCK:receipt.block,VITE_ARC_MAINNET_RPC_PATH:'/api/arc-mainnet'})
 console.log('Building verified Arc Mainnet frontend; saved Testnet environment values are preserved')
}
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{env,stdio:'inherit'})
if(result.error)throw result.error
process.exit(result.status??1)
