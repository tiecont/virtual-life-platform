import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {EnvironmentSafetyPolicySchema} from '@virtual-city/contracts';
import type {ReleasePolicy,RuntimeWorldPolicy} from '../../../../../shared/config/release-policy';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readConfig} from '../../../../../shared/config/environment';
import {createWorldRuntime} from './service';
const releasePolicyFixture=()=>JSON.parse(readFileSync('tests/fixtures/release-policy-production.json','utf8')) as {release:ReleasePolicy;safety:ReturnType<typeof EnvironmentSafetyPolicySchema.parse>;runtime:RuntimeWorldPolicy};

async function fixture(work:(input:{data:ReturnType<typeof releasePolicyFixture>;releaseFile:string;runtimeFile:string;config:ReturnType<typeof readConfig>;start:()=>Promise<Awaited<ReturnType<typeof createWorldRuntime>>>})=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'city-release-install-')),data=releasePolicyFixture(),releaseFile=join(dir,'release.json'),runtimeFile=join(dir,'runtime.json'),opened:Awaited<ReturnType<typeof createWorldRuntime>>[]=[];
 await writeFile(releaseFile,JSON.stringify(data.release));await writeFile(runtimeFile,JSON.stringify(data.runtime));
 const config=readConfig({NODE_ENV:'production',DATABASE_URL:'postgres://localhost/virtual_city_test_unit',SESSION_SECRET:'synthetic-unit-release-'.repeat(3),WEB_ORIGIN:'https://synthetic.example.invalid',RELEASE_ENVIRONMENT:'production',RELEASE_POLICY_FILE:releaseFile,RUNTIME_WORLD_POLICY_FILE:runtimeFile,SAFETY_EVIDENCE_KEY:'ab'.repeat(32)});
 const identity={authenticate:async()=>({accountId:'synthetic-account',sessionId:'synthetic-session',kind:'guest' as const,expiresAt:Date.now()+60000})} as unknown as IdentityService;
 const start=async()=>{const world=await createWorldRuntime(config,identity,{safetyPolicy:data.safety});opened.push(world);return world;};
 try{await work({data,releaseFile,runtimeFile,config,start});}finally{for(const world of opened)await world.registry.close();await rm(dir,{recursive:true,force:true});}
}
it('genuine production factories bootstrap pinned Deadline/Maid content through explicit policy, without fixture/local installers',async()=>fixture(async({start})=>{
 const world=await start();expect(world.registry.slugs().sort()).toEqual(['deadline','maid']);const cards=await world.registry.catalog('synthetic');expect(cards.worlds.map(card=>[card.slug,card.capacity,card.availability])).toEqual([['deadline',40,'available'],['maid',30,'available']]);expect(world.registry.projectionContext('maid').definition.hospitalityPolicy?.staffing?.kind).toBe('voluntary');expect(world.releasePolicy?.permitsQuick('maid')).toBe(true);
}));
it('runtime changes are bounded; direct registry activation, malformed input and stale revisions cannot bypass entitlements',async()=>fixture(async({data,runtimeFile,start})=>{
 const world=await start(),captured=world.registry.projectionContext('maid');data.runtime.version=2;data.runtime.worlds.maid=false;await writeFile(runtimeFile,JSON.stringify(data.runtime));await world.reloadFlags();expect(captured.valid()).toBe(false);await expect(world.registry.setEnabled('maid',true)).rejects.toMatchObject({code:'FORBIDDEN'});
 await writeFile(runtimeFile,JSON.stringify({...data.runtime,version:3,worlds:{...data.runtime.worlds,unknown:true}}));await expect(world.reloadFlags()).rejects.toThrow('worlds disabled');expect((await world.registry.catalog('synthetic')).worlds.every(card=>card.availability==='disabled')).toBe(true);await expect(world.registry.setEnabled('deadline',true)).rejects.toMatchObject({code:'FORBIDDEN'});
 data.runtime.version=3;await writeFile(runtimeFile,JSON.stringify(data.runtime));await world.reloadFlags();expect(world.registry.projectionContext('deadline').valid()).toBe(true);await world.reloadFlags();data.runtime.version=2;await writeFile(runtimeFile,JSON.stringify(data.runtime));await expect(world.reloadFlags()).rejects.toThrow('worlds disabled');
}));
it('communication can be withdrawn without closing the world and release-file edits cannot escalate the running process',async()=>fixture(async({data,runtimeFile,releaseFile,start})=>{
 const world=await start();data.runtime.version=2;data.runtime.quickInteractions=false;await writeFile(runtimeFile,JSON.stringify(data.runtime));await world.reloadFlags();expect(world.registry.projectionContext('maid').valid()).toBe(true);expect(world.releasePolicy?.permitsQuick('maid')).toBe(false);
 data.release.worlds.park.install=true;data.release.worlds.park.entitled=true;await writeFile(releaseFile,JSON.stringify(data.release));data.runtime.version=3;data.runtime.worlds.park=true;await writeFile(runtimeFile,JSON.stringify(data.runtime));await expect(world.reloadFlags()).rejects.toThrow('worlds disabled');
}));
it('missing reporting key, source version mismatch, safety hash mismatch and missing files fail before installation',async()=>{
 await fixture(async({config,start})=>{delete config.SAFETY_EVIDENCE_KEY;await expect(start()).rejects.toThrow('reporting key');});
 await fixture(async({data,releaseFile,start})=>{data.release.worlds.deadline.worldVersion='99.0.0';await writeFile(releaseFile,JSON.stringify(data.release));await expect(start()).rejects.toThrow('world version');});
 await fixture(async({data,start})=>{data.safety.draftRetentionHours.reportEvidence=12;await expect(start()).rejects.toThrow('safety policy hash mismatch');});
 await fixture(async({releaseFile,start})=>{await rm(releaseFile);await expect(start()).rejects.toThrow('configuration unavailable');});
});
