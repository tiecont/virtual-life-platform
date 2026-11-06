import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {OperatorService} from '../../apps/platform-api/src/identity/operator-service';
import {totp} from '../../apps/platform-api/src/identity/operator-crypto';
async function main(){
 const target=new URL(process.env.TEST_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!/^virtual_city_test(?:_[a-z0-9]+)*$/.test(target.pathname.slice(1))||target.search||target.hash)throw Error('Disposable local test DB required');
 const address=target.toString(),pool=new Pool({connectionString:address}),key=randomBytes(32).toString('hex'),bootstrapTime=Date.now()-60000;
 await migrate(pool);await new OperatorService(pool,key,()=>bootstrapTime).bootstrap({password:'synthetic-admin-browser-password-only',totpSecret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',code:totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',bootstrapTime)});
 const app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address,SESSION_SECRET:'synthetic-admin-browser-player-secret-'.repeat(2),ADMIN_ORIGIN:'http://127.0.0.1:3400',OPERATOR_AUTH_KEY:key,OPERATOR_TELEMETRY_TOKEN:'e'.repeat(64)}),pool);
 await app.app.listen(4300,'127.0.0.1');process.once('SIGTERM',()=>{void app.app.close().then(()=>pool.end()).then(()=>{process.exit(0);});});
}
void main().catch(()=>{console.error('Synthetic admin browser runtime failed; no credentials emitted');process.exitCode=1;});
