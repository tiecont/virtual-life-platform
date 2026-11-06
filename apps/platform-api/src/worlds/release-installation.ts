import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {RuntimeControlSnapshot} from '@virtual-city/contracts';
import type {RuntimeControlReader} from '../operations/runtime-policy-store';
import {WorldRegistry,type WorldPorts} from '@virtual-city/world-sdk';
import type {Config} from '../config';
import {parseReleasePolicy,evaluateReleasePolicy,assertRuntimeTransition,assertReleaseSafety,type EvaluatedReleasePolicy,type RuntimeWorldPolicy} from '../config/release-policy';
import {worldInstallers} from './installers';

async function policyFile(file:string){try{const bytes=await readFile(file);if(bytes.length>65536)throw Error('Policy bounds');return JSON.parse(bytes.toString('utf8')) as unknown;}catch{throw Error('Release/runtime policy configuration unavailable');}}
export async function createReleaseWorldRuntime(config:Config,ports:WorldPorts,safetyPolicy:unknown,reader?:RuntimeControlReader){
 if(!config.RELEASE_POLICY_FILE||!config.RUNTIME_WORLD_POLICY_FILE||!config.RELEASE_ENVIRONMENT)throw Error('Explicit release/runtime policy configuration required');
 const environment=config.RELEASE_ENVIRONMENT,release=parseReleasePolicy(await policyFile(config.RELEASE_POLICY_FILE),environment);
 assertReleaseSafety(release,safetyPolicy);
 if(release.capabilities.confidentialReports&&!config.SAFETY_EVIDENCE_KEY)throw Error('Confidential reporting key required before installation');
 let active:EvaluatedReleasePolicy|undefined,activating:EvaluatedReleasePolicy|undefined,last:RuntimeWorldPolicy|undefined;
 const releaseHash=createHash('sha256').update(JSON.stringify(release)).digest('hex'),fences=new Set<symbol>();let epoch=0;
 let projection:'APPLIED'|'PENDING'|'FAILED'|'STALE'='PENDING',appliedRevision:number|null=null,observed:RuntimeControlSnapshot|undefined;
 const desired=()=>reader?.read(environment,releaseHash)??Promise.resolve({revision:0,releaseHash,maintenance:false,paused:{deadline:false,maid:false,library:false,restaurant:false,park:false,lounge:false,dating:false}});
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
   const generation=epoch;active=undefined;activating=undefined;projection='PENDING';
   try{
    const base=evaluateReleasePolicy(release,await policyFile(config.RUNTIME_WORLD_POLICY_FILE!),environment),restriction=await desired(),stale=restriction.releaseHash!==releaseHash;
    if(last)assertRuntimeTransition(last,base.runtime);
    const effective={...base.runtime,maintenance:base.runtime.maintenance||restriction.maintenance||stale,worlds:Object.fromEntries(Object.entries(base.runtime.worlds).map(([slug,enabled])=>[slug,enabled&&!restriction.paused[slug as keyof typeof restriction.paused]]))};
    const candidate=evaluateReleasePolicy(release,effective,environment);activating=candidate;
    const results=await Promise.allSettled(registry.slugs().map(slug=>registry.setEnabled(slug,candidate.enabledWorlds.some(world=>world===slug))));
    if(results.some(result=>result.status==='rejected'))throw Error('World bootstrap rejected');
    last=base.runtime;observed=restriction;activating=undefined;
    if(!fences.size&&generation===epoch){active=candidate;appliedRevision=stale?null:restriction.revision;projection=stale?'STALE':'APPLIED';}
   }catch{
    active=undefined;activating=undefined;projection='FAILED';appliedRevision=null;await Promise.allSettled(registry.slugs().map(slug=>registry.setEnabled(slug,false)));
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
  controls:Object.freeze({
   context:()=>({environment,releaseHash,releaseVersion:release.version,runtimeFileVersion:last?.version??null,baseMaintenance:last?.maintenance??null,projection,appliedRevision,worlds:Object.entries(release.worlds).map(([slug,entry])=>({slug,installed:entry.install,entitled:entry.entitled,baseEnabled:last?.worlds[slug as keyof RuntimeWorldPolicy['worlds']]??null,available:projection==='APPLIED'&&registry.permitsActivityDisclosure(slug)}))}),
   // A pending SQL write fences positive authority; reloads cannot clear another
   // in-flight fence. Only canonical state after transaction settlement applies.
   fence:()=>{const token=Symbol();fences.add(token);epoch++;active=undefined;projection='PENDING';return()=>{if(fences.delete(token))epoch++;};},
   reconcile:reloadFlags,
   maintain:async()=>{try{const current=await desired();if(!observed||projection==='FAILED'||projection==='PENDING'||JSON.stringify(observed)!==JSON.stringify(current))await reloadFlags();}catch{await reloadFlags();}},
  }),
 })};
}
