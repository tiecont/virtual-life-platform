import assert from 'node:assert/strict';
import { constants,existsSync,mkdirSync,mkdtempSync,lstatSync,openSync,closeSync,readFileSync,writeFileSync,chmodSync,rmSync,renameSync } from 'node:fs';
import { resolve,relative,dirname,basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const names=['deadline','maid'],limit=16*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitEnv=()=>({...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_'))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_AUTHOR_NAME:'Local snapshot recorder',GIT_AUTHOR_EMAIL:'snapshot@localhost',GIT_COMMITTER_NAME:'Local snapshot recorder',GIT_COMMITTER_EMAIL:'snapshot@localhost',GIT_AUTHOR_DATE:'2026-11-05T00:00:00Z',GIT_COMMITTER_DATE:'2026-11-05T00:00:00Z'});
const git=(root,args,encoding='utf8')=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false','-c','core.autocrlf=false','-c','core.fsync=committed','-C',root,...args],{encoding,env:gitEnv(),maxBuffer:limit*2,stdio:['pipe','pipe','pipe']});
function safePath(path){assert(typeof path==='string'&&path.length>0&&path.length<=95&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(part=>['','.','..','.git'].includes(part))&&/^[A-Za-z0-9._/[\]-]+$/.test(path),'Unsupported snapshot path');return path;}
function excluded(path){const name=basename(path).toLowerCase();return name==='.npmrc'||name.startsWith('.env')&&name!=='.env.example'||/\.(?:tsbuildinfo|pem|key|p12|pfx|db|sqlite|dump|log)$/.test(name)||/^(?:credentials|service-account).*\.json$/.test(name)||path.split('/').some(part=>['node_modules','.next','dist','coverage','artifacts','test-results','playwright-report'].includes(part)||part.startsWith('.next-'));}
function sourceBytes(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{assert(lstatSync(path).isFile(),'Snapshot requires regular source files');const bytes=readFileSync(fd);assert(bytes.length<=4*1024*1024,'Source file exceeds snapshot budget');return bytes;}finally{closeSync(fd);}}
function approved(approval,name){assert(names.includes(name)&&approval.schemaVersion===1&&approval.sources.includes(name)&&approval.instruction&&approval.publicReleaseApproved===false&&approval.externalMediaLicenseGranted===false,'Missing scoped owner approval');}

export function captureSnapshot({name,sourceRoot,outputRoot,metadataRoot,approval}){
 approved(approval,name);sourceRoot=resolve(sourceRoot);outputRoot=resolve(outputRoot);metadataRoot=resolve(metadataRoot);for(const target of [outputRoot,metadataRoot])assert(relative(sourceRoot,target).startsWith('..'),'Snapshot output cannot be inside source');
 const archivePath=resolve(outputRoot,name+'.tar'),manifestPath=resolve(outputRoot,name+'.json');assert(!existsSync(archivePath)&&!existsSync(manifestPath),'Snapshot is immutable; select a new revision instead of overwriting');
 const status=git(sourceRoot,['status','--porcelain=v1','--untracked-files=all']),head=git(sourceRoot,['rev-parse','HEAD']).trim(),branch=git(sourceRoot,['branch','--show-current']).trim();
 const paths=[...new Set(git(sourceRoot,['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))].sort();const exclusions=[],sources=[];let total=0;
 for(const path of paths){safePath(path);assert(!lstatSync(resolve(sourceRoot,path)).isSymbolicLink(),'Symlinks are not snapshot inputs');if(excluded(path)){exclusions.push({path,reason:'Secret-bearing configuration or generated/non-source data'});continue;}const bytes=sourceBytes(resolve(sourceRoot,path));total+=bytes.length;assert(total<=limit,'Snapshot source budget exceeded');sources.push({path,sha256:digest(bytes),bytes:bytes.length,executable:!!(lstatSync(resolve(sourceRoot,path)).mode&0o111),content:bytes});}
 assert(sources.length>0,'Empty snapshot');mkdirSync(metadataRoot,{recursive:true});const copy=mkdtempSync(resolve(metadataRoot,name+'-'));
 try{
  git(copy,['init','-q']);for(const row of sources){const path=resolve(copy,row.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,row.content,{flag:'wx'});chmodSync(path,row.executable?0o755:0o644);}
  git(copy,['add','--force','--',...sources.map(row=>row.path)]);git(copy,['commit','-q','-m',`Owner-selected offline ${name} snapshot; upstream ${head}`]);assert.equal(git(copy,['status','--porcelain=v1']), '');
  assert.equal(git(sourceRoot,['status','--porcelain=v1','--untracked-files=all']),status,'Source worktree changed during capture');assert.equal(git(sourceRoot,['rev-parse','HEAD']).trim(),head,'Source HEAD changed during capture');assert(sources.every(row=>digest(sourceBytes(resolve(sourceRoot,row.path)))===row.sha256),'Source bytes changed during capture');
  const commit=git(copy,['rev-parse','HEAD']).trim(),tree=git(copy,['rev-parse','HEAD^{tree}']).trim(),archive=git(copy,['archive','--format=tar','HEAD'],null);assert(archive.length<=limit*2,'Archive budget exceeded');
  const files=sources.map(row=>({path:row.path,sha256:row.sha256,bytes:row.bytes,executable:row.executable})),manifest={schemaVersion:1,name,selection:'Owner-selected current working source,including uncommitted/untracked implementation',origin:{path:sourceRoot,branch,head,dirtyEntries:status.trim()?status.trim().split('\n').length:0,statusSha256:digest(status)},commit,tree,archiveSha256:digest(archive),archiveBytes:archive.length,sourceDigest:digest(JSON.stringify(files)),files,exclusions,scope:'Offline integration only; original sources/DB/processes unchanged; no public/media license approval'};
  verifyArchive(archive,manifest);mkdirSync(outputRoot,{recursive:true});writeFileSync(archivePath,archive,{flag:'wx'});writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});git(copy,['fsck','--full']);
  return {name,commit,tree,files:files.length,excluded:exclusions.length,archiveBytes:archive.length,sourceUnchanged:true,metadataPath:copy};
 }catch(error){rmSync(copy,{recursive:true,force:true});throw error;}
}

export function verifyArchive(archive,manifest){
 assert(Buffer.isBuffer(archive)&&archive.length<=limit*2&&archive.length%512===0,'Invalid archive size');assert(manifest.schemaVersion===1&&names.includes(manifest.name)&&/^[0-9a-f]{40}$/.test(manifest.commit),'Invalid snapshot manifest');assert.equal(digest(archive),manifest.archiveSha256,'Archive hash mismatch');assert.equal(archive.length,manifest.archiveBytes,'Archive length mismatch');
 assert(Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=1024,'Invalid source manifest count');const expected=new Map();for(const row of manifest.files){safePath(row.path);assert(!excluded(row.path)&&!expected.has(row.path)&&/^[0-9a-f]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=4*1024*1024,'Invalid source manifest');expected.set(row.path,row);}assert.equal(digest(JSON.stringify(manifest.files)),manifest.sourceDigest,'Source manifest digest mismatch');
 const files=new Map();let offset=0,commit=null,total=0,ended=false;
 const number=field=>{const text=field.toString('ascii').replace(/\0.*$/,'').trim();assert(/^[0-7]+$/.test(text),'Invalid tar number');return parseInt(text,8);};
 while(offset<archive.length){const header=archive.subarray(offset,offset+512);offset+=512;if(header.every(byte=>byte===0)){assert(archive.subarray(offset).every(byte=>byte===0),'Nonzero archive trailer');ended=true;break;}
  const checksum=number(header.subarray(148,156));let calculated=0;for(let i=0;i<512;i++)calculated+=i>=148&&i<156?32:header[i];assert.equal(checksum,calculated,'Tar checksum mismatch');
  const text=(start,end)=>header.subarray(start,end).toString('utf8').replace(/\0.*$/,'');assert.equal(text(257,262),'ustar','Unsupported tar format');assert(!text(157,257),'Tar links are forbidden');const prefix=text(345,500),path=(prefix?prefix+'/':'')+text(0,100),size=number(header.subarray(124,136)),type=String.fromCharCode(header[156]);assert(size<=limit&&offset+size<=archive.length,'Tar entry exceeds budget');const body=archive.subarray(offset,offset+size);offset+=Math.ceil(size/512)*512;
  if(type==='g'){assert(commit===null&&files.size===0&&path==='pax_global_header','Unexpected archive metadata');const match=/^52 comment=([0-9a-f]{40})\n$/.exec(body.toString('utf8'));assert(match,'Unsupported archive metadata');commit=match[1];continue;}
  if(type==='5'){safePath(path.replace(/\/$/,''));assert.equal(size,0);continue;}
  assert(type==='0'||type==='\0','Non-regular tar entry');safePath(path);const row=expected.get(path);assert(row&&!files.has(path)&&!excluded(path),'Unexpected,duplicate or excluded archive entry');assert.equal(size,row.bytes,'Source length mismatch');assert.equal(digest(body),row.sha256,'Source hash mismatch');assert.equal(!!(number(header.subarray(100,108))&0o111),row.executable,'Source mode mismatch');total+=size;assert(total<=limit,'Expanded snapshot budget exceeded');files.set(path,body);
 }
 assert(ended&&commit===manifest.commit&&files.size===expected.size,'Incomplete snapshot or commit mismatch');return files;
}
export function verifySnapshot(root,name){assert(names.includes(name),'Unknown snapshot');const manifest=JSON.parse(readFileSync(resolve(root,name+'.json'),'utf8')),archive=readFileSync(resolve(root,name+'.tar'));verifyArchive(archive,manifest);return {name,commit:manifest.commit,files:manifest.files.length,archiveBytes:archive.length};}
export function materializeSnapshot({snapshotRoot,name,output}){
 assert(!existsSync(output),'Materialization target already exists');const manifest=JSON.parse(readFileSync(resolve(snapshotRoot,name+'.json'),'utf8')),files=verifyArchive(readFileSync(resolve(snapshotRoot,name+'.tar')),manifest);mkdirSync(dirname(output),{recursive:true});const staging=mkdtempSync(resolve(dirname(output),'.'+name+'-'));
 try{for(const [path,bytes] of files){const target=resolve(staging,safePath(path));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx',mode:manifest.files.find(row=>row.path===path).executable?0o755:0o644});}renameSync(staging,output);return {name,commit:manifest.commit,files:files.size};}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,name]=process.argv.slice(2),root=resolve('integrations/legacy-snapshots');assert(['capture','verify','materialize'].includes(command),'Expected capture,verify or materialize');
 if(command==='capture'){assert(names.includes(name),'Unknown source');console.log(JSON.stringify(captureSnapshot({name,sourceRoot:resolve('../'+name+'-cafe'),outputRoot:root,metadataRoot:resolve('artifacts/legacy-snapshots'),approval:JSON.parse(readFileSync(resolve(root,'approval.json'),'utf8'))})));}
 else if(command==='verify')console.log(JSON.stringify((name?[name]:names).map(value=>verifySnapshot(root,value))));
 else{assert(names.includes(name),'Unknown source');console.log(JSON.stringify(materializeSnapshot({snapshotRoot:root,name,output:resolve('artifacts/legacy-runtime',name)})));}
}
