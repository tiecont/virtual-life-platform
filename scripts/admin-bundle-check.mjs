import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function inspectAdminBundle(directory,markers){
 assert(Array.isArray(markers)&&markers.length>=2&&markers.length<=8&&new Set(markers).size===markers.length&&markers.every(value=>typeof value==='string'&&/^[\x20-\x7e]{16,256}$/.test(value)),'Explicit synthetic marker set required');
 const files=[];let bytes=0;
 async function walk(folder){const stat=await lstat(folder);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Bundle directory must be real');for(const name of await readdir(folder)){const file=join(folder,name),info=await lstat(file);assert(!info.isSymbolicLink(),'Bundle symlink rejected');if(info.isDirectory())await walk(file);else{assert(info.isFile()&&info.size<=16*1024**2,'Bundle file bound');bytes+=info.size;assert(bytes<=64*1024**2,'Bundle total bound');const data=await readFile(file);for(const marker of [...markers,'/internal/telemetry'])assert(!data.includes(Buffer.from(marker)),'Private configuration or service route reached browser assets');files.push({file,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length});}}}
 await walk(directory);assert(files.some(file=>file.file.endsWith('.js')),'No production browser JavaScript');return {result:'PASS',files,bytes,syntheticMarkersChecked:markers.length,privateServiceRouteAbsent:true,scope:'Actual local production static assets only; no deployment, live credential or server-image claim'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert.equal(process.argv.length,2);const markers=JSON.parse(process.env.VLP_ADMIN_SCAN_MARKERS??'null'),result=await inspectAdminBundle(resolve('apps/admin-web/.next/static'),markers),directory='artifacts/admin-bundle/'+randomUUID();await mkdir(directory,{recursive:true,mode:0o700});await writeFile(directory+'/report.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({result:result.result,files:result.files.length,bytes:result.bytes,syntheticMarkersChecked:result.syntheticMarkersChecked,report:directory+'/report.json'}));}
 catch{console.error('Admin browser bundle inspection rejected: require a real bounded production build and explicit synthetic markers; no configuration values emitted');process.exitCode=1;}
}
