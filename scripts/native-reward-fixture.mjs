import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Disposable local fixture only; the worker still uses its reviewed SQL role.
export async function nativeRewardFixture({admin,pool,schema,rewardRole,rewardPassword,address,directory,scope,markRewardRoleCreated}){
 const identifier=value=>{assert.match(value,/^[a-z][a-z0-9_]*$/);return '"'+value+'"';};
 await admin.query(`CREATE ROLE ${identifier(rewardRole)} LOGIN PASSWORD '${rewardPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4`);markRewardRoleCreated();
 await pool.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(rewardRole)}`);
 const profile=JSON.parse(await readFile('config/native-reward-worker-db-privileges.json'));
 for(const op of ['select','insert'])for(const table of profile[op])await pool.query(`GRANT ${op.toUpperCase()} ON ${identifier(table)} TO ${identifier(rewardRole)}`);
 for(const [table,columns]of Object.entries(profile.update))await pool.query(`GRANT UPDATE (${columns.map(identifier).join(',')}) ON ${identifier(table)} TO ${identifier(rewardRole)}`);
 const policy=resolve(directory,'pet-reward-policy.private.json');
 await writeFile(policy,JSON.stringify({schemaVersion:1,world:scope.worldId,ruleset:'pet-arena-pve',rulesetVersion:1,contentHash:scope.contentHash,rewardKey:'pet-training-win',completionKind:'pet-arena.completed.v1'}),{mode:0o600});
 const workerAddress=new URL(address);workerAddress.username=rewardRole;workerAddress.password=rewardPassword;
 return async()=>{
  const child=spawn(process.execPath,['apps/platform-api/dist/worker.js','--once'],{env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:workerAddress.toString(),DURABLE_JOB_ROLE:'worker',NATIVE_REWARD_POLICY_FILE:policy},stdio:['ignore','pipe','pipe']});
  let log='';
  const capture=chunk=>{log=(log+chunk).slice(-32768);};
  child.stdout.on('data',capture);child.stderr.on('data',capture);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
  try{
   const code=await new Promise((ok,no)=>{child.once('error',no);child.once('close',ok);});
   if(code!==0)await writeFile(resolve(directory,'reward-worker-failure.log'),log.replaceAll(rewardPassword,'[redacted]').replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-test-address]'),{mode:0o600});
   assert.equal(code,0,'Local restricted reward worker failed; inspect reward-worker-failure.log');
  }finally{clearTimeout(timer);}
 };
}
