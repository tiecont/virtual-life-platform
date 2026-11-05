import { beforeAll,afterAll,beforeEach,afterEach,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { performance } from 'node:perf_hooks';
import { mkdir,writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,type Me,type RoomSnapshot } from '@virtual-city/contracts';
import { migrate } from '../../apps/platform-api/src/db/migrations';
import { startRoomProcess } from '../support/room-process';
let admin:Pool,pool:Pool,schema:string,runtime:Awaited<ReturnType<typeof startRoomProcess>>|undefined,serial=0;
const origin='http://127.0.0.1:3300',sockets=new Set<Socket>(),facts:Record<string,unknown>[]=[];
let cleanup=async()=>{};
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{cleanup=async()=>{};schema='room_race_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);runtime=await startRoomProcess(url.toString(),'synthetic-network-race-session-secret-00001',0,'race');});
afterEach(async()=>{try{await cleanup();}finally{for(const socket of sockets)socket.close();sockets.clear();if(runtime){await runtime.stop();expect(runtime.child.exitCode).toBe(0);runtime=undefined;}await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);}});
afterAll(async()=>{await admin.end();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/m22-room-network-races.json',JSON.stringify({scope:'Actual loopback HTTP+Socket.IO clients,separate API process,unchanged limits;not a capacity benchmark',facts},null,2)+'\n');});
type User={me:Me;cookie:string;address:string};
async function guest():Promise<User>{
 const n=++serial,address=`127.102.${Math.floor(n/250)}.${n%250+1}`,body=JSON.stringify({requestId:randomUUID(),displayName:'Network test visitor',avatarKey:'mint'});
 return new Promise((ok,no)=>{const req=request(runtime!.url+'/v1/session/guest',{method:'POST',localAddress:address,headers:{origin,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>{try{if(res.statusCode!==201)throw Error('Unexpected HTTP status');const cookie=res.headers['set-cookie']?.[0]?.split(';')[0];if(!cookie)throw Error('Missing synthetic session');ok({me:MeSchema.parse(JSON.parse(raw)),cookie,address});}catch{no(Error('Synthetic guest bootstrap rejected (HTTP '+res.statusCode+')'));}});});req.setTimeout(5000,()=>req.destroy(Error('Synthetic guest timeout')));req.once('error',no);req.end(body);});
}
async function connect(user:User){const socket=io(runtime!.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:user.address}},extraHeaders:{origin,cookie:user.cookie},auth:{schemaVersion:1,csrfToken:user.me.csrfToken}});sockets.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',()=>no(Error('Actual socket handshake rejected')));socket.connect();});return socket;}
const command=async(socket:Socket,name:string,body:unknown)=>{try{return RoomAckSchema.parse(await socket.timeout(5000).emitWithAck(name,body));}catch{throw Error('Actual socket command did not complete: '+name);}};
const join=(socket:Socket,slug:string,roomId?:string)=>command(socket,'room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:slug,worldVersion:'1.0.0',sceneVersion:'1.0.0',...(roomId?{roomId}:{})});
const own=(snapshot:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),epoch:snapshot.epoch,roomId:snapshot.roomId,membershipId:snapshot.membershipId});
async function sample(){const child=runtime!.child,id=randomUUID();return new Promise<{sockets:number;transportConnections:number;rooms:{rooms:number;memberships:number;connections:number;occupiedSeats:number}}>((ok,no)=>{const timer=setTimeout(()=>{child.off('message',read);no(Error('Child diagnostics timeout'));},5000);function read(message:unknown){if(!message||typeof message!=='object'||!('type'in message)||message.type!=='sample'||!('id'in message)||message.id!==id||!('diagnostics'in message))return;clearTimeout(timer);child.off('message',read);ok(message.diagnostics as Awaited<ReturnType<typeof sample>>);}child.on('message',read);child.send({type:'sample',id});});}
async function actors(count:number){const users=await Promise.all(Array.from({length:count},()=>guest()));return Promise.all(users.map(user=>connect(user)));}
async function leaveAndClose(visits:{socket:Socket;snapshot:RoomSnapshot}[]){
 // Cleanup is not the admission/seat race. A100-way departure broadcast burst
 // exceeded the unchanged5s command deadline in the consolidated suite.
 // Stage cleanup like admission setup;the actual100-way contention is unchanged.
 for(let start=0;start<visits.length;start+=10){const results=await Promise.all(visits.slice(start,start+10).map(v=>command(v.socket,'room.leave',own(v.snapshot))));expect(results.every(ack=>ack.ok)).toBe(true);}
 for(const socket of sockets)socket.close();await expect.poll(async()=>{const d=await sample();return d.sockets+d.transportConnections+d.rooms.memberships+d.rooms.occupiedSeats;}).toBe(0);sockets.clear();
}

it('100 actual socket admissions to one cap8 room admit7 beside the seed and reject93 without extra rooms',async()=>{
 const seed=await connect(await guest()),initial=await join(seed,'race-capacity');if(!initial.ok||initial.result.type!=='snapshot')throw Error('Seed visit failed');const peers=await actors(100);expect((await sample()).sockets).toBe(101);const at=performance.now(),results=await Promise.all(peers.map(socket=>join(socket,'race-capacity',initial.result.roomId))),success=results.filter(ack=>ack.ok),rejected=results.filter(ack=>!ack.ok);
 expect(success).toHaveLength(7);expect(rejected).toHaveLength(93);expect(rejected.every(ack=>!ack.ok&&ack.error.code==='ROOM_FULL')).toBe(true);expect((await sample()).rooms).toMatchObject({rooms:1,memberships:8,connections:8});
 const burstMs=performance.now()-at,visits=[{socket:seed,snapshot:initial.result}];for(let n=0;n<results.length;n++){const ack=results[n];if(ack.ok&&ack.result.type==='snapshot')visits.push({socket:peers[n],snapshot:ack.result});}cleanup=async()=>{await leaveAndClose(visits);facts.push({scenario:'room-capacity',actualSockets:101,simultaneousAttempts:100,admitted:7,roomFull:93,roomCapacity:8,extraRooms:0,burstMs,cleanupConnections:0});};
});
it('100 actual socket members claim one seat with one winner99SeatTaken and no phantom allocation',async()=>{
 const peers=await actors(100),first=await join(peers[0],'race-seats');if(!first.ok||first.result.type!=='snapshot')throw Error('Seat-room seed failed');const visits=[{socket:peers[0],snapshot:first.result}];
 // Admission is setup,not the seat race: a99-request admission burst exceeded5s in the consolidated run.
 // Keep all physical limits/deadlines;the actual100way seat claim below remains simultaneous.
 for(let start=1;start<peers.length;start+=10){const batch=peers.slice(start,start+10),joined=await Promise.all(batch.map(socket=>join(socket,'race-seats',first.result.roomId)));for(let n=0;n<joined.length;n++){const ack=joined[n];if(!ack.ok||ack.result.type!=='snapshot')throw Error('Actual member admission failed');visits.push({socket:batch[n],snapshot:ack.result});}}
 expect((await sample()).rooms).toMatchObject({rooms:1,memberships:100,connections:100});const at=performance.now(),claims=await Promise.all(visits.map(v=>command(v.socket,'seat.claim',{...own(v.snapshot),seatId:'shared-seat'})));
 const burstMs=performance.now()-at;expect(claims.filter(ack=>ack.ok)).toHaveLength(1);expect(claims.filter(ack=>!ack.ok&&ack.error.code==='SEAT_TAKEN')).toHaveLength(99);const winner=visits[claims.findIndex(ack=>ack.ok)],snapshot=await command(winner.socket,'room.snapshot',own(winner.snapshot));expect(snapshot.ok&&snapshot.result.type==='snapshot'&&snapshot.result.occupancy===100&&snapshot.result.seats.filter(seat=>seat.state==='occupied').length===1&&snapshot.result.self.seatId==='shared-seat').toBe(true);expect((await sample()).rooms.occupiedSeats).toBe(1);cleanup=async()=>{await leaveAndClose(visits);facts.push({scenario:'seat-contention',actualSockets:100,admissionSetupBatch:10,simultaneousClaims:100,winners:1,seatTaken:99,occupiedSeats:1,burstMs,cleanupConnections:0});};
});
