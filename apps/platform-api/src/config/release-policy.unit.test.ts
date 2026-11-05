import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {evaluateReleasePolicy,assertRuntimeTransition} from './release-policy';

type MutableRelease={schemaVersion:number;version:number;environment:string;worlds:Record<string,{install:boolean;entitled:boolean;worldVersion:string}>;capabilities:Record<string,boolean>;operator:{maxPrincipals:number;authentication:string;subjectRef:string|null};approvals:Record<string,string|null>};
const closed=()=>JSON.parse(readFileSync('config/release-policy.json','utf8')) as MutableRelease;
const runtime=(environment='production')=>({schemaVersion:1,version:1,releaseVersion:1,environment,maintenance:false,quickInteractions:false,worlds:{deadline:false,maid:false,library:false,restaurant:false,park:false,lounge:false,dating:false} as Record<string,boolean>});
function permitted(environment='production'){
 const release=closed();release.environment=environment;release.worlds.deadline.install=true;release.worlds.deadline.entitled=true;release.capabilities.confidentialReports=true;
 release.operator.subjectRef='secret:synthetic-operator';for(const key of Object.keys(release.approvals))release.approvals[key]='evidence:synthetic-fixture';
 const state=runtime(environment);state.worlds.deadline=true;return {release,state};
}
it('default policy remains closed with one unprovisioned human operator requirement',()=>{
 const release=closed(),result=evaluateReleasePolicy(release,runtime(),'production');expect(result.enabledWorlds).toEqual([]);expect(release.operator).toEqual({maxPrincipals:1,authentication:'passkey-mfa',subjectRef:null});expect(Object.values(release.approvals).every(value=>value===null)).toBe(true);
});
it.each(['development','test','staging','production'] as const)('evaluates explicitly entitled worlds in %s without inventing release approval',environment=>{
 const {release,state}=permitted(environment);expect(evaluateReleasePolicy(release,state,environment).enabledWorlds).toEqual(['deadline']);
 state.maintenance=true;expect(evaluateReleasePolicy(release,state,environment).enabledWorlds).toEqual([]);
});
it('missing, unknown-version, unknown-world and mismatched-environment policy inputs deny',()=>{
 const {release,state}=permitted();
 const mutations:((r:MutableRelease)=>void)[]=[r=>{r.schemaVersion=2;},r=>{r.worlds.unknown={install:true,entitled:true,worldVersion:'1.0.0'};},r=>{r.environment='staging';}];
 for(const change of mutations){const copy=globalThis.structuredClone(release);change(copy);expect(()=>evaluateReleasePolicy(copy,state,'production')).toThrow();}
 expect(()=>evaluateReleasePolicy(undefined,state,'production')).toThrow();expect(()=>evaluateReleasePolicy(release,undefined,'production')).toThrow();expect(()=>evaluateReleasePolicy(release,{...state,releaseVersion:2},'production')).toThrow();
});
it('runtime switches never install or grant worlds, quick interactions or unsupported UGC',()=>{
 const {release,state}=permitted();
 const switches:((s:ReturnType<typeof runtime>)=>void)[]=[s=>{s.worlds.maid=true;},s=>{s.quickInteractions=true;},s=>{s.worlds.unknown=true;}];
 for(const change of switches){const copy=globalThis.structuredClone(state);change(copy);expect(()=>evaluateReleasePolicy(release,copy,'production')).toThrow();}
 const mutations:((r:MutableRelease)=>void)[]=[r=>{r.worlds.deadline.install=false;},r=>{r.worlds.deadline.entitled=false;},r=>{r.worlds.dating.install=true;},r=>{r.worlds.lounge.entitled=true;},r=>{r.capabilities.textChat=true;},r=>{r.capabilities.confidentialReports=false;}];
 for(const change of mutations){const copy=globalThis.structuredClone(release);change(copy);expect(()=>evaluateReleasePolicy(copy,state,'production')).toThrow();}
});
it('production entitlement needs explicit review references and one operator secret reference',()=>{
 const {release,state}=permitted();for(const key of Object.keys(release.approvals)){const copy=globalThis.structuredClone(release);copy.approvals[key]=null;expect(()=>evaluateReleasePolicy(copy,state,'production')).toThrow();}
 const copy=globalThis.structuredClone(release);copy.operator.subjectRef=null;expect(()=>evaluateReleasePolicy(copy,state,'production')).toThrow();copy.operator.maxPrincipals=6;expect(()=>evaluateReleasePolicy(copy,state,'production')).toThrow();
});
it('a confidential capability cannot bypass safety/operator review merely because all worlds are closed',()=>{
 const release=closed();release.capabilities.confidentialReports=true;expect(()=>evaluateReleasePolicy(release,runtime(),'production')).toThrow();release.capabilities.confidentialReports=false;release.capabilities.quickInteractions=true;expect(()=>evaluateReleasePolicy(release,runtime(),'production')).toThrow();
});
it('runtime versions are monotonic; identical replay is allowed and same-version payload replacement is denied',()=>{
 const {release,state}=permitted(),first=evaluateReleasePolicy(release,state,'production');expect(()=>assertRuntimeTransition(first.runtime,first.runtime)).not.toThrow();
 const next={...first.runtime,version:2,maintenance:true};expect(()=>assertRuntimeTransition(first.runtime,next)).not.toThrow();expect(()=>assertRuntimeTransition(next,first.runtime)).toThrow();expect(()=>assertRuntimeTransition(first.runtime,{...first.runtime,maintenance:true})).toThrow();
});
