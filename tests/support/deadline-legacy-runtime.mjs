import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'||!/^virtual_city_test_deadline_[a-f0-9]+$/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable legacy fixture database required');
const requireLegacy=createRequire(resolve('artifacts/legacy-runtime/deadline/apps/api/package.json'));
const {Pool}=requireLegacy('pg'),{migrateDb}=requireLegacy(resolve('artifacts/legacy-runtime/deadline/apps/api/dist/db/migrate.js')),{createApp}=requireLegacy(resolve('artifacts/legacy-runtime/deadline/apps/api/dist/app.js'));
const migrationPool=new Pool({connectionString:url.toString()});await migrateDb(migrationPool);await migrationPool.end();
const runtime=await createApp({logging:false});await runtime.app.listen(Number(process.env.DEADLINE_FIXTURE_PORT??'0'),'127.0.0.1');
const port=runtime.app.getHttpServer().address().port;process.send?.({ready:true,port});let stopping=false;
async function stop(){if(stopping)return;stopping=true;await runtime.close();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());process.on('message',message=>{if(message?.operation==='stop')void stop();});process.on('disconnect',()=>void stop());
