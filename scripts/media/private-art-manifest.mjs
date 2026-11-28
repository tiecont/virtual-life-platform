import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {constants as zlibConstants,zstdDecompressSync} from 'node:zlib';

export const MAX_TOTAL=10_000_000_000,MAX_FILE=256*1024*1024,MAX_JSON=1024*1024;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=/^[a-f0-9]{64}$/,id=/^[a-z0-9][a-z0-9-]{0,63}$/;
const types={'.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.blend':'application/x-blender','.fbx':'application/vnd.autodesk.fbx','.mp4':'video/mp4','.wav':'audio/wav'};
export function exact(value,keys){assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'Unexpected document fields');}
export function relativePath(value){assert(typeof value==='string'&&value.length<=240&&/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value)&&!value.split('/').some(p=>!p||p==='.'||p==='..'),'Unsafe relative path');return value;}
export async function safePath(root,relative){
 relativePath(relative);let current=path.resolve(root);
 // Check the root's ancestors too; this is a trusted local operator workspace,
 // not a shared directory writable by an adversarial process.
 for(const part of current.split(path.sep).filter(Boolean).map((_,i,all)=>path.sep+all.slice(0,i+1).join(path.sep))){assert(!(await lstat(part)).isSymbolicLink(),'Symlink refused');}
 for(const part of relative.split('/')){current=path.join(current,part);try{assert(!(await lstat(current)).isSymbolicLink(),'Symlink refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
 return current;
}
export async function readBounded(root,relative,limit){
 const file=await open(await safePath(root,relative),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const info=await file.stat();assert(info.isFile()&&info.size>0&&info.size<=limit,'File size/type rejected');
  // Read at most limit+1 even if a local file grows after stat.
  const chunks=[];let total=0;while(true){const buffer=Buffer.alloc(Math.min(1024*1024,limit+1-total));const {bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;assert(total<=limit,'File size rejected');chunks.push(buffer.subarray(0,bytesRead));}return Buffer.concat(chunks,total);
 }finally{await file.close();}
}
export function validateManifest(value){
 exact(value,['schemaVersion','characterId','designRevision','publication','files']);
 assert(value.schemaVersion===1&&typeof value.characterId==='string'&&id.test(value.characterId)&&typeof value.designRevision==='string'&&id.test(value.designRevision)&&value.publication==='UNPUBLISHED','Invalid manifest identity/publication');
 assert(Array.isArray(value.files)&&value.files.length>0&&value.files.length<=1000,'Invalid file count');let total=0;const paths=new Set();
 for(const file of value.files){exact(file,['path','bytes','sha256','mime']);relativePath(file.path);assert(!paths.has(file.path.toLowerCase()),'Duplicate file');paths.add(file.path.toLowerCase());
  assert(Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=MAX_FILE,'File size rejected');total+=file.bytes;assert(total<=MAX_TOTAL,'10 GB batch limit exceeded');
  assert(typeof file.sha256==='string'&&hash.test(file.sha256)&&Object.hasOwn(types,path.extname(file.path))&&types[path.extname(file.path)]===file.mime,'Hash/MIME/extension rejected');
 }return value;
}
function blenderHeader(bytes){
 const header=bytes.subarray(0,17).toString('latin1');
 return /^BLENDER[_-][vV][0-9]{3}/.test(header)||/^BLENDER17-01[vV][0-9]{4}$/.test(header);
}
function verifyBlend(bytes){
 if(blenderHeader(bytes))return true;
 // Blender saves compressed projects as consecutive Zstandard frames followed
 // by a skippable seek table. Node decodes one frame per synchronous call.
 if(bytes.length<4||bytes.readUInt32LE(0)!==0xfd2fb528)return false;
 let offset=0,decoded=0,header=Buffer.alloc(0);
 while(offset<bytes.length){
  const {buffer,engine}=zstdDecompressSync(bytes.subarray(offset),{
   info:true,maxOutputLength:Math.max(1,MAX_FILE-decoded),
   params:{[zlibConstants.ZSTD_d_windowLogMax]:28},
  });
  decoded+=buffer.length;
  assert(decoded<=MAX_FILE&&engine.bytesWritten>0,'Compressed Blender file exceeded bounds');
  offset+=engine.bytesWritten;
  if(header.length<17)header=Buffer.concat([header,buffer.subarray(0,17-header.length)]);
  if(header.length===17&&!blenderHeader(header))return false;
 }
 return blenderHeader(header);
}
export function verifyBytes(file,bytes){
 assert(bytes.length===file.bytes&&sha256(bytes)===file.sha256,'Content hash/size mismatch');const ext=path.extname(file.path);let valid=false;
 if(ext==='.png')valid=bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND';
 if(ext==='.webp')valid=bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length&&bytes.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16));
 if(ext==='.blend')valid=verifyBlend(bytes);
 if(ext==='.fbx')valid=bytes.length>=27&&bytes.subarray(0,23).equals(Buffer.from('Kaydara FBX Binary  \0\x1a\0','binary'))&&bytes.readUInt32LE(23)>=7000&&bytes.readUInt32LE(23)<=8000;
 if(ext==='.mp4')valid=bytes.length>=24&&bytes.toString('ascii',4,8)==='ftyp'&&bytes.readUInt32BE(0)>=24&&bytes.readUInt32BE(0)<=bytes.length&&['isom','iso2','mp41','mp42','avc1'].includes(bytes.toString('ascii',8,12));
 if(ext==='.wav')valid=bytes.length>=44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length&&bytes.toString('ascii',8,12)==='WAVE'&&bytes.toString('ascii',12,16)==='fmt ';
 if(ext==='.glb'){
  valid=bytes.length>=24&&bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length;
  let offset=12,count=0;while(valid&&offset<bytes.length){if(offset+8>bytes.length){valid=false;break;}const size=bytes.readUInt32LE(offset),kind=bytes.readUInt32LE(offset+4);valid=size>0&&size%4===0&&offset+8+size<=bytes.length&&(count===0?kind===0x4e4f534a:count===1&&kind===0x004e4942);
   if(valid&&count===0){assert(size<=MAX_JSON,'GLB JSON too large');const json=JSON.parse(bytes.toString('utf8',offset+8,offset+8+size));valid=json.asset?.version==='2.0';assert(!JSON.stringify(json).match(/"uri"\s*:/),'External/embedded GLB URI refused');}
   offset+=8+size;count++;}valid=valid&&offset===bytes.length&&count>=1;
 }
 assert(valid,'Content signature/structure rejected');return bytes;
}
export function objectKey(manifest,digest,file){return `private-art/v1/${manifest.characterId}/${manifest.designRevision}/${digest}/${file.sha256}${path.extname(file.path)}`;}
export async function loadManifest(root,manifestPath){const bytes=await readBounded(root,manifestPath,MAX_JSON);return {manifest:validateManifest(JSON.parse(bytes)),digest:sha256(bytes),bytes};}
export async function stage({root,source,manifestPath,output}){
 assert(output.startsWith('artifacts/'),'Stage must be under ignored artifacts');const loaded=await loadManifest(root,manifestPath),destination=await safePath(root,output);
 // Exclusive directory creation prevents overwriting an earlier stage.
 await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await mkdir(destination,{mode:0o700});
 for(const file of loaded.manifest.files){const bytes=verifyBytes(file,await readBounded(root,`${relativePath(source)}/${file.path}`,MAX_FILE));const name=await safePath(destination,file.path);await mkdir(path.dirname(name),{recursive:true,mode:0o700});await writeFile(name,bytes,{flag:'wx',mode:0o600});}
 // A partial/failed stage has no manifest and cannot be uploaded.
 await writeFile(path.join(destination,'manifest.json'),loaded.bytes,{flag:'wx',mode:0o600});
 return {manifestSha256:loaded.digest,files:loaded.manifest.files.length,bytes:loaded.manifest.files.reduce((n,f)=>n+f.bytes,0),uploaded:false};
}
export async function verifyStage(root,stagePath){const loaded=await loadManifest(root,`${relativePath(stagePath)}/manifest.json`);for(const file of loaded.manifest.files)verifyBytes(file,await readBounded(root,`${stagePath}/${file.path}`,MAX_FILE));return loaded;}
export function validateReview(review,digest,target,now=Date.now()){
 exact(review,['schemaVersion','manifestSha256','artGate','technicalGate','rights','reviewedBy','reviewedAt','expiresAt','target']);
 assert(review.schemaVersion===1&&review.manifestSha256===digest&&review.artGate==='PASS'&&review.technicalGate==='PASS'&&review.rights==='PRIVATE_DELIVERY_APPROVED'&&typeof review.reviewedBy==='string'&&id.test(review.reviewedBy),'Reviewed art/technical/rights gate required');
 const reviewed=Date.parse(review.reviewedAt),expires=Date.parse(review.expiresAt);assert(Number.isFinite(reviewed)&&Number.isFinite(expires)&&reviewed<=now&&now<expires&&expires-reviewed<=7*86400_000,'Review expired/invalid');
 exact(review.target,['provider','endpoint','bucket','region','publicAccess']);assert(review.target.publicAccess==='DISABLED'&&['provider','endpoint','bucket','region'].every(k=>review.target[k]===target[k]),'Private destination review mismatch');
 return review;
}
