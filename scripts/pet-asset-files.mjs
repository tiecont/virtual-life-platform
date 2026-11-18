import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';

export async function verifyPetAssetBytes(files,root=process.cwd()){
 const base=await realpath(root),verified=new Map();
 for(const file of files){
  const target=await realpath(resolve(base,file.path)),rel=relative(base,target);
  if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw Error('Asset escapes workspace');
  // A FIFO must reach fstat without blocking for a writer. Reject a replaced
  // leaf symlink rather than following it after the containment check.
  const handle=await open(target,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
  try{
   const stat=await handle.stat();if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Asset file missing, non-regular or exceeds 64 MiB');
   const prior=verified.get(target);if(prior){if(prior!==file.sha256)throw Error('Conflicting asset hash');continue;}
   const digest=createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false}))digest.update(chunk);
   if(digest.digest('hex')!==file.sha256)throw Error('Asset hash mismatch');verified.set(target,file.sha256);
  }finally{await handle.close();}
 }
 return verified.size;
}
