import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';

const execute=promisify(execFile),root=process.cwd(),revision='5386a8cd3cf3e4360fd55f8f06bc84d159ff540b';
const directory=resolve('artifacts/desktop-first/vl016/compat-'+randomUUID().slice(0,8)),source=directory+'/source';
const require=createRequire(import.meta.url),sha=v=>createHash('sha256').update(v).digest('hex');
const policyRef='config/schema-compatibility-0047-admission-expand.json';
const facts={taskId:'VL-013',scope:'Actual archived47 Nest API and migrator on additive50 disposable PG; no production, Rust orchestration, deployment or GPU qualification',previousRevision:revision,currentRevision:(await execute('git',['rev-parse','HEAD'])).stdout.trim(),commands:[],scenarios:[],startedAt:new Date().toISOString()};
await mkdir(source,{recursive:true,mode:0o700});
async function run(bin,args,cwd=root){
 const name='build-'+facts.commands.length+'.log';
 try{const result=await execute(bin,args,{cwd,maxBuffer:32*1024**2,timeout:300000});const bytes=result.stdout+result.stderr;await writeFile(directory+'/'+name,bytes,{mode:0o600});facts.commands.push({command:[bin,...args].join(' '),exitCode:0,log:name,sha256:sha(bytes)});}
 catch(error){await writeFile(directory+'/'+name,String(error.stdout??'')+String(error.stderr??''),{mode:0o600});facts.commands.push({command:[bin,...args].join(' '),exitCode:error.code??1,log:name});throw Error('Archived runtime build failed');}
}
async function externalLinks(relative){
 let names;const from=resolve(root,relative,'node_modules'),to=resolve(source,relative,'node_modules');
 try{names=await readdir(from);}catch{return;}
 await mkdir(to,{recursive:true});for(const name of names)if(name!=='@virtual-city')await symlink(resolve(from,name),resolve(to,name));
}
let pool,api,admin,created=false,stage='archive';
const schema='native_compat_'+randomUUID().replaceAll('-','');
try{
 await run('git',['archive','--format=tar','--output',directory+'/previous.tar',revision,'packages','apps/platform-api','scripts/copy-migrations.mjs','config']);
 facts.archiveSha256=sha(await readFile(directory+'/previous.tar'));await run('tar',['-xf',directory+'/previous.tar','-C',source]);
 await externalLinks('.');await mkdir(source+'/node_modules/@virtual-city',{recursive:true});
 const packages=new Map();
 for(const entry of await readdir(source+'/packages')){
  let pkg;try{pkg=JSON.parse(await readFile(source+'/packages/'+entry+'/package.json'));}catch{continue;}
  await externalLinks('packages/'+entry);await symlink(source+'/packages/'+entry,source+'/node_modules/'+pkg.name);packages.set(pkg.name,{pkg,path:source+'/packages/'+entry});
 }
 await externalLinks('apps/platform-api');const built=new Set();
 async function build(name){if(built.has(name)||!packages.has(name))return;built.add(name);const item=packages.get(name);for(const dep of Object.keys({...item.pkg.dependencies,...item.pkg.devDependencies}))await build(dep);if(item.pkg.scripts?.build){assert.equal(item.pkg.scripts.build,'tsc -p tsconfig.json');await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],item.path);}}
 for(const name of Object.keys(JSON.parse(await readFile(source+'/apps/platform-api/package.json')).dependencies))await build(name);
 await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],source+'/apps/platform-api');
 await run(process.execPath,[source+'/scripts/copy-migrations.mjs'],source+'/apps/platform-api');
 const old={...require(source+'/apps/platform-api/dist/app.js'),...require(source+'/apps/platform-api/dist/config.js'),...require(source+'/apps/platform-api/dist/db/migrations.js')};
 const current={...require(root+'/apps/platform-api/dist/app.js'),...require(root+'/apps/platform-api/dist/shared/config/environment.js'),...require(root+'/apps/platform-api/dist/shared/database/migrations.js')};
 const before=await old.migrationManifest(source+'/apps/platform-api/dist/db/migrations'),after=await current.migrationManifest(root+'/apps/platform-api/dist/shared/database/migrations');
 assert.equal(Object.keys(before).length,47);assert.equal(Object.keys(after).length,50);for(const [name,checksum]of Object.entries(before))assert.equal(after[name],checksum);
 const policy=JSON.parse(await readFile(policyRef));facts.policySha256=sha(await readFile(policyRef));
 const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));admin=new Pool({connectionString:address.toString()});
 await admin.query(`CREATE SCHEMA "${schema}"`);created=true;address.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:address.toString()});
 const env={NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:'http://127.0.0.1:3300'};
 async function start(runtime,expanded=false){api=await runtime.createApp(runtime.readConfig({...env,...expanded?{SCHEMA_COMPATIBILITY_FILE:resolve(policyRef)}:{}}),pool);return api;}
 async function stop(){if(api){await api.app.close();api=undefined;}}
 async function ready(status){assert.equal((await api.http.inject('/health/ready')).statusCode,status);}
 async function sameUser(cookie,id){const response=await api.http.inject({url:'/v1/me',headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().profile.id,id);}
 stage='old47';await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations');await start(old,true);await ready(200);
 const guest=await api.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin:env.WEB_ORIGIN},payload:{requestId:randomUUID(),displayName:'Native compat visitor',avatarKey:'mint'}});
 assert.equal(guest.statusCode,201);const cookie=String(guest.headers['set-cookie']).split(';')[0],account=guest.json().profile.id;
 const legacyId=randomUUID();await pool.query(`INSERT INTO engine_game_matches(id,table_id,generation,room_epoch,room_id,mode,ruleset_version,status,state_version,seed_commitment,start_request_id,start_fingerprint,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,'lantern-colors','1.0.0','ABORTED',1,$6,$7,$8,now(),now())`,[legacyId,randomUUID(),randomUUID(),randomUUID(),randomUUID(),'a'.repeat(64),randomUUID(),'b'.repeat(64)]);
 const legacy=(await pool.query('SELECT to_jsonb(m) AS data FROM engine_game_matches m WHERE id=$1',[legacyId])).rows[0].data;
 stage='expand50';await Promise.all([current.migrate(pool),current.migrate(pool)]);await ready(200);await sameUser(cookie,account);
 facts.scenarios.push('Two current migrators expand47->50 under existing lock; actual archived47 API remains ready and preserves same browser identity');
 const match=randomUUID(),key=randomBytes(32),nonce=randomBytes(12),aad=Buffer.from('VL016-fixture:'+match+':v0');
 const secret=Buffer.from(JSON.stringify({seed:randomBytes(32).toString('hex'),hidden:'synthetic-private-only'}));
 const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(secret),cipher.final()]),tag=cipher.getAuthTag();
 await pool.query(`INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,owner_boot_id,epoch,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,protocol_version,canonical_version,rng_version)
 VALUES($1,'native:compat-fixture','fixture-only',1,$2,$3,$4,1,0,0,0,'ACTIVE',$5,$6,'fixture-key',$7,$8,$9,1,1,1)`,[match,randomBytes(32),randomBytes(32),randomUUID(),randomBytes(32),randomBytes(32),nonce,tag,ciphertext]);
 const readNative=async()=> (await pool.query('SELECT * FROM game_native_matches WHERE id=$1',[match])).rows[0];const frozen=await readNative();
 stage='strict-old';await stop();await start(old);await ready(503);await assert.rejects(old.migrate(pool,source+'/apps/platform-api/dist/db/migrations'));await stop();
 stage='old-runtime-rollback';await start(old,true);await ready(200);await sameUser(cookie,account);await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations',policy);assert.deepEqual(await readNative(),frozen);
 facts.scenarios.push('Strict archived47 readiness/migrator refuse undeclared50; explicit exact-prefix expansion policy allows old runtime rollback without down migration or touching native ciphertext');
 stage='checksum-negatives';
 for(const name of [Object.keys(before)[0],'0048_native_game_storage.sql',Object.keys(after).at(-1)]){
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,'0'.repeat(64)]);await ready(503);
  await assert.rejects(old.migrate(pool,source+'/apps/platform-api/dist/db/migrations',policy));
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,after[name]]);await ready(200);
 }
 await pool.query("INSERT INTO city_schema_migrations VALUES('9999_unknown.sql',$1,now())",['0'.repeat(64)]);await ready(503);await pool.query("DELETE FROM city_schema_migrations WHERE name='9999_unknown.sql'");await ready(200);
 stage='roll-forward';await stop();await start(current);await ready(200);await sameUser(cookie,account);
 assert.deepEqual(await readNative(),frozen);assert.deepEqual((await pool.query('SELECT to_jsonb(m) AS data FROM engine_game_matches m WHERE id=$1',[legacyId])).rows[0].data,legacy);
 const stored=await readNative(),decipher=createDecipheriv('aes-256-gcm',key,stored.snapshot_nonce);decipher.setAAD(aad);decipher.setAuthTag(stored.snapshot_tag);assert.deepEqual(Buffer.concat([decipher.update(stored.sealed_snapshot),decipher.final()]),secret);
 const rows=(await pool.query('SELECT name,checksum FROM city_schema_migrations ORDER BY name')).rows;assert.deepEqual(Object.fromEntries(rows.map(r=>[r.name,r.checksum])),after);
 facts.scenarios.push('Original/native-storage/tail checksum and unknown migration fail closed; current50 roll-forward preserves every old47 checksum, legacy game row, identity and native AEAD fixture roundtrip');
 facts.migrations={previous:47,current:50,oldPrefixUnchanged:true,concurrentMigrators:2};facts.nativeCiphertextSha256=sha(ciphertext);facts.result='PASS';
}catch(error){facts.result='FAIL';facts.failedStage=stage;facts.failureKind=error.name;facts.frames=String(error.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,4);process.exitCode=1;}
finally{
 try{await api?.app.close();await pool?.end();if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin?.end();facts.cleanupComplete=true;}
 catch{facts.cleanupComplete=false;process.exitCode=1;}
 facts.completedAt=new Date().toISOString();await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,failedStage:facts.failedStage,artifactDirectory:directory}));
}
