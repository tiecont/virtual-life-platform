import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate} from '../../apps/platform-api/src/db/migrations';
async function main(){
 const target=new URL(process.env.TEST_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!/^virtual_city_test(?:_[a-z0-9]+)*$/.test(target.pathname.slice(1))||target.search||target.hash)throw Error('Disposable local test DB required');
 const pool=new Pool({connectionString:target.toString()});await migrate(pool);
 const runtime=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:target.toString(),SESSION_SECRET:randomBytes(48).toString('hex'),LOCAL_ADMISSION_UX:'1'}),pool);
 // Synthetic capacity fixture only; not a recommended CCU or public cap API.
 await pool.query('UPDATE platform_admission_policy SET hard=1,target=1,paused=false');
 await runtime.app.listen(4300,'127.0.0.1');process.once('SIGTERM',()=>{void runtime.app.close().then(()=>pool.end()).then(()=>process.exit(0));});
}
void main().catch(()=>{console.error('Queue browser fixture failed; no credentials emitted');process.exitCode=1;});
