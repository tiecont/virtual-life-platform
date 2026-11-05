import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { materializeSnapshot,verifySnapshot } from './legacy-snapshots.mjs';
import { toolEnvironment } from './test-environment.mjs';
const args=process.argv.slice(2);if(args.some(arg=>arg!=='--allow-network'))throw Error('Unknown baseline preparation option');
const source=resolve('integrations/legacy-snapshots'),root=resolve('artifacts/legacy-runtime/deadline'),manifest=JSON.parse(readFileSync(resolve(source,'deadline.json'),'utf8'));verifySnapshot(source,'deadline');
if(!existsSync(root))materializeSnapshot({snapshotRoot:source,name:'deadline',output:root});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function unchanged(){if(!manifest.files.every(row=>hash(readFileSync(resolve(root,row.path)))===row.sha256))throw Error('Selected Deadline source changed;materialize a fresh copy before preparation');}
unchanged();const marker=resolve(root,'.city-prepared.json'),api=resolve(root,'apps/api/dist/app.js');let prepared=false;
if(existsSync(marker)&&existsSync(api)){const saved=JSON.parse(readFileSync(marker,'utf8'));prepared=saved.sourceDigest===manifest.sourceDigest&&saved.node===process.version&&saved.apiHash===hash(readFileSync(api));}
if(!prepared){for(const command of [['install','--frozen-lockfile','--ignore-scripts',...args.includes('--allow-network')?[]:['--offline']],['--filter','@deadline/api...','build']]){const result=spawnSync('pnpm',command,{cwd:root,stdio:'inherit',env:{...toolEnvironment(process.env),NEXT_TELEMETRY_DISABLED:'1',TZ:'UTC'}});if(result.status!==0)throw Error('Selected Deadline baseline preparation failed');}unchanged();writeFileSync(marker,JSON.stringify({sourceDigest:manifest.sourceDigest,node:process.version,apiHash:hash(readFileSync(api))})+'\n');}
console.log(JSON.stringify({source:'deadline',commit:manifest.commit,sourceFiles:manifest.files.length,sourceUnchanged:true,prepared:true,networkPermitted:args.includes('--allow-network'),node:process.version,declaredNode:'26.13.x'}));
