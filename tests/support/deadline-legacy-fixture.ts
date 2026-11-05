import { Pool } from 'pg';
import { fork } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { verifySnapshot } from '../../scripts/legacy-snapshots.mjs';
export async function openDeadlineLegacyFixture(port=0){
 const base=new URL(process.env.TEST_DATABASE_URL??'');if(base.hostname!=='127.0.0.1'||!/^virtual_city_test(?:_|$)/.test(base.pathname.slice(1))||base.search||base.hash)throw Error('Disposable local test database required');
 verifySnapshot(resolve('integrations/legacy-snapshots'),'deadline');const manifest=JSON.parse(readFileSync('integrations/legacy-snapshots/deadline.json','utf8')) as {files:{path:string;sha256:string}[]};
 for(const row of manifest.files)if(createHash('sha256').update(readFileSync(resolve('artifacts/legacy-runtime/deadline',row.path))).digest('hex')!==row.sha256)throw Error('Selected legacy fixture source changed');
 const marker=JSON.parse(readFileSync('artifacts/legacy-runtime/deadline/.city-prepared.json','utf8')) as {node:string;apiHash:string};if(marker.node!==process.version||marker.apiHash!==createHash('sha256').update(readFileSync('artifacts/legacy-runtime/deadline/apps/api/dist/app.js')).digest('hex'))throw Error('Run pnpm legacy:prepare for this Node version');
 const name='virtual_city_test_deadline_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:base.toString()});await admin.query(`CREATE DATABASE "${name}"`);base.pathname='/'+name;const db=new Pool({connectionString:base.toString()});
 const child=fork(resolve('tests/support/deadline-legacy-runtime.mjs'),[],{cwd:resolve('.'),env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:base.toString(),PUBLIC_ORIGIN:'http://127.0.0.1:3300',DEADLINE_FIXTURE_PORT:String(port)},stdio:['ignore','ignore','ignore','ipc']});
 child.on('error',()=>{});
 let closed=false;const close=async()=>{if(closed)return;closed=true;if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');if(child.connected)child.send({operation:'stop'},error=>{if(error)child.kill('SIGTERM');});else child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);timer.unref();try{await ended;}finally{clearTimeout(timer);}}await db.end();try{await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}finally{await admin.end();}};
 try{const chosen=await new Promise<number>((ok,no)=>{const timer=setTimeout(()=>no(Error('Selected legacy fixture startup deadline')),10000);const fail=()=>{clearTimeout(timer);no(Error('Selected legacy fixture exited before readiness'));};child.once('exit',fail);child.once('error',fail);child.on('message',raw=>{const message=raw as {ready?:boolean;port?:number};if(message.ready&&Number.isInteger(message.port)&&message.port!>=1&&message.port!<=65535){clearTimeout(timer);child.off('exit',fail);child.off('error',fail);ok(message.port!);}});});return {url:'http://127.0.0.1:'+chosen,db,name,close,sourceCommit:verifySnapshot(resolve('integrations/legacy-snapshots'),'deadline').commit};}
 catch(error){await close();throw error;}
}
