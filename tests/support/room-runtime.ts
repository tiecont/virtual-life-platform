import { Pool } from 'pg';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { defineWorld } from '@virtual-city/world-sdk';

function raceWorld(slug:string,capacity:number){return defineWorld({schemaVersion:1,apiVersion:1,slug,title:'Synthetic TCP race fixture',version:'1.0.0',sceneRef:{key:slug,version:'1.0.0'},capacity,seatIds:['shared-seat'],capabilities:['presence','seating'],kind:'sandbox',accessPolicy:{kind:'public'},visibility:'listed',map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'}},{bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{}});}

async function main() {
  const config = readConfig(); const address = new URL(config.DATABASE_URL);
  if (config.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || !/^virtual_city_test(?:_|$)/.test(address.pathname.slice(1))) throw new Error('Local test runtime only');
  const world=process.env.ROOM_TEST_WORLD??'sdk-sandbox';if(!['sdk-sandbox','restaurant','lounge','race'].includes(world))throw new Error('Unsupported local benchmark world');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });
  const modules=world==='race'?[raceWorld('race-capacity',8),raceWorld('race-seats',100)]:undefined;
  const runtime = await createApp(config, pool,false,modules?{worlds:{modules}}:{});
  for(const slug of world==='race'?['race-capacity','race-seats']:[world])await runtime.worlds.registry.setEnabled(slug, true);
  await runtime.app.listen(Number(process.env.ROOM_TEST_PORT ?? 0), '127.0.0.1');
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'sample' || !('id' in message)) return;
    process.send?.({ type: 'sample', id: message.id, cpu: process.cpuUsage(), memory: process.memoryUsage(), diagnostics: runtime.diagnostics() });
  });
  process.send?.({ type: 'ready', url: await runtime.app.getUrl() });
  process.once('SIGTERM', () => { void runtime.app.close().then(() => pool.end()).then(() => { process.disconnect?.(); }); });
}
void main().catch(() => { console.error('Local room test runtime failed'); process.exitCode = 1; process.disconnect?.(); });
