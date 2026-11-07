import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {io} from 'socket.io-client';
import {validateTestDatabaseURL} from './test-environment.mjs';

const exec=promisify(execFile),root=process.cwd(),directory=resolve('artifacts/vnext/n10-03/rollback-'+randomUUID().slice(0,8)),source=directory+'/source';
const revision='793a0d6d6714d7aa64f0f26a5a14471f8b9b711f',require=createRequire(import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const facts={scope:'Actual pinned 44-aware API/shared-package source rebuilt locally against additive native schema45; not images,production migration or deployment',previousRevision:revision,commands:[],scenarios:[]};
await mkdir(source,{recursive:true,mode:0o700});let sequence=0,stage='source';
async function run(command,args,cwd=root){let result;try{result=await exec(command,args,{cwd,maxBuffer:32*1024*1024,timeout:300000});}catch(error){await writeFile(directory+'/failed-build.log',String(error.stdout??'')+String(error.stderr??''),{mode:0o600});throw Error('Pinned source build failed');}const bytes=result.stdout+result.stderr,log='build-'+(++sequence)+'.log';await writeFile(directory+'/'+log,bytes,{mode:0o600});facts.commands.push({command,args,exitCode:0,log,sha256:sha(bytes)});return result.stdout;}
// Reuse only installed external dependencies. Every workspace package resolves
// to the archived revision and is compiled there; no current auth code overlay.
async function externalLinks(relative){const from=resolve(root,relative,'node_modules'),to=resolve(source,relative,'node_modules');let names;try{names=await readdir(from);}catch{return;}await mkdir(to,{recursive:true});for(const name of names)if(name!=='@virtual-city')await symlink(resolve(from,name),resolve(to,name));}
const admin=new Pool({connectionString:validateTestDatabaseURL(process.env.TEST_DATABASE_URL)}),schema='native_rollback_'+randomUUID().replaceAll('-','');let pool,api;
try{
 await run('git',['archive','--format=tar','--output',directory+'/previous.tar',revision]);facts.archiveSha256=sha(await readFile(directory+'/previous.tar'));await run('tar',['-xf',directory+'/previous.tar','-C',source]);
 await externalLinks('.');await mkdir(source+'/node_modules/@virtual-city',{recursive:true});
 for(const entry of await readdir(source+'/packages')){const file=source+'/packages/'+entry+'/package.json';let pkg;try{pkg=JSON.parse(await readFile(file));}catch{continue;}await externalLinks('packages/'+entry);await symlink(source+'/packages/'+entry,source+'/node_modules/'+pkg.name);}
 await externalLinks('apps/platform-api');
 // Invoke the installed compiler directly: pnpm's pre-run dependency verifier
 // must not install or rewrite a materialized source/dependency snapshot.
 const packages=new Map();for(const entry of await readdir(source+'/packages')){try{const pkg=JSON.parse(await readFile(source+'/packages/'+entry+'/package.json'));packages.set(pkg.name,{pkg,path:source+'/packages/'+entry});}catch{/* No package manifest. */}}
 const built=new Set();async function buildPackage(name){if(built.has(name))return;const value=packages.get(name);if(!value)return;built.add(name);for(const dependency of Object.keys({...value.pkg.dependencies,...value.pkg.devDependencies}))await buildPackage(dependency);if(value.pkg.scripts?.build){assert.equal(value.pkg.scripts.build,'tsc -p tsconfig.json');await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],value.path);}}
 const apiPackage=JSON.parse(await readFile(source+'/apps/platform-api/package.json'));for(const name of Object.keys(apiPackage.dependencies))await buildPackage(name);
 await run(process.execPath,[root+'/node_modules/typescript/bin/tsc','-p','tsconfig.json'],source+'/apps/platform-api');await run(process.execPath,[source+'/scripts/copy-migrations.mjs'],source+'/apps/platform-api');
 const old={...require(source+'/apps/platform-api/dist/app.js'),...require(source+'/apps/platform-api/dist/config.js'),...require(source+'/apps/platform-api/dist/db/migrations.js')};
 const current={...require(root+'/apps/platform-api/dist/app.js'),...require(root+'/apps/platform-api/dist/config.js'),...require(root+'/apps/platform-api/dist/db/migrations.js')};
 const oldManifest=await old.migrationManifest(source+'/apps/platform-api/dist/db/migrations'),newManifest=await current.migrationManifest(root+'/apps/platform-api/dist/db/migrations');assert.equal(Object.keys(oldManifest).length,44);assert.equal(Object.keys(newManifest).length,45);for(const [name,hash]of Object.entries(oldManifest))assert.equal(newManifest[name],hash);
 facts.migrations={previous:44,current:45,oldPrefixPreserved:true};facts.policySha256=sha(await readFile('config/schema-compatibility-0044-native-expand.json'));
 await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL));url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});
 const origin='https://native-rollback.example.invalid',nativeKey=randomBytes(32).toString('hex'),env={NODE_ENV:'production',DATABASE_URL:url.toString(),SESSION_SECRET:randomBytes(48).toString('base64url'),WEB_ORIGIN:origin};
 async function start(runtime,window=false,native=false){api=await runtime.createApp(runtime.readConfig({...env,...window?{SCHEMA_COMPATIBILITY_FILE:resolve('config/schema-compatibility-0044-native-expand.json')}:{},...native?{NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:nativeKey}:{}}),pool,true);await api.app.listen(0,'127.0.0.1');return api.app.getUrl();}
 async function stop(){await api.app.close();api=undefined;}
 let cookie,account;
 async function browser(target){const response=await fetch(target+'/v1/me',{headers:{cookie}});assert.equal(response.status,200);const me=await response.json();assert.equal(me.profile.id,account);const socket=io(target,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});try{await new Promise((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',()=>no(Error('Browser socket rejected')));socket.connect();});assert.equal((await socket.timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()})).ok,true);}finally{socket.close();}}
 stage='old44';await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations');let target=await start(old,true);assert.equal((await fetch(target+'/health/ready')).status,200);
 const guest=await fetch(target+'/v1/session/guest',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),displayName:'Native rollback visitor',avatarKey:'fern'})});assert.equal(guest.status,201);cookie=guest.headers.get('set-cookie').split(';')[0];account=(await guest.json()).profile.id;await browser(target);
 stage='expand45-under-old';await current.migrate(pool);assert.equal((await fetch(target+'/health/ready')).status,200);await browser(target);facts.scenarios.push('Old44 API remains ready on actual schema45; same browser identity and TCP socket');await stop();
 stage='current45';target=await start(current,false,true);assert.equal((await fetch(target+'/health/ready')).status,200);await browser(target);
 const native=await fetch(target+'/v1/native/session/guest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,platform:'android',clientBuild:'rollback-fixture',protocol:{nonce:randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]},deviceLabel:'Synthetic rollback Android',guest:{requestId:randomUUID(),displayName:'Native retained visitor',avatarKey:'fern'}})});assert.equal(native.status,201);const nativeState=await native.json();assert.equal((await fetch(target+'/v1/me',{headers:{authorization:'Bearer '+nativeState.tokens.accessToken}})).status,200);await stop();facts.scenarios.push('Current45 API serves preserved browser identity and new native family');
 stage='actual-old-runtime-rollback';target=await start(old,true);assert.equal((await fetch(target+'/health/ready')).status,200);await browser(target);assert.equal((await fetch(target+'/v1/native/devices')).status,404);
 const nativeRows=await pool.query('SELECT count(*)::int AS n FROM native_device_sessions');assert.equal(nativeRows.rows[0].n,1);
 await assert.rejects(old.migrate(pool,source+'/apps/platform-api/dist/db/migrations'));
 await old.migrate(pool,source+'/apps/platform-api/dist/db/migrations',JSON.parse(await readFile('config/schema-compatibility-0044-native-expand.json')));assert.equal((await pool.query('SELECT count(*)::int AS n FROM city_schema_migrations')).rows[0].n,45);await browser(target);facts.scenarios.push('Pinned44 runtime rollback ready; native tables retained; strict old migrator refused; reviewed old rerun accepted');
 stage='negative-checksums';for(const name of [Object.keys(oldManifest)[0],Object.keys(newManifest).at(-1)]){const checksum=newManifest[name];await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,'0'.repeat(64)]);assert.equal((await fetch(target+'/health/ready')).status,503);await pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,checksum]);assert.equal((await fetch(target+'/health/ready')).status,200);}await stop();
 stage='strict44-reject';target=await start(old);assert.equal((await fetch(target+'/health/ready')).status,503);await stop();facts.scenarios.push('Old/45 checksum tampering and unqualified strict44 runtime fail readiness');
 stage='roll-forward45';target=await start(current,false,true);assert.equal((await fetch(target+'/health/ready')).status,200);await browser(target);assert.equal((await pool.query('SELECT count(*)::int AS n FROM native_device_sessions')).rows[0].n,1);assert.equal((await fetch(target+'/v1/me',{headers:{authorization:'Bearer '+nativeState.tokens.accessToken}})).status,200);await stop();facts.scenarios.push('Roll-forward45 with unchanged private keys preserves browser identity,native family and actual native access; no down migration');facts.result='PASS';
}catch(error){facts.result='FAIL';facts.failedStage=stage;facts.failedKind=error.name;process.exitCode=1;}
finally{await api?.app.close();await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();facts.cleanupComplete=true;await writeFile(directory+'/facts.json',JSON.stringify(facts,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:facts.result,failedStage:facts.failedStage,artifactDirectory:directory}));}
