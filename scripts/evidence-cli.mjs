import assert from 'node:assert/strict';
import {createArchive,checkArchive,restoreArchive,readEvidenceBytes,readIndex} from './evidence-store.mjs';

const [action,...args]=process.argv.slice(2),flags=new Map();
for(let i=0;i<args.length;i++){
 const flag=args[i];assert(['--store','--key-file','--index','--target','--archive'].includes(flag)&&!flags.has(flag),'Unknown/duplicate evidence option');
 if(flag==='--archive')flags.set(flag,true);else{assert(args[i+1]&&!args[i+1].startsWith('--'),'Evidence option value required');flags.set(flag,args[++i]);}
}
const options={root:process.cwd(),store:flags.get('--store')??process.env.EVIDENCE_STORE_DIR??'artifacts/evidence-store/n01-02',key:flags.get('--key-file')??process.env.EVIDENCE_KEY_FILE??'artifacts/evidence-keys/n01-02.key'};
async function main(){
 if(action==='archive'){
  const index=await createArchive(options);console.log(JSON.stringify({result:'PASS',scope:'Private local additional archive; originals retained',files:index.entries.length,objects:index.archive.objectCount,sourceBytes:index.archive.totalSourceBytes,index:options.store+'/index.json',cleanupAuthorized:false,offHostConfigured:false}));return;
 }
 assert(['check','restore-smoke'].includes(action),'Unknown evidence action');const index=await readIndex(flags.get('--index')??'docs/evidence/index.json');
 if(action==='restore-smoke'){
  assert(flags.has('--target'),'New private --target under artifacts required');const report=await restoreArchive(index,{...options,target:flags.get('--target')});console.log(JSON.stringify({result:'PASS',scope:'Complete authenticated restore and file hash readback',...report,cleanupAuthorized:false}));return;
 }
 if(flags.has('--archive')){console.log(JSON.stringify({result:'PASS',scope:'Full encrypted archive verification',...await checkArchive(index,options)}));return;}
 let bytes=0;for(const entry of index.entries){const value=await readEvidenceBytes(entry.path,{...options,index});bytes+=value.length;}
 console.log(JSON.stringify({result:'PASS',scope:'Indexed original-or-archive byte verification; not fresh historical tests',verifiedFiles:index.entries.length,sourceBytes:bytes,cleanupAuthorized:false}));
}
void main().catch(error=>{console.error('Evidence operation failed: '+String(error.message));process.exitCode=1;});
