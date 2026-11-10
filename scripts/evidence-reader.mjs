import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readIndex,readRegular,readEvidenceBytes} from './evidence-store.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const defaults={root:process.cwd(),indexFile:'config/evidence/index.json',gitFile:'config/evidence/git-snapshot.json',store:process.env.EVIDENCE_STORE_DIR??'artifacts/evidence-store/n01-02',key:process.env.EVIDENCE_KEY_FILE??'artifacts/evidence-keys/n01-02.key'};

// These are historical byte checks. A successful read never reruns an old test.
export async function createEvidenceReader(settings={}) {
 const options={...defaults,...settings},index=await readIndex(options.indexFile,options.root);
 const indexBytes=await readRegular(options.root,options.indexFile,16*1024*1024);
 assert(options.gitFile.startsWith('config/evidence/')||options.gitFile.startsWith('docs/evidence/')||options.gitFile.startsWith('artifacts/'),'Invalid Git evidence index location');
 let snapshot;try{snapshot=JSON.parse((await readRegular(options.root,options.gitFile,16*1024*1024)).toString('utf8'));}catch(error){if(error instanceof SyntaxError)throw Error('Invalid Git evidence index JSON');throw error;}
 assert(snapshot.schemaVersion===1&&/^[a-f0-9]{40}$/.test(snapshot.sourceRevision),'Unsupported Git evidence snapshot');
 assert(snapshot.indexSha256===digest(indexBytes),'Git snapshot index hash mismatch');
 assert(Array.isArray(snapshot.entries)&&snapshot.entries.length===index.entries.length,'Git snapshot coverage mismatch');
 const entries=new Map(index.entries.map(entry=>[entry.path,entry])),blobs=new Map();
 for(const row of snapshot.entries){
  const entry=entries.get(row.path);
  assert(entry&&!blobs.has(row.path)&&row.bytes===entry.bytes&&row.sha256===entry.sha256&&/^[a-f0-9]{40}$/.test(row.gitBlob),'Git snapshot entry mismatch');
  blobs.set(row.path,row.gitBlob);
 }
 let treeChecked=false;
 const git=(args,extra={})=>execFileSync('git',args,{cwd:options.root,maxBuffer:65*1024*1024,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_NO_LAZY_FETCH:'1'},...extra});
 function checkTree(){
  if(treeChecked)return;
  let tree;try{tree=git(['ls-tree','-rlz',snapshot.sourceRevision,'--','docs/agent/evidence']).toString();}catch{throw Error('Historical Git snapshot unavailable; use a full-history checkout or authenticated private archive');}
  const actual=new Map(tree.split('\0').filter(Boolean).map(line=>{const [header,name]=line.split('\t'),[mode,type,oid,size]=header.trim().split(/\s+/);assert(mode==='100644'&&type==='blob','Historical Git evidence must be regular blobs');return [name,{oid,size:Number(size)}];}));
  assert(actual.size===entries.size,'Historical Git tree coverage mismatch');
  for(const [name,entry] of entries){const row=actual.get(name);assert(row&&row.oid===blobs.get(name)&&row.size===entry.bytes,'Historical Git tree entry mismatch');}
  treeChecked=true;
 }
 function checked(entry,bytes){assert(bytes.length===entry.bytes&&digest(bytes)===entry.sha256,'Historical Git evidence hash mismatch');return bytes;}
 async function bytes(name,{gitOnly=false}={}){
  const entry=entries.get(name);assert(entry,'Evidence not indexed');
  if(!gitOnly){try{return await readEvidenceBytes(name,{...options,index});}catch(error){if(error.code!=='ENOENT')throw error;}}
  checkTree();let value;try{value=git(['cat-file','blob',blobs.get(name)],{maxBuffer:entry.bytes+1024});}catch{throw Error('Historical Git evidence object unavailable: '+name);}
  return checked(entry,value);
 }
 async function verifyAll({gitOnly=false}={}){
  if(gitOnly){
   checkTree();
   // One bounded batch also proves retrieval without originals, archive or key.
   const input=[...blobs.values()].join('\n')+'\n';let batch;
   try{batch=git(['cat-file','--batch'],{input,maxBuffer:index.archive.totalSourceBytes+1024*1024});}catch{throw Error('Historical Git evidence batch unavailable');}
   let offset=0;
   for(const [name,entry] of entries){const end=batch.indexOf(10,offset);assert(end>=offset,'Invalid Git batch header');assert.equal(batch.subarray(offset,end).toString(),`${blobs.get(name)} blob ${entry.bytes}`,'Invalid Git batch object');offset=end+1;checked(entry,batch.subarray(offset,offset+entry.bytes));offset+=entry.bytes;assert.equal(batch[offset++],10,'Invalid Git batch delimiter');}
   assert.equal(offset,batch.length,'Unexpected Git batch data');
  }else for(const name of entries.keys())await bytes(name);
  return {verifiedFiles:entries.size,sourceBytes:index.archive.totalSourceBytes,sourceRevision:snapshot.sourceRevision,scope:gitOnly?'Historical Git-only byte retrieval':'Indexed historical byte retrieval; not fresh test execution'};
 }
 return {bytes,json:async name=>JSON.parse((await bytes(name)).toString('utf8')),verifyAll,sourceRevision:snapshot.sourceRevision};
}
let shared;
export const historicalEvidence=()=>shared??=(createEvidenceReader());
export async function readHistoricalJson(name){return (await historicalEvidence()).json(name);}
