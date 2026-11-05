import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn,execFile } from 'node:child_process';
import { Pool } from 'pg';
const mode=process.argv[2],id=process.argv[3];if(!['owned','external','failure','wait'].includes(mode)||!/^[a-f0-9]{8}$/.test(id??''))throw Error('Invalid synthetic probe');
assert(process.env.NODE_ENV==='test');assert(process.env.TZ==='UTC');assert(process.env.DATABASE_URL===process.env.TEST_DATABASE_URL);assert(process.env.SESSION_SECRET!=='synthetic-forbidden-parent-session');
assert(process.env.SAFETY_EVIDENCE_KEY!=='13'.repeat(32));assert(process.env.DATING_PROFILE_KEY!=='17'.repeat(32));assert(process.env.LOCAL_DATING_PROTOTYPE==='0');assert(process.env.OPERATOR_TELEMETRY_TOKEN==='');
for(const key of ['PGHOST','PGOPTIONS','UNEXPECTED_PRIVATE_VALUE'])assert(process.env[key]===undefined,'Inherited forbidden runtime state');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:3000}),table='harness_probe_'+id,url=new URL(process.env.TEST_DATABASE_URL);
const result={id,mode,project:process.env.CITY_TEST_DB_PROJECT,port:Number(url.port),secretFingerprint:createHash('sha256').update(process.env.SESSION_SECRET).digest('hex')};
if(mode==='external'){
 assert(result.project==='external');assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,1);await pool.end();console.log('HARNESS_PROBE '+JSON.stringify(result));
}else{
 assert(/^virtual-city-test-[a-f0-9]{8}$/.test(result.project??''));await pool.query(`CREATE TABLE ${table}(id int PRIMARY KEY)`);await pool.query(`INSERT INTO ${table} VALUES(1)`);
 if(mode==='owned'){
  const output=await new Promise((ok,no)=>{execFile(process.execPath,['scripts/with-test-db.mjs',process.execPath,'tests/support/harness-probe.mjs','external',id],{env:process.env,maxBuffer:1024*1024},(error,stdout)=>error?no(Error('External probe failed')):ok(stdout));});
  const nested=JSON.parse(output.split('\n').find(line=>line.startsWith('HARNESS_PROBE ')).slice(14));assert(nested.secretFingerprint!==result.secretFingerprint);assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,1);result.externalNotStopped=true;result.externalHasFreshSecret=true;
 }
 if(mode==='wait'){
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});result.descendantPid=child.pid;console.log('HARNESS_PROBE '+JSON.stringify(result));setInterval(()=>{},1000);
 }else{if(mode==='failure'){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();result.descendantPid=child.pid;}await pool.end();console.log('HARNESS_PROBE '+JSON.stringify(result));if(mode==='failure')process.exitCode=7;}
}
