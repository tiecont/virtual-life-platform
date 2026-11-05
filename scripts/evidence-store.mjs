import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,writeFile} from 'node:fs/promises';
import path from 'node:path';

const MAGIC=Buffer.from('VLPEVID1'),MAX_FILE=64*1024*1024,MAX_TOTAL=256*1024*1024,OVERHEAD=36;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
function evidencePath(value){assert(typeof value==='string'&&/^docs\/agent\/evidence\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value)&&!value.split('/').some(p=>!p||p==='.'||p==='..'),'Invalid evidence path');return value;}
async function safePath(root,relative,missing=false){
 assert(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).some(p=>p==='..'||p==='.'||!p),'Path escape refused');
 root=path.resolve(root);let current=root;
 for(const part of relative.split('/')){current=path.join(current,part);try{assert(!(await lstat(current)).isSymbolicLink(),'Symlink refused');}catch(error){if(!missing||error.code!=='ENOENT')throw error;}}
 return current;
}
export async function readRegular(root,relative,limit){
 const name=await safePath(root,relative),file=await open(name,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const info=await file.stat();assert(info.isFile()&&info.size<=limit,'Evidence file bounds rejected');return await file.readFile();}finally{await file.close();}
}
async function freshOutput(root,relative){
 assert(typeof relative==='string'&&relative.startsWith('artifacts/'),'Output must be under artifacts');const name=await safePath(root,relative,true);
 try{await lstat(name);throw Error('Target already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 return name;
}
async function privateKey(options){
 const name=await safePath(options.root,options.key),info=await lstat(name);
 assert(info.isFile()&&info.size===32&&(info.mode&0o077)===0&&(typeof process.getuid!=='function'||info.uid===process.getuid()),'Expected owner-only private key');
 return readRegular(options.root,options.key,32);
}
export function validateIndex(index){
 assert(index?.schemaVersion===1&&index.archive?.format==='VLPEVID1-AES-256-GCM','Unsupported evidence index version/format');
 assert(typeof index.snapshotRevision==='string'&&/^[a-f0-9]{40,64}$/.test(index.snapshotRevision),'Source revision required');
 assert(typeof index.createdAt==='string'&&Number.isFinite(Date.parse(index.createdAt))&&new Date(index.createdAt).toISOString()===index.createdAt&&typeof index.archive.keyId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(index.archive.keyId),'Index timestamp/key reference required');
 assert(index.policy?.classification==='restricted-project-test-evidence'&&index.policy.cleanupAuthorized===false&&index.policy.originalsRetained===true,'Archive does not authorize cleanup');
 assert(typeof index.policy.retention==='string'&&index.policy.retention.length>0,'Evidence retention required');
 assert(Array.isArray(index.entries)&&index.entries.length>0&&index.entries.length<=10000,'Invalid evidence entry count');
 const paths=new Set(),objects=new Map();let total=0;
 for(const entry of index.entries){
  evidencePath(entry.path);assert(!paths.has(entry.path),'Duplicate evidence path');paths.add(entry.path);
  assert(/^[a-f0-9]{64}$/.test(entry.sha256)&&/^[a-f0-9]{64}$/.test(entry.cipherSha256),'Invalid evidence digest');
  assert(Number.isSafeInteger(entry.bytes)&&entry.bytes>=0&&entry.bytes<=MAX_FILE,'Invalid evidence size');total+=entry.bytes;assert(total<=MAX_TOTAL,'Evidence total bounds rejected');
  const previous=objects.get(entry.sha256);assert(!previous||previous.bytes===entry.bytes&&previous.cipherSha256===entry.cipherSha256,'Inconsistent shared evidence object');objects.set(entry.sha256,entry);
 }
 assert(index.archive.objectCount===objects.size&&index.archive.totalSourceBytes===total,'Evidence manifest coverage mismatch');
 return index;
}
function encrypt(bytes,key,digest){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('VLPEVID1:'+digest));
 const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),encrypted]);
}
async function decrypt(entry,key,options){
 const relative=options.store+'/objects/'+entry.sha256+'.vlpe',payload=await readRegular(options.root,relative,entry.bytes+OVERHEAD);
 assert(payload.length===entry.bytes+OVERHEAD&&sha(payload)===entry.cipherSha256,'Evidence ciphertext hash mismatch');assert(payload.subarray(0,8).equals(MAGIC),'Evidence object format mismatch');
 let bytes;
 try{const decipher=createDecipheriv('aes-256-gcm',key,payload.subarray(8,20));decipher.setAAD(Buffer.from('VLPEVID1:'+entry.sha256));decipher.setAuthTag(payload.subarray(20,36));bytes=Buffer.concat([decipher.update(payload.subarray(36)),decipher.final()]);}catch{throw Error('Evidence object authentication failed');}
 assert(bytes.length===entry.bytes&&sha(bytes)===entry.sha256,'Evidence plaintext hash mismatch');return bytes;
}
export async function createArchive(options){
 const root=path.resolve(options.root),store=await freshOutput(root,options.store),keyPath=await freshOutput(root,options.key);
 assert(keyPath!==store&&!keyPath.startsWith(store+path.sep),'Keep the private key outside the archive');
 const snapshotRevision=git(root,['rev-parse','HEAD']).toString().trim(),status=sha(git(root,['status','--porcelain=v1','-z']));
 const names=git(root,['ls-files','-z','--','docs/agent/evidence']).toString().split('\0').filter(Boolean).sort();assert(names.length>0&&names.length<=10000,'Evidence source count rejected');names.forEach(evidencePath);
 const key=randomBytes(32),entries=[],objects=new Map();let total=0;
 await mkdir(path.dirname(keyPath),{recursive:true,mode:0o700});await writeFile(keyPath,key,{flag:'wx',mode:0o600});await mkdir(store,{recursive:true,mode:0o700});await mkdir(path.join(store,'objects'),{mode:0o700});
 try{
  for(const name of names){
   const bytes=await readRegular(root,name,MAX_FILE);total+=bytes.length;assert(total<=MAX_TOTAL,'Evidence archive total bounds rejected');const digest=sha(bytes);let object=objects.get(digest);
   if(!object){const envelope=encrypt(bytes,key,digest);object={cipherSha256:sha(envelope)};await writeFile(path.join(store,'objects',digest+'.vlpe'),envelope,{flag:'wx',mode:0o600});objects.set(digest,object);}
   entries.push({path:name,bytes:bytes.length,sha256:digest,...object});
  }
  assert(git(root,['rev-parse','HEAD']).toString().trim()===snapshotRevision&&sha(git(root,['status','--porcelain=v1','-z']))===status,'Source changed during archive');
  const index={schemaVersion:1,snapshotRevision,createdAt:new Date().toISOString(),archive:{format:'VLPEVID1-AES-256-GCM',keyId:randomUUID(),objectCount:objects.size,totalSourceBytes:total},policy:{classification:'restricted-project-test-evidence',originalsRetained:true,cleanupAuthorized:false,externalUpload:'NOT_PERFORMED',durableOffHostArchive:'NOT_CONFIGURED',retention:'Local until owner cleanup; originals and Git history remain; never sole copy',sanitization:'Restricted fixture material; no claim of public-safe privacy review'},entries};
  validateIndex(index);await writeFile(path.join(store,'index.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx',mode:0o600});return index;
 }finally{key.fill(0);}
}
export async function checkArchive(index,options){
 validateIndex(index);const key=await privateKey(options),objects=new Map();
 try{for(const entry of index.entries)if(!objects.has(entry.sha256)){await decrypt(entry,key,options);objects.set(entry.sha256,true);}return {verifiedFiles:index.entries.length,verifiedObjects:objects.size,sourceBytes:index.archive.totalSourceBytes};}finally{key.fill(0);}
}
export async function restoreArchive(index,options){
 validateIndex(index);const target=await freshOutput(options.root,options.target),key=await privateKey(options),decoded=new Map();
 try{
  // Authenticate the complete bounded manifest before creating any restore target.
  for(const entry of index.entries)if(!decoded.has(entry.sha256))decoded.set(entry.sha256,await decrypt(entry,key,options));
  await mkdir(target,{recursive:true,mode:0o700});
  for(const entry of index.entries){const name=path.join(target,entry.path);await mkdir(path.dirname(name),{recursive:true,mode:0o700});await writeFile(name,decoded.get(entry.sha256),{flag:'wx',mode:0o600});const restored=await readRegular(options.root,options.target+'/'+entry.path,entry.bytes);assert(restored.length===entry.bytes&&sha(restored)===entry.sha256,'Restored evidence hash mismatch');}
  return {restoredFiles:index.entries.length,restoredObjects:decoded.size,sourceBytes:index.archive.totalSourceBytes,target:options.target};
 }finally{key.fill(0);for(const bytes of decoded.values())bytes.fill(0);}
}
export async function readEvidenceBytes(relative,options){
 evidencePath(relative);const index=validateIndex(options.index),entry=index.entries.find(row=>row.path===relative);assert(entry,'Evidence not indexed');
 try{const bytes=await readRegular(options.root,relative,entry.bytes);assert(bytes.length===entry.bytes&&sha(bytes)===entry.sha256,'Original evidence hash mismatch');return bytes;}catch(error){if(error.code!=='ENOENT')throw error;}
 const key=await privateKey(options);try{return await decrypt(entry,key,options);}finally{key.fill(0);}
}
export async function readIndex(relative,root=process.cwd()){
 assert(relative.startsWith('docs/evidence/')||relative.startsWith('artifacts/'),'Invalid evidence index location');
 const bytes=await readRegular(root,relative,16*1024*1024);let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid evidence index JSON');}return validateIndex(value);
}
