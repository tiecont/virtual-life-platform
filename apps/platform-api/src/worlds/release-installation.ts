import {readFile} from 'node:fs/promises';
import {WorldRegistry,type WorldPorts} from '@virtual-city/world-sdk';
import type {Config} from '../config';
import {parseReleasePolicy,evaluateReleasePolicy,assertRuntimeTransition,assertReleaseSafety,type EvaluatedReleasePolicy,type RuntimeWorldPolicy} from '../config/release-policy';
import {worldInstallers} from './installers';

async function policyFile(file:string){try{const bytes=await readFile(file);if(bytes.length>65536)throw Error('Policy bounds');return JSON.parse(bytes.toString('utf8')) as unknown;}catch{throw Error('Release/runtime policy configuration unavailable');}}
export async function createReleaseWorldRuntime(config:Config,ports:WorldPorts,safetyPolicy:unknown){
 if(!config.RELEASE_POLICY_FILE||!config.RUNTIME_WORLD_POLICY_FILE||!config.RELEASE_ENVIRONMENT)throw Error('Explicit release/runtime policy configuration required');
 const environment=config.RELEASE_ENVIRONMENT,release=parseReleasePolicy(await policyFile(config.RELEASE_POLICY_FILE),environment);
 assertReleaseSafety(release,safetyPolicy);
 if(release.capabilities.confidentialReports&&!config.SAFETY_EVIDENCE_KEY)throw Error('Confidential reporting key required before installation');
 let active:EvaluatedReleasePolicy|undefined,activating:EvaluatedReleasePolicy|undefined,last:RuntimeWorldPolicy|undefined;
 const registry=new WorldRegistry(config.NODE_ENV,{
  ...ports,
  canAccess:async(actor,definition)=>Object.entries(release.worlds).some(([slug,entry])=>slug===definition.slug&&entry.entitled)&&await ports.canAccess(actor,definition),
  canEnable:definition=>(activating??active)?.enabledWorlds.some(slug=>slug===definition.slug)??false,
  canUse:definition=>active?.enabledWorlds.some(slug=>slug===definition.slug)??false,
 });
 for(const [slug,create] of Object.entries(worldInstallers)){
  const entitlement=release.worlds[slug as keyof typeof worldInstallers];if(!entitlement.install)continue;
  const adapter=create();if(adapter.definition.version!==entitlement.worldVersion)throw Error('Installed world version differs from release entitlement');registry.register(adapter);
 }
 let tail:Promise<void>=Promise.resolve();
 function reloadFlags():Promise<void>{
  const work=tail.then(async()=>{
   active=undefined;activating=undefined;
   try{
    const candidate=evaluateReleasePolicy(release,await policyFile(config.RUNTIME_WORLD_POLICY_FILE!),environment);
    if(last)assertRuntimeTransition(last,candidate.runtime);activating=candidate;
    const results=await Promise.allSettled(registry.slugs().map(slug=>registry.setEnabled(slug,candidate.enabledWorlds.some(world=>world===slug))));
    if(results.some(result=>result.status==='rejected'))throw Error('World bootstrap rejected');
    last=candidate.runtime;active=candidate;activating=undefined;
   }catch{
    active=undefined;activating=undefined;await Promise.allSettled(registry.slugs().map(slug=>registry.setEnabled(slug,false)));
    throw Error('Release/runtime world policy unavailable; worlds disabled');
   }
  });tail=work.catch(()=>{});return work;
 }
 try{await reloadFlags();}catch(error){await registry.close().catch(()=>{});throw error;}
 return {registry,reloadFlags,releasePolicy:Object.freeze({
  environment,version:release.version,confidentialEvidence:release.capabilities.confidentialReports,
  quickOnlyWorlds:['maid','park'].filter(slug=>release.capabilities.quickInteractions&&Object.entries(release.worlds).some(([world,entry])=>world===slug&&entry.install)),
  permitsQuick:(slug:string)=>active?.quickWorlds.some(world=>world===slug)??false,
  runtimeVersion:()=>last?.version??0,
 })};
}
