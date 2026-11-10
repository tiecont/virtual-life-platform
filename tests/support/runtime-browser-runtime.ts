import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
async function main(){
 const target=new URL(process.env.TEST_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!/^virtual_city_test(?:_[a-z0-9]+)*$/.test(target.pathname.slice(1))||target.search||target.hash)throw Error('Disposable local test DB required');
 const address=target.toString(),pool=new Pool({connectionString:address}),key=randomBytes(32).toString('hex'),bootstrapTime=Date.now()-60000;
 await migrate(pool);await new OperatorService(pool,key,()=>bootstrapTime).bootstrap({password:'synthetic-admin-browser-password-only',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',code:totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',bootstrapTime)});
 const dir=await mkdtemp(join(tmpdir(),'city-runtime-browser-')),data=JSON.parse(await readFile('tests/fixtures/release-policy-production.json','utf8'));data.release.environment='test';data.runtime.environment='test';await writeFile(join(dir,'release.json'),JSON.stringify(data.release));await writeFile(join(dir,'runtime.json'),JSON.stringify(data.runtime));
 const app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address,SESSION_SECRET:'synthetic-admin-browser-player-secret-'.repeat(2),ADMIN_ORIGIN:'http://127.0.0.1:3400',OPERATOR_AUTH_KEY:key,OPERATOR_TELEMETRY_TOKEN:'e'.repeat(64),SAFETY_EVIDENCE_KEY:'ab'.repeat(32),RELEASE_ENVIRONMENT:'test',RELEASE_POLICY_FILE:join(dir,'release.json'),RUNTIME_WORLD_POLICY_FILE:join(dir,'runtime.json')}),pool,false,{safety:{policy:data.safety}});
 await app.app.listen(4300,'127.0.0.1');process.once('SIGTERM',()=>{void app.app.close().then(()=>pool.end()).then(()=>rm(dir,{recursive:true,force:true})).then(()=>{process.exit(0);});});
}
void main().catch(()=>{console.error('Synthetic admin browser runtime failed; no credentials emitted');process.exitCode=1;});
