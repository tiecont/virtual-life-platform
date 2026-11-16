import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProgressionPolicySchema} from '@virtual-city/contracts';
import {readPreviewEnvironment} from '../../scripts/local-preview.mjs';
const env={PREVIEW_DB_PASSWORD:'a'.repeat(64),PREVIEW_SESSION_SECRET:'b'.repeat(96),PREVIEW_OPERATOR_KEY:'c'.repeat(64),PREVIEW_METRICS_TOKEN:'d'.repeat(64),PREVIEW_WEB_PORT:'4800',PREVIEW_ADMIN_PORT:'4900',PREVIEW_API_PORT:'4700',PREVIEW_NATIVE_PORT:'4600'};
const serialize=value=>Object.entries(value).map(([key,value])=>key+'='+value).join('\n');
test('local environment rejects exposed/missing/shared secrets, symlinks and invalid or colliding ports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aetheria-preview-')),file=join(root,'runtime.env');
 try{
  await writeFile(file,serialize(env),{mode:0o600});assert.deepEqual({...await readPreviewEnvironment(file)},env);
  for(const delta of [{PREVIEW_OPERATOR_KEY:''},{PREVIEW_SESSION_SECRET:env.PREVIEW_DB_PASSWORD},{PREVIEW_WEB_PORT:'0'},{PREVIEW_WEB_PORT:'65536'},{PREVIEW_WEB_PORT:env.PREVIEW_ADMIN_PORT}]){await writeFile(file,serialize({...env,...delta}));await assert.rejects(readPreviewEnvironment(file));}
  await writeFile(file,serialize(env));await chmod(file,0o644);await assert.rejects(readPreviewEnvironment(file));await chmod(file,0o600);
  await symlink(file,join(root,'link.env'));await assert.rejects(readPreviewEnvironment(join(root,'link.env')));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all local server runtimes bind only loopback and preserve auth, migration and default-off reward/gameplay boundaries',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aetheria-compose-')),empty=join(root,'empty.env');
 try{
  await writeFile(empty,'');const args=['compose','--env-file',empty,'-f','infra/compose/preview.yml','config','--format','json'];
  assert.throws(()=>execFileSync('docker',args,{env:{PATH:process.env.PATH},stdio:'pipe'}));
  const config=JSON.parse(execFileSync('docker',args,{env:{PATH:process.env.PATH,...env},encoding:'utf8',stdio:['ignore','pipe','pipe']})),s=config.services;
  assert.deepEqual(Object.keys(s).sort(),['admin','api','db','game-runtime','migrate','portal','worker']);
  for(const service of Object.values(s))for(const port of service.ports??[])assert.equal(port.host_ip,'127.0.0.1');
  assert(!s.db.ports);assert(!s.worker.ports);assert.equal(s.api.depends_on.migrate.condition,'service_completed_successfully');
  assert.equal(s.api.environment.ADMIN_ORIGIN,'http://127.0.0.1:4900');assert.equal(s.admin.environment.AETHERIA_SITE_PREVIEW,'1');assert.equal(s.admin.environment.NODE_ENV,'development');
  for(const key of ['DATABASE_URL','SESSION_SECRET','OPERATOR_AUTH_KEY'])assert(!Object.hasOwn(s.admin.environment,key));
  for(const key of ['SESSION_SECRET','OPERATOR_AUTH_KEY','NATIVE_REWARD_POLICY_FILE'])assert(!Object.hasOwn(s.worker.environment,key));
  assert.equal(s['game-runtime'].environment.VL_GAMEPLAY_ENABLED,'0');
  const policy=ProgressionPolicySchema.parse(JSON.parse(await readFile('infra/compose/preview-worker.json','utf8')));for(const rule of Object.values(policy.worlds)){assert.deepEqual(rule.kinds,[]);assert.equal(rule.dailyXp,0);}
 }finally{await rm(root,{recursive:true,force:true});}
});
