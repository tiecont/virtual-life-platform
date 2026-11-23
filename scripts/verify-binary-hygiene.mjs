import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const policyPath='config/binary-hygiene-allowlist.json';
const sha256=/^[a-f0-9]{64}$/;
const safePath=/^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export const MAX_NEW_BINARY_BYTES=500*1024;
export const BINARY_EXTENSIONS=new Set([
  '.7z','.avi','.bin','.blend','.dll','.exr','.fbx','.flac','.gif','.glb',
  '.gz','.ico','.jpeg','.jpg','.ktx2','.mov','.mp3','.mp4','.ogg','.png',
  '.psd','.so','.tar','.tga','.tgz','.vrm','.wav','.webm','.webp','.xz','.zip',
]);

const exact=(value,keys,label)=>{
  assert(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label+' has unexpected fields');
};

export function isBinaryPath(file){
  return BINARY_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function validateBinaryHygienePolicy(policy){
  exact(policy,['schemaVersion','maxTrackedBinaryBytes','legacy','androidMipmapIcons'],'Policy');
  assert.equal(policy.schemaVersion,1);
  assert.equal(policy.maxTrackedBinaryBytes,MAX_NEW_BINARY_BYTES);
  assert(Array.isArray(policy.legacy)&&policy.legacy.length>0&&policy.legacy.length<=100,'Legacy allowlist must be explicitly bounded');
  const paths=new Set();
  for(const entry of policy.legacy){
    exact(entry,['path','sha256'],'Legacy allowlist entry');
    assert(typeof entry.path==='string'&&entry.path.length<=300&&safePath.test(entry.path)&&!entry.path.split('/').some(part=>part==='.'||part==='..'),'Unsafe legacy path');
    assert(!paths.has(entry.path),'Duplicate legacy path');
    paths.add(entry.path);
    assert(isBinaryPath(entry.path),'Legacy allowlist entry must be binary');
    assert(typeof entry.sha256==='string'&&sha256.test(entry.sha256),'Legacy allowlist requires a lowercase SHA-256');
  }
  exact(policy.androidMipmapIcons,['maxBytes','pathPrefix','relativePattern'],'Android mipmap policy');
  const icons=policy.androidMipmapIcons;
  assert(Number.isSafeInteger(icons.maxBytes)&&icons.maxBytes>0&&icons.maxBytes<=MAX_NEW_BINARY_BYTES,'Android icon cap must remain small');
  assert.equal(icons.pathPrefix,'apps/mobile/android/app/src/main/res/');
  assert.equal(icons.relativePattern,'^mipmap-(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)/ic_launcher(?:_round|_foreground)?\\.png$');
  new RegExp(icons.relativePattern);
  return policy;
}

function allowedAndroidIcon(file,sizeBytes,policy){
  const icons=policy.androidMipmapIcons;
  return file.startsWith(icons.pathPrefix)&&
    new RegExp(icons.relativePattern).test(file.slice(icons.pathPrefix.length))&&
    sizeBytes<=icons.maxBytes;
}

export function evaluateOversizedAddedFiles(files,policy){
  validateBinaryHygienePolicy(policy);
  const pinned=new Map(policy.legacy.map(entry=>[entry.path,entry.sha256]));
  const rejected=[];
  for(const file of files){
    if(file.sizeBytes<=MAX_NEW_BINARY_BYTES||!isBinaryPath(file.path)||allowedAndroidIcon(file.path,file.sizeBytes,policy))continue;
    const pinnedSha=pinned.get(file.path);
    if(pinnedSha!==undefined&&pinnedSha===file.sha256)continue;
    const reason=pinned.has(file.path)?'content does not match the path-pinned legacy digest':'not present in the path-and-hash allowlist';
    rejected.push({...file,reason});
  }
  return rejected;
}

async function git(root,args,{input,encoding='utf8'}={}){
  const result=await run('git',args,{cwd:root,encoding,input,maxBuffer:64*1024*1024});
  return result.stdout;
}

async function gitTry(root,args){
  try{return (await git(root,args)).trim();}catch{return null;}
}

export async function resolveBinaryHygieneBase({root=process.cwd(),env=process.env,explicitBase}={}){
  const candidates=[];
  if(explicitBase)candidates.push(explicitBase);
  for(const name of ['BINARY_HYGIENE_BASE_SHA','GITHUB_BASE_SHA'])if(env[name])candidates.push(env[name]);
  if(env.GITHUB_EVENT_PATH){
    const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
    candidates.push(event.pull_request?.base?.sha,event.merge_group?.base_sha,event.before);
  }
  if(env.GITHUB_BASE_REF)candidates.push('origin/'+env.GITHUB_BASE_REF);
  candidates.push('origin/main','main','HEAD^');
  for(const candidate of candidates.filter(Boolean)){
    const resolved=await gitTry(root,['rev-parse','--verify',candidate+'^{commit}']);
    if(resolved)return resolved;
  }
  throw Error('Unable to establish a committed comparison base; set BINARY_HYGIENE_BASE_SHA');
}

async function readPolicy(root){
  return validateBinaryHygienePolicy(JSON.parse(await readFile(path.join(root,policyPath),'utf8')));
}

async function addedFiles(root,base,head){
  const output=await run('git',['diff','--name-only','--diff-filter=A','-z',`${base}...${head}`],{cwd:root,encoding:'buffer',maxBuffer:64*1024*1024});
  return output.stdout.toString('utf8').split('\0').filter(Boolean).sort();
}

async function blobSize(root,revision,file){
  const value=(await git(root,['cat-file','-s',`${revision}:${file}`])).trim();
  assert(/^\d+$/.test(value),'Unable to read committed object size');
  return Number(value);
}

async function blobSha256(root,revision,file){
  const result=await run('git',['cat-file','blob',`${revision}:${file}`],{cwd:root,encoding:'buffer',maxBuffer:64*1024*1024});
  return createHash('sha256').update(result.stdout).digest('hex');
}

export async function verifyBinaryHygiene({root=process.cwd(),env=process.env,base,head='HEAD'}={}){
  const policy=await readPolicy(root);
  const baseRevision=await resolveBinaryHygieneBase({root,env,explicitBase:base});
  const headRevision=(await git(root,['rev-parse','--verify',head+'^{commit}'])).trim();
  const mergeBase=(await git(root,['merge-base',baseRevision,headRevision])).trim();
  const candidates=[];
  for(const file of await addedFiles(root,mergeBase,headRevision)){
    if(!isBinaryPath(file))continue;
    const sizeBytes=await blobSize(root,headRevision,file);
    if(sizeBytes<=MAX_NEW_BINARY_BYTES)continue;
    const pinned=policy.legacy.some(entry=>entry.path===file);
    const digest=pinned?await blobSha256(root,headRevision,file):undefined;
    candidates.push({path:file,sizeBytes,sha256:digest});
  }
  const rejected=evaluateOversizedAddedFiles(candidates,policy);
  if(rejected.length)throw Error(`New tracked binary exceeds ${MAX_NEW_BINARY_BYTES} bytes: ${rejected.map(row=>`${row.path} (${row.reason})`).join(', ')}`);
  return {result:'PASS',baseRevision,mergeBase,headRevision,examined:candidates.length,thresholdBytes:MAX_NEW_BINARY_BYTES};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
  try{
    const result=await verifyBinaryHygiene({base:option('--base'),head:option('--head')??'HEAD'});
    console.log(JSON.stringify(result));
  }catch(error){
    console.error('Binary hygiene gate failed: '+error.message);
    process.exitCode=1;
  }
}
