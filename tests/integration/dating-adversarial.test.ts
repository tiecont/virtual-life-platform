import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,type Me } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { testDatingEligibility } from '../../apps/platform-api/src/dating/profiles';
import { requestLog } from '../../apps/platform-api/src/common/request-log';

const origin='http://127.0.0.1:3300',password='synthetic-adversarial-password-123!';
let admin:Pool,serial=0;
const runtimes:Awaited<ReturnType<typeof open>>[]=[],sockets=new Set<Socket>();
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');
 admin=new Pool({connectionString:url.toString()});
});
afterEach(async()=>{
 for(const socket of sockets)socket.close();sockets.clear();
 for(const r of runtimes.splice(0)){await r.app.app.close();await r.pool.end();await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);}
});
afterAll(async()=>{await admin.end();});
async function open(){
 const schema='private_adversarial_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
 const pool=new Pool({connectionString:url.toString()});await migrate(pool);
 const now=Date.parse('2026-11-04T12:00:00Z'),proofs=new Map<string,unknown>();
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-adversarial-secret-'.repeat(3),LOCAL_DATING_PROTOTYPE:'1',DATING_TEST_PROOFS:'1',DATING_PROFILE_KEY:'57'.repeat(32),SAFETY_EVIDENCE_KEY:'68'.repeat(32)});
 const app=await createApp(config,pool,false,{
  now:()=>now,dating:{eligibility:{read:(db,account)=>proofs.has(account)?Promise.resolve(proofs.get(account)):testDatingEligibility.read(db,account)}},
  socialPresence:{visibleActivity:async()=>({worldSlug:'dating'})},
  worlds:{modules:[defineWorld({schemaVersion:1,apiVersion:1,slug:'dating',version:'1.0.0',title:'Synthetic forbidden generic adult room',kind:'sandbox',sceneRef:{key:'adversarial-date',version:'1.0.0'},capacity:2,capabilities:['presence'],accessPolicy:{kind:'restricted',policyKey:'adversarial.fixture',requiresAdult:true},visibility:'hidden',map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'}},{bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{}})],policy:{permits:async()=>true},adultProof:{hasReviewedProof:async()=>true}},
 });
 await app.worlds.registry.setEnabled('dating',true);await app.app.listen(0,'127.0.0.1');
 const r={schema,pool,app,proofs,now,url:await app.app.getUrl()};runtimes.push(r);return r;
}
type Runtime=Awaited<ReturnType<typeof open>>;
type User={me:Me;cookie:string;loginName:string};
const headers=(u:User,key=randomUUID())=>({origin,cookie:u.cookie,'x-csrf-token':u.me.csrfToken,'idempotency-key':key});
const read=(r:Runtime,u:User,path:string)=>r.app.http.inject({url:'/v1/'+path,headers:{cookie:u.cookie}});
const post=(r:Runtime,u:User,path:string,payload:unknown,key=randomUUID())=>r.app.http.inject({method:'POST',url:'/v1/'+path,headers:headers(u,key),payload});
async function user(r:Runtime,alias='willow'){
 const n=++serial,response=await r.app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:`127.93.${Math.floor(n/250)}.${n%250+1}`,headers:{origin},payload:{requestId:randomUUID(),displayName:'City adversarial fixture',avatarKey:'mint'}});
 expect(response.statusCode).toBe(201);
 const u={me:MeSchema.parse(response.json()),cookie:String(response.headers['set-cookie']).split(';')[0],loginName:'adversarial_'+randomUUID().replaceAll('-','').slice(0,12)};
 const upgraded=await post(r,u,'session/upgrade',{loginName:u.loginName,password});expect(upgraded.statusCode).toBe(200);
 u.me=MeSchema.parse(upgraded.json());u.cookie=String(upgraded.headers['set-cookie']).split(';')[0];
 await r.pool.query('INSERT INTO restricted_dating_test_eligibility VALUES($1,$2,$3,false)',[u.me.profile.id,new Date(r.now-1000),new Date(r.now+3600000)]);
 const v=(await read(r,u,'dating/profile')).json();
 expect((await post(r,u,'dating/profile',{schemaVersion:1,expectedRevision:v.revision,writeGrant:v.writeGrant.value,consent:true,aliasKey:alias,topics:['books'],preferredTopics:['books'],pace:'either'})).statusCode).toBe(200);
 return u;
}
async function connect(r:Runtime,u:User){
 const n=++serial,socket=io(r.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:`127.94.${Math.floor(n/250)}.${n%250+1}`}},extraHeaders:{origin,cookie:u.cookie},auth:{schemaVersion:1,csrfToken:u.me.csrfToken}});sockets.add(socket);
 await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});return socket;
}
async function mutual(r:Runtime){
 const a=await user(r),b=await user(r,'maple');
 for(const u of [a,b]){const v=(await read(r,u,'dating/matching')).json();expect((await post(r,u,'dating/queue',{schemaVersion:1,expectedRevision:v.revision,joinGrant:v.joinGrant.value,consent:true})).statusCode).toBe(200);}
 const id=(await read(r,a,'dating/matching')).json().proposal.id;
 for(const [u,version] of [[a,0],[b,1]]as const)expect((await post(r,u,`dating/proposals/${id}/accept`,{schemaVersion:1,expectedVersion:version,consent:true})).statusCode).toBe(200);
 const socketA=await connect(r,a),socketB=await connect(r,b);
 for(const [u,version] of [[a,0],[b,1]]as const)expect((await post(r,u,`dating/dates/${id}/enter`,{schemaVersion:1,expectedVersion:version,consent:true})).statusCode).toBe(200);
 expect((await post(r,a,'dating/date/leave',{schemaVersion:1})).statusCode).toBe(200);
 const path='dating/continuations/'+id;
 for(const u of [a,b]){const v=(await read(r,u,path)).json();expect((await post(r,u,path+'/like',{schemaVersion:1,expectedRevision:v.revision,expectedVersion:v.version,likeGrant:v.likeGrant.value,consent:true})).statusCode).toBe(200);}
 return {a,b,id,path,socketA,socketB};
}

it('rejects nine malformed,underage,self-attested,mismatched and stale proof decisions on every private positive owner',async()=>{
 const r=await open(),a=await user(r),valid={source:'synthetic-test-only',accountId:a.me.profile.id,minimumAge:18,policyVersion:'1.0.0',verifiedAt:r.now-1000,expiresAt:r.now+3600000,revoked:false};
 const invalid=[null,{...valid,minimumAge:17},{...valid,source:'self-attestation'},{...valid,accountId:randomUUID()},{...valid,policyVersion:'0.9.0'},{...valid,verifiedAt:r.now+1},{...valid,expiresAt:r.now},{...valid,expiresAt:r.now+86400000},{...valid,revoked:true}];
 for(const proof of invalid){r.proofs.set(a.me.profile.id,proof);for(const path of ['dating/profile','dating/matching','dating/continuations'])expect((await read(r,a,path)).statusCode).toBe(404);}
 const forged=await r.app.http.inject({url:'/v1/dating/profile?age=18&registered=true',headers:{cookie:a.cookie,'x-reviewed-adult':'true'}});expect(forged.statusCode).toBe(422);
 expect((await r.pool.query('SELECT count(*)::int AS n FROM restricted_dating_enrollments')).rows[0].n).toBe(0);
 expect((await post(r,a,'dating/profile/withdraw',{schemaVersion:1})).statusCode).toBe(200);
});

it('denied proof cannot enter via HTTPdirectory,forged socketroom,travelintent or arbitrary travel redemption even when generic adult permission is true',async()=>{
 const r=await open(),a=await user(r);r.proofs.set(a.me.profile.id,null);
 expect((await read(r,a,'worlds/dating/rooms')).statusCode).toBe(404);
 const socket=await connect(r,a),base={schemaVersion:1,requestId:randomUUID(),worldSlug:'dating',worldVersion:'1.0.0',sceneVersion:'1.0.0'};
 const forged=await socket.timeout(5000).emitWithAck('room.join',{...base,age:18,reviewedAdult:true});expect(forged.ok).toBe(false);expect(forged.error.code).toBe('INVALID_REQUEST');
 const direct=await socket.timeout(5000).emitWithAck('room.join',base);expect(direct.ok).toBe(false);expect(direct.error.code).toBe('NOT_FOUND');
 expect((await post(r,a,'travel-intents',{schemaVersion:1,source:null,destination:{worldSlug:'dating',worldVersion:'1.0.0',sceneVersion:'1.0.0'}})).statusCode).toBe(404);
 const travel=await socket.timeout(5000).emitWithAck('travel.request',{schemaVersion:1,requestId:randomUUID(),intentId:randomUUID(),capability:'a'.repeat(64)});expect(travel.ok).toBe(false);
 expect(r.app.rooms.diagnostics().memberships).toBe(0);expect((await read(r,a,'me/room')).json().snapshot).toBeNull();
 expect(JSON.stringify((await read(r,a,'worlds')).json())).not.toContain('dating');
});

it('a known source handle grants outsiders no observation,choice,queue,report attribution or global profile lookup',async()=>{
 const r=await open(),s=await mutual(r),outsider=await user(r,'bluejay'),random=randomUUID();
 const errors=[];
 for(const id of [s.id,random]){
  const response=await read(r,outsider,'dating/continuations/'+id);expect(response.statusCode).toBe(404);const e=response.json().error;errors.push({code:e.code,message:e.message});
  expect((await post(r,outsider,'dating/continuations/'+id+'/revoke',{schemaVersion:1})).statusCode).toBe(404);
  expect((await post(r,outsider,'reports',{schemaVersion:1,category:'consent-violation',note:'',source:{kind:'private-date',dateId:id}})).statusCode).toBe(404);
 }
 expect(errors[0]).toEqual(errors[1]);
 const stolen=(await read(r,s.a,s.path)).json();
 expect((await post(r,outsider,s.path+'/queue',{schemaVersion:1,expectedRevision:stolen.allocationRevision,returnGrant:stolen.returnGrant.value,consent:true})).statusCode).toBe(404);
 for(const path of ['profiles/'+s.a.me.profile.id,'dating/profiles/'+s.a.me.profile.id,'dating/dates/'+s.id])expect((await read(r,outsider,path)).statusCode).toBe(404);
 expect((await r.pool.query('SELECT count(*)::int AS n FROM safety_cases')).rows[0].n).toBe(0);expect((await read(r,s.b,s.path)).json().state).toBe('MUTUAL');
});

it('private return grants cannot migrate to another current session of the same account and logout invalidates original positive requests',async()=>{
 const r=await open(),s=await mutual(r),v=(await read(r,s.a,s.path)).json(),body={schemaVersion:1,expectedRevision:v.allocationRevision,returnGrant:v.returnGrant.value,consent:true};
 const login=await r.app.http.inject({method:'POST',url:'/v1/session/login',headers:{origin},payload:{requestId:randomUUID(),loginName:s.a.loginName,password}});expect(login.statusCode).toBe(200);
 const other={me:MeSchema.parse(login.json()),cookie:String(login.headers['set-cookie']).split(';')[0],loginName:s.a.loginName};
 expect((await post(r,other,s.path+'/queue',body)).statusCode).toBe(409);expect((await r.pool.query('SELECT count(*)::int AS n FROM restricted_dating_enrollments')).rows[0].n).toBe(0);
 expect((await post(r,s.a,'session/logout',{})).statusCode).toBe(200);
 for(const path of ['dating/profile','dating/matching','dating/continuations',s.path])expect((await read(r,s.a,path)).statusCode).toBe(401);
 expect((await post(r,s.a,s.path+'/queue',body)).statusCode).toBe(401);
 const current=(await read(r,other,s.path)).json();expect(current.state).toBe('MUTUAL');
 expect((await post(r,other,s.path+'/queue',{schemaVersion:1,expectedRevision:current.allocationRevision,returnGrant:current.returnGrant.value,consent:true})).statusCode).toBe(200);
 expect((await r.pool.query('SELECT count(*)::int AS n FROM restricted_dating_enrollments')).rows[0].n).toBe(1);
});

it('even an existing friend cannot discover private alias,source or dating activity through shared projections and request logging',async()=>{
 const r=await open(),s=await mutual(r),friend=await user(r,'bluejay');
 expect((await r.app.http.inject({method:'PATCH',url:'/v1/social/me',headers:headers(s.a),payload:{requestPolicy:'code'}})).statusCode).toBe(200);
 const code=(await read(r,s.a,'social/me')).json().contactCode,requested=await post(r,friend,'friends/requests',{contactCode:code});expect(requested.statusCode).toBe(200);
 expect((await post(r,s.a,'friends/requests/'+requested.json().id+'/respond',{action:'accept'})).statusCode).toBe(200);
 const forbidden=new RegExp(s.id+'|maple|willow|aliasKey|preferredTopics|returnGrant|continuation_id');
 for(const path of ['friends','friends/requests','worlds','discovery','me/room']){const response=await read(r,friend,path);expect(response.statusCode).toBe(200);expect(response.body).not.toMatch(forbidden);}
 const friends=(await read(r,friend,'friends')).json();expect(friends.items).toHaveLength(1);expect(friends.items[0].activity).toBeNull();
 const observed:string[]=[];const socket=await connect(r,friend);socket.onAny(event=>observed.push(event));
 expect((await post(r,s.a,'dating/continuation/revoke',{schemaVersion:1})).statusCode).toBe(200);
 const barrier=await socket.timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()});expect(barrier.ok).toBe(true);
 expect(observed).not.toContain('friendship.changed');expect(observed.some(name=>/dating|match|continuation/.test(name))).toBe(false);
 for(const path of ['dating/continuations/'+s.id+'/queue?grant=private-secret','dating/dates/'+s.id+'/chat','dating/profile'])expect(requestLog({method:'POST',url:'/v1/'+path})).toEqual({method:'POST',path:'/v1/[private]'});
});

it('an account-scoped current world ban cannot be evaded by another login or a previously known mutual source while independent revoke remains available',async()=>{
 const r=await open(),s=await mutual(r),v=(await read(r,s.a,s.path)).json(),caseId=randomUUID();
 // Trusted persisted synthetic case/sanction fixtures,not staff provisioning or
 // a finding about the fixture participant. No real-world identities exist.
 await r.pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,'dating','harassment','medium',$7)",[caseId,randomUUID(),s.b.me.profile.id,s.a.me.profile.id,randomUUID(),'d'.repeat(64),new Date(r.now)]);
 await r.pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','dating',$4,$5,$5)",[randomUUID(),caseId,s.a.me.profile.id,new Date(r.now),new Date(r.now+60000)]);
 const login=await r.app.http.inject({method:'POST',url:'/v1/session/login',headers:{origin},payload:{requestId:randomUUID(),loginName:s.a.loginName,password}});expect(login.statusCode).toBe(200);
 const other={me:MeSchema.parse(login.json()),cookie:String(login.headers['set-cookie']).split(';')[0],loginName:s.a.loginName};
 for(const actor of [s.a,other])for(const path of ['dating/profile','dating/matching','dating/continuations',s.path])expect((await read(r,actor,path)).statusCode).toBe(404);
 expect((await post(r,s.a,s.path+'/queue',{schemaVersion:1,expectedRevision:v.allocationRevision,returnGrant:v.returnGrant.value,consent:true})).statusCode).toBe(404);
 const peer=(await read(r,s.b,s.path)).json();expect(peer.state).toBe('UNAVAILABLE');expect(peer.peer).toBeNull();expect(peer.returnGrant).toBeNull();
 expect((await post(r,other,'dating/continuation/revoke',{schemaVersion:1})).statusCode).toBe(200);
 expect((await r.pool.query('SELECT count(*)::int AS n FROM restricted_dating_continuation_members')).rows[0].n).toBe(0);
});
