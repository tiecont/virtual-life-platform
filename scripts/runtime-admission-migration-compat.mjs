import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {validateTestDatabaseURL} from './test-environment.mjs';

const execute=promisify(execFile),root=process.cwd(),revision='aca14de0c50fe5d80c7563846a07b6bd55fc7321';
const directory=resolve('artifacts/desktop-first/vl013/migration-'+randomUUID().slice(0,8)),source=directory+'/source';
const require=createRequire(import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex');
const policyRef='config/schema-compatibility-0048-admission-expand.json';
const facts={taskId:'VL-013',scope:'Actual archived48 Nest runtime on additive50 disposable PG; no production, runtime-role or TLS qualification',previousRevision:revision,commands:[],scenarios:[],startedAt:new Date().toISOString()};
await mkdir(source,{recursive:true,mode:0o700});
async function run(bin,args,cwd=root){
 const log='build-'+facts.commands.length+'.log';
 try{const result=await execute(bin,args,{cwd,maxBuffer:32*1024**2,timeout:300000});const bytes=result.stdout+result.stderr;await writeFile(directory+'/'+log,bytes);facts.commands.push({command:[bin,...args].join(' '),exitCode:0,log,sha256:sha(bytes)});}
 catch(error){await writeFile(directory+'/'+log,String(error.stdout??'')+String(error.stderr??''));facts.commands.push({command:[bin,...args].join(' '),exitCode:error.code??1,log});throw Error('Archived48 runtime build failed');}
}
async function linkDependencies(relative){
 const from=resolve(root,relative,'node_modules'),to=resolve(source,relative,'node_modules');
 let names;try{names=await readdir(from);}catch{return;}
 await mkdir(to,{recursive:true});
 for(const name of names)if(name!=='@virtual-city')await symlink(resolve(from,name),resolve(to,name));
}
let pool,admin,api,created=false,stage='archive';const schema='admission_compat_'+randomUUID().replaceAll('-','');
try{
 await run('git',['archive','--format=tar','--output',directory+'/previous.tar',revision,'packages','apps/platform-api','scripts/copy-migrations.mjs','config']);
 facts.archiveSha256=sha(await readFile(directory+'/previous.tar'));await run('tar',['-xf',directory+'/previous.tar','-C',source]);
 await linkDependencies('.');await mkdir(source+'/node_modules/@virtual-city',{recursive:true});
 const packages=new Map();
 for(const name of await readdir(source+'/packages')){
  let pkg;try{pkg=JSON.parse(await readFile(source+'/packages/'+name+'/package.json'));}catch{continue;}
  await linkDependencies('packages/'+name);await symlink(source+'/packages/'+name,source+'/node_modules/'+pkg.name);packages.set(pkg.name,{pkg,path:source+'/packages/'+name});
 }
 await linkDependencies('apps/platform-api');const built=new Set();
 async function build(name){if(built.has(name)||!packages.has(name))return;built.add(name);const item=packages.get(name);for(const dep of Object.keys({...item.pkg.dependencies,...item.pkg.devDependencies}))await build(dep);if(item.pkg.scripts?.build){assert.equal(item.pkg.scripts.build,'tsc -p tsconfig.json');await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],item.path);}}
 for(const name of Object.keys(JSON.parse(await readFile(source+'/apps/platform-api/package.json')).dependencies))await build(name);
 await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],source+'/apps/platform-api');
 await run(process.execPath,[source+'/scripts/copy-migrations.mjs'],source+'/apps/platform-api');
 const old={...require(source+'/apps/platform-api/dist/app.js'),...require(source+'/apps/platform-api/dist/config.js'),...require(source+'/apps/platform-api/dist/db/migrations.js')};
 const current={...require(root+'/apps/platform-api/dist/app.js'),...require(root+'/apps/platform-api/dist/shared/config/environment.js'),...require(root+'/apps/platform-api/dist/shared/database/migrations.js')};
 const before=await old.migrationManifest(source+'/apps/platform-api/dist/db/migrations'),after=await current.migrationManifest();
 assert.equal(Object.keys(before).length,48);assert.equal(Object.keys(after).length,50);
 for(const [name,checksum]of Object.entries(before))assert.equal(after[name],checksum);
 const policy=JSON.parse(await readFile(policyRef));facts.policySha256=sha(await readFile(policyRef));
 const address=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));admin=new Pool({connectionString:address.toString()});
 await admin.query(`CREATE SCHEMA "${schema}"`);created=true;address.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:address.toString()});
 const env={NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomBytes(48).toString('hex'),WEB_ORIGIN:'http://127.0.0.1:3300'};
 async function start(runtime,expanded=false){api=await runtime.createApp(runtime.readConfig({...env,...expanded?{SCHEMA_COMPATIBILITY_FILE:resolve(policyRef)}:{}}),pool);}
 async function stop(){if(api){await api.app.close();api=undefined;}}
 async function ready(status){assert.equal((await api.http.inject('/health/ready')).statusCode,status);}
 async function sameIdentity(cookie,id){const response=await api.http.inject({url:'/v1/me',headers:{cookie}});assert.equal(response.statusCode,200);assert.equal(response.json().profile.id,id);}
 stage='old48';await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations');await start(old,true);await ready(200);
 const user=await api.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin:env.WEB_ORIGIN},payload:{requestId:randomUUID(),displayName:'Admission compat',avatarKey:'mint'}});
 assert.equal(user.statusCode,201);const cookie=String(user.headers['set-cookie']).split(';')[0],account=user.json().profile.id;
 await pool.query(`INSERT INTO engine_game_matches(id,table_id,generation,room_epoch,room_id,mode,ruleset_version,status,state_version,seed_commitment,start_request_id,start_fingerprint,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,'lantern-colors','1.0.0','ABORTED',1,$6,$7,$8,now(),now())`,[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID(),'a'.repeat(64),randomUUID(),'b'.repeat(64)]);
 await pool.query(`INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,owner_boot_id,epoch,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot,protocol_version,canonical_version,rng_version)
  VALUES($1,'native:compat-fixture','fixture-only',1,$2,$3,$4,1,0,0,0,'ACTIVE',$5,$6,'fixture-key',$7,$8,$9,1,1,1)`,[randomUUID(),randomBytes(32),randomBytes(32),randomUUID(),randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),randomBytes(20)]);
 const legacy=(await pool.query("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) AS data FROM engine_game_matches m")).rows[0].data;
 const native=(await pool.query("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) AS data FROM game_native_matches m")).rows[0].data;
 stage='expand50';await Promise.all([current.migrate(pool),current.migrate(pool)]);await ready(200);await sameIdentity(cookie,account);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM platform_native_worlds WHERE enabled')).rows[0].n,0);
 facts.scenarios.push('Two current migrators expand48->50 under existing lock; archived48 API stays ready with same identity; no enabled native world');
 const world='native:compat-'+randomUUID();await pool.query("INSERT INTO platform_native_worlds(world_id,boot_id,content_hash,lease_until) VALUES($1,$2,$3,clock_timestamp())",[world,randomUUID(),'ab'.repeat(32)]);
 const frozen=(await pool.query('SELECT to_jsonb(w) AS data FROM platform_native_worlds w WHERE world_id=$1',[world])).rows[0].data;
 stage='strict-old';await stop();await start(old);await ready(503);await assert.rejects(old.migrate(pool,source+'/apps/platform-api/dist/db/migrations'));await stop();
 stage='runtime-rollback';await start(old,true);await ready(200);await sameIdentity(cookie,account);await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations',policy);
 assert.deepEqual((await pool.query('SELECT to_jsonb(w) AS data FROM platform_native_worlds w WHERE world_id=$1',[world])).rows[0].data,frozen);
 facts.scenarios.push('Strict old48 rejects unknown50; explicit exact-prefix policy permits runtime rollback without destructive down migration or altering closed world');
 stage='negative-checks';
 for(const name of [Object.keys(before)[0],Object.keys(after).at(-1)]){
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,'0'.repeat(64)]);await ready(503);await assert.rejects(old.migrate(pool,source+'/apps/platform-api/dist/db/migrations',policy));
  await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,after[name]]);await ready(200);
 }
 await pool.query("INSERT INTO city_schema_migrations VALUES('9999_unknown.sql',$1,now())",['0'.repeat(64)]);await ready(503);await pool.query("DELETE FROM city_schema_migrations WHERE name='9999_unknown.sql'");await ready(200);
 stage='roll-forward';await stop();await start(current);await ready(200);await sameIdentity(cookie,account);
 assert.deepEqual((await pool.query("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) AS data FROM engine_game_matches m")).rows[0].data,legacy);
 assert.deepEqual((await pool.query("SELECT jsonb_agg(to_jsonb(m) ORDER BY id) AS data FROM game_native_matches m")).rows[0].data,native);
 assert.deepEqual((await pool.query('SELECT to_jsonb(w) AS data FROM platform_native_worlds w WHERE world_id=$1',[world])).rows[0].data,frozen);
 const rows=(await pool.query('SELECT name,checksum FROM city_schema_migrations ORDER BY name')).rows;assert.deepEqual(Object.fromEntries(rows.map(r=>[r.name,r.checksum])),after);
 facts.scenarios.push('Prefix/tail checksum and unknown future migration fail closed; current50 roll-forward preserves identity, old game rows and closed-world bytes');
 facts.migrations={previous:48,current:50,oldPrefixUnchanged:true,concurrentMigrators:2};facts.result='PASS';
}catch(error){facts.result='FAIL';facts.failedStage=stage;facts.failureKind=error.name;facts.frames=String(error.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,4);process.exitCode=1;}
finally{
 try{await api?.app.close();await pool?.end();if(created)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin?.end();facts.cleanupComplete=true;}
 catch{facts.cleanupComplete=false;process.exitCode=1;}
 facts.completedAt=new Date().toISOString();await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,failedStage:facts.failedStage,artifactDirectory:directory}));
}
