import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {access,readFile} from 'node:fs/promises';

// The paths are administrator-managed, immutable executable installations.
// A recovering match can only select the exact executable pinned by the Host.
export async function selectNativeExecutable(
 binary:string,historical:string|undefined,pinnedHash:string|undefined,
){
 if(!binary.startsWith('/')||(historical!==undefined&&!historical.startsWith('/')))
  throw new Error('Native runtime executable paths must be absolute');
 if(pinnedHash!==undefined&&!/^[a-f0-9]{64}$/.test(pinnedHash))
  throw new Error('Invalid native runtime engine pin');
 const candidates=pinnedHash&&historical?[binary,historical]:[binary];
 for(const candidate of candidates){
  try{
   await access(candidate,constants.X_OK);
   const engineHash=createHash('sha256').update(await readFile(candidate)).digest('hex');
   if(pinnedHash===undefined||engineHash===pinnedHash)return {binary:candidate,engineHash};
  }catch{/* A recovering match may use the separately configured historical executable. */}
 }
 throw new Error('Pinned native runtime engine unavailable');
}
