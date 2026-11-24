import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_DIRECTORY='assets/manifests';
export const MANIFEST_SUFFIX='.manifest.json';
export const MAX_ASSET_BYTES=2_000_000_000;

const assetIdPattern=/^[a-z0-9][a-z0-9._-]{0,127}$/;
const versionPattern=/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const sha256Pattern=/^[a-f0-9]{64}$/;
const contentTypePattern=/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const stages=new Set(['reference','blockout','candidate','review','delivery']);
const manifestKeys=['id','version','stage','s3Key','sha256','sizeBytes','contentType','localCachePath'];
const contentTypes=new Map([
  ['.blend','application/x-blender'],
  ['.fbx','application/vnd.autodesk.fbx'],
  ['.glb','model/gltf-binary'],
  ['.jpeg','image/jpeg'],
  ['.jpg','image/jpeg'],
  ['.mp3','audio/mpeg'],
  ['.mp4','video/mp4'],
  ['.ogg','audio/ogg'],
  ['.png','image/png'],
  ['.tar','application/x-tar'],
  ['.vrm','model/gltf-binary'],
  ['.wav','audio/wav'],
  ['.webm','video/webm'],
  ['.webp','image/webp'],
  ['.zip','application/zip'],
]);

export function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value,keys,label){
  assert(value&&typeof value==='object'&&!Array.isArray(value),`${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),`${label} fields are invalid`);
}

function safeRelativePath(value,{prefix,field}){
  assert(typeof value==='string'&&value.length<=512,`${field} is required`);
  assert(value.startsWith(prefix)&&value.length>prefix.length,`${field} must be under ${prefix}`);
  assert(!value.includes('\\')&&!value.includes('\0')&&!value.includes('?')&&!value.includes('#'),`${field} contains unsupported characters`);
  const parts=value.split('/');
  assert(parts.every(part=>part&&part!=='.'&&part!=='..'),`${field} contains unsafe path segments`);
  assert(/^[A-Za-z0-9._/-]+$/.test(value),`${field} contains unsupported characters`);
  return value;
}

export function validateManifest(value,{fileName}={}){
  exactKeys(value,manifestKeys,'Asset manifest');
  assert(typeof value.id==='string'&&assetIdPattern.test(value.id),'Asset id is invalid');
  assert(typeof value.version==='string'&&versionPattern.test(value.version),'Asset version must be semantic versioning');
  assert(typeof value.stage==='string'&&stages.has(value.stage),'Asset stage is invalid');
  assert(typeof value.sha256==='string'&&sha256Pattern.test(value.sha256),'Asset SHA-256 is invalid');
  assert(Number.isSafeInteger(value.sizeBytes)&&value.sizeBytes>0&&value.sizeBytes<=MAX_ASSET_BYTES,'Asset size is invalid');
  assert(typeof value.contentType==='string'&&contentTypePattern.test(value.contentType),'Asset content type is invalid');

  safeRelativePath(value.s3Key,{prefix:`assets/${value.id}/${value.version}/`,field:'s3Key'});
  const keyName=value.s3Key.split('/').at(-1);
  assert(keyName&&keyName!==value.id,'S3 key filename is invalid');
  assert(contentTypes.has(path.extname(keyName).toLowerCase()),'Asset extension is unsupported');
  assert(contentTypes.get(path.extname(keyName).toLowerCase())===value.contentType,'Asset content type does not match its extension');

  safeRelativePath(value.localCachePath,{prefix:`.cache/assets/${value.id}/${value.version}/`,field:'localCachePath'});
  assert(path.posix.basename(value.localCachePath)===keyName,'localCachePath must preserve the S3 object filename');

  if(fileName!==undefined){
    assert(fileName===`${value.id}${MANIFEST_SUFFIX}`,'Manifest filename must match its asset id');
  }
  return value;
}

async function assertNoSymlink(root,relative,{includeMissing=true}={}){
  const resolvedRoot=path.resolve(root);
  for(const part of resolvedRoot.split(path.sep).filter(Boolean)){
    const current=path.sep+part;
    // Every existing ancestor of the repository root must be a real directory.
    const parent=path.dirname(current);
    if(parent===current)continue;
    try{assert(!(await lstat(current)).isSymbolicLink(),'Symlink asset path refused');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  let current=resolvedRoot;
  for(const part of relative.split('/')){
    current=path.join(current,part);
    try{assert(!(await lstat(current)).isSymbolicLink(),'Symlink asset path refused');}
    catch(error){
      if(error.code==='ENOENT'){
        if(includeMissing)return current;
        throw error;
      }
      throw error;
    }
  }
  return current;
}

export async function manifestFiles(root,requested=[]){
  if(requested.length){
    return [...new Set(requested.map(value=>{
      assert(!path.isAbsolute(value),'Manifest paths must be repository-relative');
      safeRelativePath(value,{prefix:`${MANIFEST_DIRECTORY}/`,field:'manifest path'});
      assert(value.endsWith(MANIFEST_SUFFIX),'Manifest path has an invalid suffix');
      return value;
    }))].sort();
  }
  const names=await readdir(path.join(root,MANIFEST_DIRECTORY)).catch(error=>{
    if(error.code==='ENOENT')return [];
    throw error;
  });
  return names.filter(name=>name.endsWith(MANIFEST_SUFFIX)).sort().map(name=>`${MANIFEST_DIRECTORY}/${name}`);
}

export async function loadManifests(root,requested=[]){
  const paths=await manifestFiles(root,requested),manifests=[];
  const ids=new Set(),keys=new Set(),caches=new Set();
  for(const relativePath of paths){
    const file=await assertNoSymlink(root,relativePath,{includeMissing:false});
    const bytes=await readFile(file);
    assert(bytes.length<=1024*1024,'Asset manifest is too large');
    let value;
    try{value=JSON.parse(bytes);}catch{throw Error(`Asset manifest is not valid JSON: ${relativePath}`);}
    const fileName=path.posix.basename(relativePath);
    validateManifest(value,{fileName});
    assert(!ids.has(value.id),`Duplicate asset id: ${value.id}`);
    assert(!keys.has(value.s3Key),`Duplicate S3 key: ${value.s3Key}`);
    assert(!caches.has(value.localCachePath),`Duplicate local cache path: ${value.localCachePath}`);
    ids.add(value.id);keys.add(value.s3Key);caches.add(value.localCachePath);
    manifests.push({manifest:value,manifestPath:relativePath});
  }
  return manifests;
}

export async function readAsset(root,manifest,{allowMissing=false}={}){
  const file=await assertNoSymlink(root,manifest.localCachePath,{includeMissing:allowMissing});
  let handle;
  try{handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
  catch(error){
    if(allowMissing&&error.code==='ENOENT')return null;
    throw error;
  }
  try{
    const info=await handle.stat();
    assert(info.isFile()&&info.size===manifest.sizeBytes,'Asset size mismatch');
    const bytes=Buffer.alloc(manifest.sizeBytes);
    let offset=0;
    while(offset<bytes.length){
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,null);
      assert(bytesRead>0,'Asset size mismatch');
      offset+=bytesRead;
    }
    assert((await handle.read(Buffer.alloc(1),0,1,null)).bytesRead===0,'Asset size mismatch');
    assert(sha256(bytes)===manifest.sha256,'Asset SHA-256 mismatch');
    return bytes;
  }finally{await handle.close();}
}
