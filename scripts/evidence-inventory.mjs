import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidenceRoot='docs/agent/evidence/';
const textual=/\.(?:m?[jt]sx?|cjs|json|md|ya?ml|html|css|sql|sh|txt)$/;
function protectedPath(name){return /(?:^|\/)\.env(?:\.|$)/.test(name)&&!name.endsWith('.env.example')||/\.(?:pem|key|jks|keystore|p12|pfx)$/.test(name)||/(?:^|\/)(?:\.aws|\.ssh|credentials)(?:\/|$)/.test(name);}
export function classifyFile(name) {
 if(protectedPath(name))return {classification:'PROTECTED',decision:'KEEP_PROTECTED',gate:'Never read/archive automatically'};
 if(name.startsWith('integrations/legacy-snapshots/'))return {classification:'LEGACY_FIXTURE',decision:'KEEP',gate:'Legacy consumers and immutable source pins'};
 if(/(?:^|\/)migrations\/.*\.sql$/.test(name)||name.endsWith('pnpm-lock.yaml'))return {classification:'MIGRATION_OR_LOCK',decision:'KEEP',gate:'Never rewrite for cleanup'};
 if(/(?:^|\/)(?:dist|\.next[^/]*|coverage|playwright-report|test-results)\//.test(name))return {classification:'TRACKED_GENERATED',decision:'REVIEW_FOR_REMOVE',gate:'Clean-checkout rebuild and consumer proof required'};
 if(name.startsWith(evidenceRoot))return name.endsWith('.json')?{classification:'EVIDENCE_JSON',decision:'KEEP_UNTIL_LOADER_MIGRATED',gate:'Verified index/loader and missing/tampered regressions before any move'}:{classification:'RAW_EVIDENCE',decision:'ARCHIVE_CANDIDATE',gate:'Full hash manifest, private storage/retention, restore and consumers before cleanup'};
 if(/provenance|(?:^|\/)assets\//.test(name))return {classification:'ASSET_OR_PROVENANCE',decision:'KEEP',gate:'Reproducibility, consumers and rights preserved'};
 if(name.startsWith('docs/agent/')||name.startsWith('reference/'))return {classification:'HISTORICAL_GOVERNANCE',decision:'KEEP',gate:'Historical IDs/evidence and current documentation links'};
 if(name.startsWith('.github/')||['.dockerignore','.env.example','.gitignore','.node-version','.npmrc'].includes(name))return {classification:'SOURCE_CONFIG_OR_DOC',decision:'KEEP',gate:'Build/runtime/CI configuration retained'};
 if(/^(?:apps|packages|scripts|tests|infra|config|contracts|plans|docs)\//.test(name)||/^(?:AGENTS|README|MASTER-AGENT-PLAN|EXECUTION-BOARD|PLAN-MANIFEST|package|pnpm-workspace|eslint|vitest|playwright)/.test(name))return {classification:'SOURCE_CONFIG_OR_DOC',decision:'KEEP',gate:'Public imports, runtime discovery, file readers and docs may consume this file'};
 return {classification:'UNCLASSIFIED',decision:'KEEP_REVIEW',gate:'Absence of direct imports does not prove unused'};
}
function git(root,args){return execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});}
function head(root){try{return git(root,['rev-parse','--verify','HEAD']).toString().trim();}catch{return 'UNCOMMITTED_FIXTURE';}}
function references(body) {
 const found=[];
 for(const expression of [/(["'`])([^"'`\n]+)\1/g,/(?<!!)\[[^\]\n]+\]\(([^\s)]+)\)/g,/\b(?:src|href)=["']([^"']+)["']/g]){
  for(const match of body.matchAll(expression)){
   const value=match.length===3?match[2]:match[1];
   if(value?.includes('evidence'))for(const part of value.split(';'))if(part.includes('evidence'))found.push({value:part,index:match.index});
  }
 }
 return found;
}
export async function collectInventory(root=process.cwd()) {
 root=path.resolve(root);const sourceRevision=head(root),status=digest(git(root,['status','--porcelain=v1','-z']));
 const names=[...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean))].sort();
 const files=[],texts=[];
 for(const name of names){
  const absolute=path.resolve(root,name);if(!absolute.startsWith(root+path.sep))throw Error('Input path escape');
  const info=await lstat(absolute),classification=classifyFile(name);
  const row={path:name,bytes:info.size,sha256:null,...classification,consumers:[]};
  if(info.isSymbolicLink()){row.classification='SYMLINK';row.decision='KEEP_REVIEW';row.gate='Symlink target not read; manual ownership review';}
  else if(info.isFile()&&row.classification!=='PROTECTED'){
   const bytes=await readFile(absolute);const after=await lstat(absolute);if(after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw Error('Input changed during inventory');
   row.sha256=digest(bytes);if(textual.test(name)&&bytes.length<=8*1024*1024)texts.push({path:name,body:bytes.toString('utf8')});
  }
  files.push(row);
 }
 const byPath=new Map(files.map(row=>[row.path,row])),dynamicConsumers=[],unresolvedReferences=[],seen=new Set();
 for(const source of texts)for(const ref of references(source.body)){
  const token=ref.value.split('#')[0],line=source.body.slice(0,ref.index).split('\n').length;
  if(/^[a-z][a-z0-9+.-]*:/i.test(token)||/\s/.test(token))continue;
  const prefix=token.split('${')[0],rootRelative=/^(?:docs|apps|packages|scripts|tests|infra|config|contracts|plans|reference|integrations)\//.test(prefix);
  const target=rootRelative?path.resolve(root,prefix):path.resolve(root,path.dirname(source.path),prefix);
  if(!target.startsWith(root+path.sep))continue;
  const relative=path.relative(root,target).split(path.sep).join('/');
  if(relative!==evidenceRoot.slice(0,-1)&&!relative.startsWith(evidenceRoot))continue;
  if(token.includes('${')||relative===evidenceRoot.slice(0,-1)){
   const key=source.path+':'+line+':dynamic';if(!seen.has(key)){seen.add(key);dynamicConsumers.push({path:source.path,line,kind:'DYNAMIC_PATH_REVIEW',scope:'Evidence prefix/template; exact children not statically proven'});}continue;
  }
  if(/[{}]/.test(token))continue;
  const key=source.path+':'+line+':'+relative;if(seen.has(key))continue;seen.add(key);
  const consumer={path:source.path,line,kind:source.path.startsWith(evidenceRoot)?'HISTORICAL_EVIDENCE':/^(scripts|tests|apps)\//.test(source.path)?'EXECUTABLE_OR_TEST':'DOCUMENTATION_OR_METADATA',access:'STATIC_REFERENCE_READ_OR_WRITE_REQUIRES_REVIEW'};
  const row=byPath.get(relative);if(row)row.consumers.push(consumer);else unresolvedReferences.push({consumer:source.path,line,target:relative});
 }
 if(head(root)!==sourceRevision||digest(git(root,['status','--porcelain=v1','-z']))!==status)throw Error('Repository changed during inventory');
 const byClassification={},byDecision={};let bytes=0,staticConsumerEdges=0;
 for(const row of files){bytes+=row.bytes;staticConsumerEdges+=row.consumers.length;byClassification[row.classification]=(byClassification[row.classification]??0)+1;byDecision[row.decision]=(byDecision[row.decision]??0)+1;}
 return {schemaVersion:1,sourceRevision,workingTreeStatusSha256:status,executedAt:new Date().toISOString(),scope:'Tracked and nonignored workspace files; ignored artifacts/caches excluded',cleanupAuthorized:false,destructiveActions:false,consumerCoverage:'Conservative static lower bound; dynamic/symbolic readers and missing references require review; never infer unused',summary:{files:files.length,bytes,byClassification,byDecision,staticConsumerEdges,dynamicConsumers:dynamicConsumers.length,unresolvedReferences:unresolvedReferences.length},dynamicConsumers,unresolvedReferences,files};
}
export async function writeInventory(root,relative,data) {
 root=path.resolve(root);const normalized=path.normalize(relative);
 if(path.isAbsolute(relative)||!normalized.startsWith('artifacts'+path.sep)||normalized.includes('..'))throw Error('Inventory output must stay inside artifacts');
 const target=path.resolve(root,normalized);let current=root;
 for(const segment of path.relative(root,path.dirname(target)).split(path.sep)){
  current=path.join(current,segment);try{if((await lstat(current)).isSymbolicLink())throw Error('Output symlink escape');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await mkdir(path.dirname(target),{recursive:true,mode:0o700});await writeFile(target,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out')throw Error('Usage: evidence-inventory.mjs --out artifacts/<private-scope>/inventory.json');
 const data=await collectInventory();await writeInventory(process.cwd(),args[1],data);console.log(JSON.stringify({...data.summary,sourceRevision:data.sourceRevision,output:args[1],cleanupAuthorized:false}));
}
