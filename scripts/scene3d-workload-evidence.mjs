import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const workloadHash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Explicit source/build allowlist. Never walk SDKs, AVD userdata or credentials.
export async function workloadSourceFiles(){
 const files=['package.json','apps/mobile/package.json','scripts/scene3d-workload-policy.mjs','scripts/scene3d-workload-evidence.mjs','scripts/verify-scene3d-workload.mjs','scripts/mobile-emulator.mjs','scripts/mobile-emulator-workload.mjs'];
 for(const dir of ['packages/scene3d/src','apps/mobile/src','tests/renderer-workload'])for(const name of await readdir(dir))if(/\.(tsx?|json)$/.test(name))files.push(dir+'/'+name);
 return Promise.all(files.sort().map(async ref=>({ref,sha256:workloadHash(await readFile(ref))})));
}
export async function workloadBundleFiles(root='apps/mobile/dist'){
 const files=[];
 async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())await visit(path);else if(entry.isFile()){const bytes=await readFile(path);files.push({ref:path.slice(root.length+1),bytes:bytes.length,sha256:workloadHash(bytes)});}}}
 await visit(root);return files.sort((a,b)=>a.ref.localeCompare(b.ref));
}
