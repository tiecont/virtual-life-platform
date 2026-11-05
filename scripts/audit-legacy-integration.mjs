import assert from 'node:assert/strict';
import { existsSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import {readHistoricalJson} from './evidence-reader.mjs';
import {evidenceOutput} from './evidence-output.mjs';

// Explicit source roots only: never read environment files, databases, generated
// bundles or credentials, and never write to the legacy worktree.
const name=process.argv[2]??'deadline';
assert(['deadline','maid'].includes(name),'Expected deadline or maid');
const root=resolve(process.argv[3]??`../${name}-cafe`),taskID=name==='deadline'?'M15-01':'M16-01';
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const status=()=>git(['-C',root,'status','--short','--untracked-files=all']);
const before=status(),head=git(['-C',root,'rev-parse','HEAD']);
const digest=value=>createHash('sha256').update(value).digest('hex');
function files(path){
 if(!existsSync(root+'/'+path))return [];
 return readdirSync(root+'/'+path,{withFileTypes:true}).flatMap(entry=>{
  if(['node_modules','dist','.next','.git','coverage','test-results','playwright-report'].includes(entry.name)||entry.name.startsWith('.next'))return [];
  const file=path+'/'+entry.name;
  return entry.isDirectory()?files(file):entry.isFile()&&/\.(ts|tsx|mjs|sql|json|md|svg)$/.test(entry.name)?[file]:[];
 });
}
const paths=[...new Set([
 'package.json','pnpm-lock.yaml','pnpm-workspace.yaml',
 ...files('apps/api/src'),...files('apps/api/test'),...files('apps/api/drizzle'),
 ...files('apps/web/src'),...files('apps/web/app'),...files('apps/web/public/assets'),
 ...files('tests'),...files('assets'),...files('packages').filter(path=>/\/(src|test)\//.test(path)||path.endsWith('/package.json')),
 ...['docs/ASSET-LICENSES.md','assets/LICENSES.md'].filter(path=>existsSync(root+'/'+path)),
])].sort();
const sources=paths.map(path=>({path,sha256:digest(readFileSync(root+'/'+path))}));
const routes=[],transportReferences=[],parseDiagnostics=[];
for(const path of paths.filter(path=>/\.[cm]?tsx?$/.test(path))){
 const code=readFileSync(root+'/'+path,'utf8'),source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
 parseDiagnostics.push(...source.parseDiagnostics.map(issue=>({path,code:issue.code,start:issue.start})));
 function visit(node){
  if(path.startsWith('apps/api/src/')){
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&/^(ws|socket\.io|@nestjs\/websockets|@nestjs\/platform-socket\.io)$/.test(node.moduleSpecifier.text))transportReferences.push({path,module:node.moduleSpecifier.text});
   if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text.startsWith('/')){
    const method=ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:ts.isIdentifier(node.expression)?node.expression.text:'';
    if(['get','post','put','patch','delete','Get','Post','Put','Patch','Delete'].includes(method))routes.push({path,method:method.toUpperCase(),route:node.arguments[0].text,syntax:ts.isIdentifier(node.expression)?'decorator':'call'});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
assert.equal(parseDiagnostics.length,0,'Source parse errors; inspect before claiming audit complete');
const prior=await readHistoricalJson(`docs/agent/evidence/${name==='deadline'?'m10-focus-audit':'m11-hospitality-audit'}.json`);
const comparison=prior.legacy.sources.map(item=>({path:item.path,previousSha256:item.sha256,currentSha256:sources.find(source=>source.path===item.path)?.sha256??null,unchanged:sources.some(source=>source.path===item.path&&source.sha256===item.sha256)}));
const baseline=await readHistoricalJson(`docs/agent/evidence/audit-${name}-checks.json`);
// Detect changes during inspection instead of treating a live worktree as a pin.
assert.equal(status(),before,'Legacy worktree changed during audit');
assert.equal(git(['-C',root,'rev-parse','HEAD']),head,'Legacy HEAD changed during audit');
assert(sources.every(source=>digest(readFileSync(root+'/'+source.path))===source.sha256),'Source changed during audit');
const report={taskID,auditedAt:new Date().toISOString(),cityBase:git(['rev-parse','HEAD']),command:`node scripts/audit-legacy-integration.mjs ${name}`,exitCode:0,
 legacy:{path:root,branch:git(['-C',root,'branch','--show-current']),head,status:before.split('\n').filter(Boolean),sourceDigest:digest(JSON.stringify(sources)),sources,apiSourceFiles:sources.filter(source=>source.path.startsWith('apps/api/src/')).map(source=>source.path),testFiles:sources.filter(source=>/\.(test|spec)\.|\.integration\./.test(source.path)).map(source=>source.path),routes,transportReferences,parseDiagnostics,rootLicenseFiles:['LICENSE','LICENSE.md','LICENSE.txt','COPYING'].filter(path=>existsSync(root+'/'+path)),previousFocusedAudit:comparison},
 datedBaseline:{rerun:false,commands:baseline,warning:'2026-11-02 baseline only;not a new runtime/build/DB/browser result. Source comparison covers listed prior focused files,not every baseline input.'},
 scope:'Readonly source/AST/hash inspection. No environment reads,source/asset copying,legacy DB/process/migration/network operation or worktree mutation. Parsed route references do not prove a listening service. Dirty source hashes are an observation,not an approved clean integration revision.'};
const artifact=evidenceOutput(`docs/agent/evidence/${name==='deadline'?'m15':'m16'}-integration-audit.json`);
writeFileSync(artifact,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({taskID,artifact,head,sources:sources.length,routes:routes.length,transportReferences:transportReferences.length,previousFocusedFilesUnchanged:comparison.filter(item=>item.unchanged).length,previousFocusedFiles:comparison.length,worktreeUnchanged:true}));
