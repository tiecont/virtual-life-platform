import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { toolEnvironment,validateTestDatabaseURL } from '../../scripts/test-environment.mjs';

// Execute the selected source's actual11unit/4PG foundation cases with its own
// Vitest5 config/toolchain,never an ancestor City config or original database.
const base=new URL(validateTestDatabaseURL(process.env.TEST_DATABASE_URL)),root=resolve('artifacts/legacy-runtime/maid');
const requireSource=createRequire(resolve(root,'package.json')),{Pool}=requireSource('pg');
const name='maid_cafe_test_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:base.toString()});
await admin.query(`CREATE DATABASE "${name}"`);base.pathname='/'+name;
try{
 const code=await new Promise((ok,no)=>{
  const child=spawn('pnpm',['exec','vitest','run','--config',resolve(root,'vitest.config.mts'),'--project','unit','--project','integration'],{cwd:root,stdio:'inherit',env:{...toolEnvironment(process.env),NODE_ENV:'test',TZ:'UTC',DATABASE_URL:base.toString(),TEST_DATABASE_URL:base.toString()}});
  child.once('error',no);child.once('exit',value=>ok(value??1));
 });process.exitCode=code;
}finally{await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();}
