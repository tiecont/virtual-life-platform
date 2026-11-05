import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,ChatAckSchema,ChatMessageSchema,type ChatMessage,type RoomSnapshot,type ChatSend } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { parkWorldVersion } from '@virtual-city/park-world';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';
import { migrate } from '../../apps/platform-api/src/db/migrations';
const origin='http://127.0.0.1:3300',schema='park_quick_'+randomUUID().replaceAll('-',''),sockets=new Set<Socket>();let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string,serial=0,inspections=0;
beforeAll(async()=>{const address=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(address.hostname)||!/^virtual_city_test(?:_|$)/.test(address.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:address.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);address.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);
 // Synthetic scope control,not actual Maid integration. Its policy would permit chat if globally enabled.
 const control=defineWorld({schemaVersion:1,apiVersion:1,slug:'maid',version:'1.0.0',title:'Synthetic chat scope control',kind:'sandbox',sceneRef:{key:'maid',version:'1.0.0'},capacity:2,capabilities:['presence','chat'],accessPolicy:{kind:'public'},visibility:'listed',map:{region:'sandbox',position:{x:0,y:0},icon:'flask'}},{bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{}});
 app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:'park-quick-fixture-secret-'.repeat(2),LOCAL_PARK_WORLD:'1'}),pool,false,{worlds:{modules:[control]},safety:{moderator:{inspect:async()=>{inspections++;return {decision:'allow'};}}}});await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();});
afterEach(async()=>{for(const socket of sockets)socket.close();sockets.clear();for(const slug of ['park','maid'])await app.worlds.registry.setEnabled(slug,false);await app.rooms.maintain();inspections=0;});
afterAll(async()=>{await app?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function guest(){const n=++serial,address=`127.106.${Math.floor(n/250)}.${n%250+1}`,r=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:address,headers:{origin},payload:{requestId:randomUUID(),displayName:'Quick park visitor',avatarKey:'mint'}});expect(r.statusCode).toBe(201);const user={me:MeSchema.parse(r.json()),cookie:String(r.headers['set-cookie']).split(';')[0],address};return {...user,socket:await connect(user)};}
async function connect(u:{me:{csrfToken:string};cookie:string;address:string}){const socket=io(url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:u.address}},extraHeaders:{origin,cookie:u.cookie},auth:{schemaVersion:1,csrfToken:u.me.csrfToken}});sockets.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});return socket;}
type User=Awaited<ReturnType<typeof guest>>;
const headers=(u:User)=>({origin,cookie:u.cookie,'x-csrf-token':u.me.csrfToken,'idempotency-key':randomUUID()});
const own=(s:RoomSnapshot)=>({schemaVersion:1 as const,requestId:randomUUID(),epoch:s.epoch,roomId:s.roomId,membershipId:s.membershipId});
const input=(s:RoomSnapshot,content:ChatSend['content'])=>({...own(s),content});
const chat=async(socket:Socket,body:unknown)=>ChatAckSchema.parse(await socket.timeout(5000).emitWithAck('chat.send',body));
const joinBody=(slug='park',roomId?:string)=>({schemaVersion:1,requestId:randomUUID(),worldSlug:slug,worldVersion:slug==='park'?parkWorldVersion:'1.0.0',sceneVersion:'1.0.0',...(roomId?{roomId}:{})});
async function enter(socket:Socket,slug='park',roomId?:string){const ack=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join',joinBody(slug,roomId)));expect(ack.ok).toBe(true);if(!ack.ok||ack.result.type!=='snapshot')throw Error('Expected fixture admission');return ack.result;}
async function visible(u:User){expect((await app.http.inject({method:'PATCH',url:'/v1/me/privacy',headers:headers(u),payload:{presence:'hidden',analyticsConsent:false,worldVisibility:{park:'public',dating:'hidden'}}})).statusCode).toBe(200);}
function messages(socket:Socket){const rows:ChatMessage[]=[];socket.on('chat.message',body=>rows.push(ChatMessageSchema.parse(body)));return rows;}
async function flush(socket:Socket,s:RoomSnapshot){expect(RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.snapshot',own(s))).ok).toBe(true);}
it('approved quick IDs use centralized policy/current visibility and canonical retries without enabling client text or classifier calls',async()=>{
 await app.worlds.registry.setEnabled('park',true);const a=await guest(),b=await guest();await visible(a);const sa=await enter(a.socket),sb=await enter(b.socket,'park',sa.roomId),received=messages(b.socket),body=input(sa,{kind:'canned',id:'hello'});
 const first=await chat(a.socket,body);expect(first.ok).toBe(true);await expect.poll(()=>received.length).toBe(1);expect(received[0].content).toEqual({kind:'canned',id:'hello',text:'Xin chào!'});expect(received[0].sender.id===a.me.profile.id).toBe(true);
 const retry=await chat(a.socket,body);expect(retry.ok&&first.ok&&retry.result.messageId===first.result.messageId).toBe(true);await flush(b.socket,sb);expect(received).toHaveLength(1);
 const text=await chat(a.socket,input(sa,{kind:'text',text:'Never deliver client-selected free text'}));expect(text.ok).toBe(false);if(!text.ok)expect(text.error.code).toBe('FORBIDDEN');
 expect((await chat(a.socket,input(sa,{kind:'emote',id:'wave'}))).ok).toBe(true);await expect.poll(()=>received.length).toBe(2);expect(inspections).toBe(0);expect(JSON.stringify(received)).not.toMatch(/csrfToken|membershipId|contactCode|loginName/);
});
it('twenty actual socket contenders beside a seed cannot exceed the twelve-place park or create extra rooms',async()=>{
 await app.worlds.registry.setEnabled('park',true);const seed=await guest(),s=await enter(seed.socket),peers=await Promise.all(Array.from({length:20},()=>guest())),answers=await Promise.all(peers.map(p=>p.socket.timeout(5000).emitWithAck('room.join',joinBody('park',s.roomId))).map(p=>p.then(v=>RoomAckSchema.parse(v))));
 expect(answers.filter(a=>a.ok)).toHaveLength(11);expect(answers.filter(a=>!a.ok&&a.error.code==='ROOM_FULL')).toHaveLength(9);const directory=await app.http.inject({url:'/v1/worlds/park/rooms',headers:{cookie:seed.cookie}});expect(directory.json().rooms).toEqual([{roomId:s.roomId,capacity:12,occupancy:12}]);
});
it('account quick-message budget spans two real sockets and rejects the seventh fresh command without a formal sanction',async()=>{
 await app.worlds.registry.setEnabled('park',true);const u=await guest(),s=await enter(u.socket),second=await connect(u);await enter(second,'park',s.roomId);
 for(let n=0;n<6;n++)expect((await chat(n%2?second:u.socket,input(s,{kind:'emote',id:'nod'}))).ok).toBe(true);
 const limited=await chat(second,input(s,{kind:'canned',id:'thanks'}));expect(limited.ok).toBe(false);if(!limited.ok)expect(limited.error.code).toBe('RATE_LIMITED');expect((await pool.query('SELECT count(*)::int AS n FROM safety_sanctions')).rows[0].n).toBe(0);expect(u.socket.connected&&second.connected).toBe(true);
});
it('local Park quick scope cannot turn on an otherwise eligible synthetic other-world chat channel',async()=>{
 await app.worlds.registry.setEnabled('maid',true);const u=await guest(),s=await enter(u.socket,'maid');expect(app.chat.diagnostics().enabled).toBe(true);
 for(const content of [{kind:'canned',id:'hello'},{kind:'text',text:'Synthetic scope isolation control'}] as ChatSend['content'][]){const ack=await chat(u.socket,input(s,content));expect(ack.ok).toBe(false);if(!ack.ok)expect(ack.error.code).toBe('FORBIDDEN');}expect(inspections).toBe(0);
});
it('block,hidden visibility,foreign membership and ended context prevent subsequent peer delivery',async()=>{
 await app.worlds.registry.setEnabled('park',true);const a=await guest(),b=await guest(),sa=await enter(a.socket),sb=await enter(b.socket,'park',sa.roomId),received=messages(b.socket);
 expect((await chat(a.socket,input(sa,{kind:'emote',id:'wave'}))).ok).toBe(true);await flush(b.socket,sb);expect(received).toEqual([]);await visible(a);
 expect((await chat(a.socket,input(sa,{kind:'canned',id:'hello'}))).ok).toBe(true);await expect.poll(()=>received.length).toBe(1);
 expect((await app.http.inject({method:'POST',url:'/v1/blocks',headers:headers(b),payload:{targetId:a.me.profile.id,blocked:true}})).statusCode).toBe(200);
 expect((await chat(a.socket,input(sa,{kind:'emote',id:'smile'}))).ok).toBe(true);await flush(b.socket,sb);expect(received).toHaveLength(1);expect((await chat(b.socket,input(sa,{kind:'emote',id:'wave'}))).ok).toBe(false);
 await app.worlds.registry.setEnabled('park',false);const ended=await chat(a.socket,input(sa,{kind:'canned',id:'bye'}));expect(ended.ok).toBe(false);
});
