import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {GameplayBundle,GameplayRuleset} from '@aetheria/contracts';
import {GameplayConfigStore,type GameplayVersion} from '../infrastructure/version-store';
import type {GameplayBundleValidator} from '../infrastructure/engine-validator';

export type GameplayInstallation=Readonly<{created:boolean;version:number;digest:string;engineCapability:string}>;
const installSeal=(purpose:string,value:unknown)=>createHash('sha256').update('gameplay-config-install:v1:'+purpose+':'+JSON.stringify(value)).digest('hex');

// Explicit, idempotent installation of a reviewed seed bundle. The bundle is
// engine-validated before it becomes a draft; publication reuses the same
// lifecycle and audit journal as operator publication. Re-running with an
// already-active digest is a no-op.
export async function installGameplayConfig(
 pool:Pool,ruleset:GameplayRuleset,bundle:GameplayBundle,validator:GameplayBundleValidator,actor='system:installation',
):Promise<GameplayInstallation>{
 const verdict=await validator.validate(ruleset,bundle);
 const store=new GameplayConfigStore(),client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query("SET LOCAL lock_timeout='5000ms'");
  await client.query('SELECT pg_advisory_xact_lock(86732419)');
  const active=await store.active(client,ruleset,true);
  let current:GameplayVersion|undefined;
  if(active)current=await store.read(client,ruleset,active.version);
  if(current&&current.contentDigest===verdict.digest&&current.engineCapability===verdict.engineCapability){
   await client.query('COMMIT');
   return Object.freeze({created:false,version:current.version,digest:verdict.digest,engineCapability:verdict.engineCapability});
  }
  const version=await store.nextVersion(client,ruleset);
  const request=installSeal('gameplay-config-request',{actor,action:'seed',ruleset,version,digest:verdict.digest});
  const created=await store.insertDraft(client,{ruleset,version,parentVersion:active?.version??null,bundle,actor});
  await store.appendEvent(client,{ruleset,version,action:'seed',actor,fingerprint:request,fromState:null,toState:'DRAFT',detail:{digest:verdict.digest},seal:installSeal});
  const validated=await store.markValidated(client,{ruleset,version,expectedRevision:created.revision,digest:verdict.digest,engineCapability:verdict.engineCapability,actor});
  if(!validated)throw new Error('Installation draft could not be validated');
  await store.appendEvent(client,{ruleset,version,action:'validate',actor,fingerprint:installSeal('gameplay-config-validate',{actor,version,digest:verdict.digest}),fromState:'DRAFT',toState:'VALIDATED',detail:{digest:verdict.digest},seal:installSeal});
  if(active)await store.supersede(client,{ruleset,version:active.version,actor});
  const released=await store.markPublished(client,{ruleset,version,expectedRevision:validated.revision,actor});
  if(!released)throw new Error('Installation draft could not be published');
  const activeRevision=await store.setActive(client,{ruleset,version,expectedRevision:active?.revision??null,actor});
  if(activeRevision===undefined)throw new Error('Installation could not select the active configuration');
  await store.appendEvent(client,{ruleset,version,action:'publish',actor,fingerprint:installSeal('gameplay-config-publish',{actor,version,digest:verdict.digest}),fromState:'VALIDATED',toState:'PUBLISHED',detail:{digest:verdict.digest,activeRevision},seal:installSeal});
  await client.query('COMMIT');
  return Object.freeze({created:true,version,digest:verdict.digest,engineCapability:verdict.engineCapability});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
