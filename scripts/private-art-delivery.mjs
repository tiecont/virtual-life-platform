import assert from 'node:assert/strict';
import {stage,verifyStage} from './media/private-art-manifest.mjs';
import {upload} from './media/private-art-s3.mjs';

async function main(){
 const [action,...args]=process.argv.slice(2),flags=new Map();
 const allowed={stage:['--source','--manifest','--output'],verify:['--stage'],upload:['--stage','--review','--review-sha256']};
 assert(Object.hasOwn(allowed,action),'Unknown action');
 for(let i=0;i<args.length;i+=2){assert(allowed[action].includes(args[i])&&!flags.has(args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'Invalid option');flags.set(args[i],args[i+1]);}
 assert(flags.size===allowed[action].length,'Missing option');const root=process.cwd();
 if(action==='stage')return stage({root,source:flags.get('--source'),manifestPath:flags.get('--manifest'),output:flags.get('--output')});
 if(action==='verify'){const result=await verifyStage(root,flags.get('--stage'));return {manifestSha256:result.digest,verifiedFiles:result.manifest.files.length,uploaded:false};}
 return upload({root,stagePath:flags.get('--stage'),reviewPath:flags.get('--review'),reviewSha256:flags.get('--review-sha256'),target:{provider:process.env.ART_S3_PROVIDER,endpoint:process.env.ART_S3_ENDPOINT,bucket:process.env.ART_S3_BUCKET,region:process.env.ART_S3_REGION},credentials:()=>({accessKeyId:process.env.ART_S3_ACCESS_KEY_ID,secretAccessKey:process.env.ART_S3_SECRET_ACCESS_KEY,sessionToken:process.env.ART_S3_SESSION_TOKEN})});
}
void main().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Private art delivery refused; check local manifest, review, destination and credentials. No public release authorized.');process.exitCode=1;});
