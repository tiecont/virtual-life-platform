import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate,migrationManifest} from '../../apps/platform-api/src/db/migrations';
import {migrationSetDigest,resolveSchemaCompatibility} from '../../apps/platform-api/src/config/schema-compatibility';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
let admin:Pool;const opened:{pool:Pool;schema:string;directory:string;apps:Awaited<ReturnType<typeof createApp>>[]}[]=[];
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});});
afterEach(async()=>{for(const r of opened.splice(0)){for(const app of r.apps)await app.app.close();await r.pool.end();await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);await rm(r.directory,{recursive:true,force:true});}});
afterAll(async()=>{await admin.end();});
async function fixture(){
 const schema='schema_compat_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const address=new URL(process.env.TEST_DATABASE_URL!);address.searchParams.set('options','-c search_path='+schema);const pool=new Pool({connectionString:address.toString()}),directory=await mkdtemp(join(tmpdir(),'city-schema-compat-')),apps:Awaited<ReturnType<typeof createApp>>[]=[];opened.push({pool,schema,directory,apps});await migrate(pool);
 const own=await migrationManifest(),expansionName=String(Object.keys(own).length+1).padStart(4,'0')+'_expand_probe.sql',expansion=await readFile('tests/fixtures/schema-compat/0039_expand_probe.sql'),checksum=createHash('sha256').update(expansion).digest('hex');
 const policy={schemaVersion:1,policyVersion:1,mode:'expand-compatible',journal:'city_schema_migrations',metadataVersion:1,runtimeManifestSha256:migrationSetDigest(own),minimumDatabaseMigrations:Object.keys(own).length,maximumDatabaseMigrations:Object.keys(own).length+1,reviewRef:'evidence:synthetic-expand-only',migrations:[...Object.entries(own).map(([name,checksum])=>({name,checksum})),{name:expansionName,checksum}]};
 const file=join(directory,'compatibility.json');await writeFile(file,JSON.stringify(policy));const expanded=join(directory,'migrations');await cp('apps/platform-api/src/db/migrations',expanded,{recursive:true});await writeFile(join(expanded,expansionName),expansion);
 const start=async(compatible=true)=>{const app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:'synthetic-schema-compat-secret-'.repeat(2),...compatible?{SCHEMA_COMPATIBILITY_FILE:file}:{}}),pool);apps.push(app);return app;};
 return {pool,start,expanded,own,policy,file,expansionName};
}
it('current runtime remains ready across real next expansion and code restart while strict default rejects it; no data rollback occurs',async()=>{
 const r=await fixture(),old=await r.start();expect((await old.http.inject('/health/ready')).statusCode).toBe(200);
 const guest=await old.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin:'http://127.0.0.1:3300'},payload:{requestId:randomUUID(),displayName:'Schema visitor',avatarKey:'mint'}});expect(guest.statusCode).toBe(201);const cookie=String(guest.headers['set-cookie']).split(';')[0],identity=guest.json().profile.id;
 await migrate(r.pool,r.expanded);expect((await r.pool.query('SELECT count(*)::int AS n FROM city_schema_migrations')).rows[0].n).toBe(Object.keys(r.own).length+1);expect((await old.http.inject('/health/ready')).statusCode).toBe(200);expect((await old.http.inject({url:'/v1/me',headers:{cookie}})).json().profile.id).toBe(identity);await old.app.close();
 const strict=await r.start(false);expect((await strict.http.inject('/health/ready')).statusCode).toBe(503);expect((await strict.http.inject('/health/live')).statusCode).toBe(200);await strict.app.close();const rollback=await r.start();expect((await rollback.http.inject('/health/ready')).statusCode).toBe(200);expect((await rollback.http.inject({url:'/v1/me',headers:{cookie}})).json().profile.id).toBe(identity);
 await expect(migrate(r.pool)).rejects.toThrow('compatibility window');await migrate(r.pool,undefined,resolveSchemaCompatibility(r.own,r.policy));expect((await r.pool.query('SELECT marker FROM vnext_compat_probe')).rows).toEqual([{marker:'synthetic-expand'}]);expect((await r.pool.query('SELECT count(*)::int AS n FROM city_schema_migrations')).rows[0].n).toBe(Object.keys(r.own).length+1);
});
it('approved expansion never permits old/tail checksum corruption,unknown suffix,gaps or incompatible metadata',async()=>{
 const r=await fixture();await migrate(r.pool,r.expanded);const app=await r.start();const ready=async()=> (await app.http.inject('/health/ready')).statusCode;expect(await ready()).toBe(200);
 for(const name of [Object.keys(r.own)[0],r.expansionName]){const row=(await r.pool.query<{checksum:string}>('SELECT checksum FROM city_schema_migrations WHERE name=$1',[name])).rows[0];await r.pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,'0'.repeat(64)]);expect(await ready()).toBe(503);await expect(migrate(r.pool,undefined,resolveSchemaCompatibility(r.own,r.policy))).rejects.toThrow('checksum mismatch');await r.pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[name,row.checksum]);expect(await ready()).toBe(200);}
 await r.pool.query("INSERT INTO city_schema_migrations(name,checksum) VALUES('9999_unknown.sql',$1)",['f'.repeat(64)]);expect(await ready()).toBe(503);await r.pool.query("DELETE FROM city_schema_migrations WHERE name='9999_unknown.sql'");
 const first=Object.keys(r.own)[0];await r.pool.query('UPDATE city_schema_migrations SET name=$2 WHERE name=$1',[first,'0000_unknown.sql']);expect(await ready()).toBe(503);await r.pool.query('UPDATE city_schema_migrations SET name=$1 WHERE name=$2',[first,'0000_unknown.sql']);
 await r.pool.query('UPDATE platform_metadata SET schema_version=2');expect(await ready()).toBe(503);await expect(migrate(r.pool,undefined,resolveSchemaCompatibility(r.own,r.policy))).rejects.toThrow('metadata incompatible');await r.pool.query('UPDATE platform_metadata SET schema_version=1');expect(await ready()).toBe(200);
});
