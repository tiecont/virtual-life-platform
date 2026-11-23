import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {loadManifests,readAsset,sha256} from './assets-manifest.mjs';
import {assetTargetFromEnvironment,sendAssetRequest,signedAssetRequest} from './assets-s3.mjs';

function parseOptions(args){
  const options={dryRun:false,manifestPaths:[]};
  for(let index=0;index<args.length;index++){
    const argument=args[index];
    if(argument==='--dry-run'||argument==='--offline')options.dryRun=true;
    else if(argument==='--manifest'){
      const value=args[++index];
      assert(value&&!value.startsWith('--'),'--manifest requires a repository-relative path');
      options.manifestPaths.push(value);
    }else if(argument.startsWith('--manifest=')){
      const value=argument.slice('--manifest='.length);
      assert(value,'--manifest requires a repository-relative path');
      options.manifestPaths.push(value);
    }else if(argument==='--help'){
      options.help=true;
    }else throw Error(`Unknown option: ${argument}`);
  }
  return options;
}

function cacheTarget(root,manifest){
  const target=path.resolve(root,manifest.localCachePath);
  const expected=path.resolve(root,manifest.localCachePath);
  assert(target===expected,'Asset cache path escaped its declared location');
  return target;
}

async function assertCacheAncestors(root,manifest){
  const relativeParts=path.posix.dirname(manifest.localCachePath).split('/');
  let current=path.resolve(root);
  for(const part of relativeParts){
    current=path.join(current,part);
    try{
      const info=await lstat(current);
      assert(!info.isSymbolicLink()&&info.isDirectory(),'Asset cache path has an unsafe ancestor');
    }catch(error){
      if(error.code==='ENOENT')return;
      throw error;
    }
  }
}

async function writeCacheAtomically(root,manifest,bytes){
  await assertCacheAncestors(root,manifest);
  const destination=cacheTarget(root,manifest),directory=path.dirname(destination);
  await mkdir(directory,{recursive:true,mode:0o700});
  await assertCacheAncestors(root,manifest);
  const temporary=path.join(directory,`.${path.basename(destination)}.${randomUUID()}.tmp`);
  let handle;
  try{
    handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle=undefined;
    await rename(temporary,destination);
  }finally{
    await handle?.close().catch(()=>{});
    await rm(temporary,{force:true}).catch(()=>{});
  }
}

async function preflight(root,manifests){
  const verified=[];
  let totalBytes=0;
  for(const entry of manifests){
    const bytes=await readAsset(root,entry.manifest);
    verified.push(entry.manifest.id);
    totalBytes+=bytes.length;
  }
  return {verified,totalBytes};
}

function isSuccessPut(status){
  return [200,201,204,412].includes(status);
}

function checkReadback(response,manifest){
  assert(response.status===200,'S3 readback was rejected');
  assert(response.bytes===manifest.sizeBytes,'S3 readback size mismatch');
  assert(response.headers['content-type']===manifest.contentType,'S3 readback content type mismatch');
  assert(sha256(response.body)===manifest.sha256,'S3 readback SHA-256 mismatch');
  return response.body;
}

async function cachedAsset(root,manifest){
  try{return await readAsset(root,manifest,{allowMissing:true});}
  catch(error){
    if(/size mismatch|SHA-256 mismatch/.test(error.message))return null;
    throw error;
  }
}

export async function pushAssets({root=process.cwd(),args=[],env=process.env,transport=sendAssetRequest,now=new Date}={}){
  const options=parseOptions(args);
  if(options.help)return {command:'push',usage:'assets-push [--dry-run|--offline] [--manifest <path>]'};
  const manifests=await loadManifests(root,options.manifestPaths);
  const prepared=await preflight(root,manifests);
  if(options.dryRun){
    return {command:'push',mode:'dry-run',network:false,manifests:manifests.length,verified:prepared.verified.length,bytes:prepared.totalBytes};
  }

  const target=assetTargetFromEnvironment(env);
  let uploaded=0,reused=0;
  for(const entry of manifests){
    const {manifest}=entry;
    // Recheck immediately before each request so a changed local file can never
    // be labelled with the manifest hash of an earlier file.
    const bytes=await readAsset(root,manifest);
    const put=signedAssetRequest({target,key:manifest.s3Key,method:'PUT',body:bytes,now,headers:{
      'cache-control':'private, no-store',
      'content-length':String(bytes.length),
      'content-type':manifest.contentType,
      'if-none-match':'*',
      'x-amz-meta-sha256':manifest.sha256,
    }});
    const response=await transport(put,64*1024);
    assert(isSuccessPut(response.status),'S3 conditional asset upload was rejected');
    const readbackResponse=await transport(signedAssetRequest({target,key:manifest.s3Key,method:'GET',now}),manifest.sizeBytes+1);
    const readback=checkReadback(readbackResponse,manifest);
    assert(readback.equals(bytes),'S3 readback content mismatch');
    if(response.status===412)reused++;
    else uploaded++;
  }
  return {command:'push',mode:'live',network:true,manifests:manifests.length,uploaded,reused,verified:manifests.length};
}

export async function pullAssets({root=process.cwd(),args=[],env=process.env,transport=sendAssetRequest,now=new Date}={}){
  const options=parseOptions(args);
  if(options.help)return {command:'pull',usage:'assets-pull [--dry-run|--offline] [--manifest <path>]'};
  const manifests=await loadManifests(root,options.manifestPaths);
  if(options.dryRun){
    let cached=0,pending=0;
    for(const entry of manifests){
      if(await cachedAsset(root,entry.manifest))cached++;
      else pending++;
    }
    return {command:'pull',mode:'dry-run',network:false,manifests:manifests.length,cached,pending};
  }

  const target=assetTargetFromEnvironment(env);
  let downloaded=0,reused=0;
  for(const entry of manifests){
    const {manifest}=entry;
    const existing=await cachedAsset(root,manifest);
    if(existing){reused++;continue;}
    const response=await transport(signedAssetRequest({target,key:manifest.s3Key,method:'GET',now}),manifest.sizeBytes+1);
    const bytes=checkReadback(response,manifest);
    await writeCacheAtomically(root,manifest,bytes);
    await readAsset(root,manifest);
    downloaded++;
  }
  return {command:'pull',mode:'live',network:true,manifests:manifests.length,downloaded,reused};
}

export function formatCliFailure(label,error){
  const message=error instanceof Error?error.message:String(error);
  return `${label} refused: ${message}`;
}
