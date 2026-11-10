import { beforeAll,afterAll,beforeEach,afterEach,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Pool } from 'pg';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,SessionCheckAckSchema,type Me,type RoomSnapshot } from '@virtual-city/contracts';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
import { startRoomProcess } from '../support/room-process';

const origin='http://127.0.0.1:3300',secret='synthetic-network-security-session-secret-0001',clients=new Set<Socket>();
let admin:Pool,pool:Pool,schema:string,databaseUrl:string,runtime:Awaited<ReturnType<typeof startRoomProcess>>|undefined,serial=0;
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{schema='security_tcp_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);databaseUrl=url.toString();pool=new Pool({connectionString:databaseUrl});await migrate(pool);runtime=await startRoomProcess(databaseUrl,secret);});
afterEach(async()=>{for(const client of clients)client.close();clients.clear();if(runtime){await runtime.stop();expect(runtime.child.exitCode).toBe(0);runtime=undefined;}await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
afterAll(async()=>{await admin.end();});
type User={me:Me;cookie:string;address:string};
function tcp(path:string,method='GET',headers:Record<string,string>={},body?:unknown,address='127.103.0.1'){
 const encoded=body===undefined?undefined:JSON.stringify(body);
 return new Promise<{status:number;headers:Record<string,string|string[]|undefined>;body:string}>((ok,no)=>{const req=request(runtime!.url+path,{method,localAddress:address,headers:{...headers,...encoded===undefined?{}:{'content-type':'application/json','content-length':String(Buffer.byteLength(encoded))}}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>ok({status:res.statusCode??0,headers:res.headers,body:raw}));});req.setTimeout(5000,()=>req.destroy(Error('Synthetic TCP timeout')));req.once('error',()=>no(Error('Synthetic TCP request failed')));req.end(encoded);});
}
const guestBody=()=>({requestId:randomUUID(),displayName:'Security test visitor',avatarKey:'mint'});
async function guest(address?:string):Promise<User>{const n=++serial,ip=address??`127.103.${Math.floor(n/250)+1}.${n%250+1}`,response=await tcp('/v1/session/guest','POST',{origin},guestBody(),ip);expect(response.status).toBe(201);return {me:MeSchema.parse(JSON.parse(response.body)),cookie:(response.headers['set-cookie'] as string[])[0].split(';')[0],address:ip};}
const writeHeaders=(u:User)=>({origin,cookie:u.cookie,'x-csrf-token':u.me.csrfToken,'idempotency-key':randomUUID()});
async function connect(u:User,headers:Record<string,string>={},auth:Record<string,unknown>={}){const socket=io(runtime!.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:u.address}},extraHeaders:{origin,cookie:u.cookie,...headers},auth:{schemaVersion:1,csrfToken:u.me.csrfToken,...auth}});clients.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',()=>{socket.close();no(Error('Synthetic handshake denied'));});socket.connect();});return socket;}
const command=async(s:Socket,name:string,input:unknown)=>RoomAckSchema.parse(await s.timeout(5000).emitWithAck(name,input));
const joinBody=(slug='sdk-sandbox',roomId?:string)=>({schemaVersion:1,requestId:randomUUID(),worldSlug:slug,worldVersion:'1.0.0',sceneVersion:'1.0.0',...(roomId?{roomId}:{})});
const own=(s:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),epoch:s.epoch,roomId:s.roomId,membershipId:s.membershipId});
async function join(s:Socket,roomId?:string){const ack=await command(s,'room.join',joinBody('sdk-sandbox',roomId));expect(ack.ok).toBe(true);if(!ack.ok||ack.result.type!=='snapshot')throw Error('Synthetic visit rejected');return ack.result;}

it('actual TCP mutation and socket handshake reject mixed session CSRF,origin,cookie and claimed authority without changing either identity',async()=>{
 const a=await guest(),b=await guest();
 const attempts:[Record<string,string>,unknown,number][]=[
  [{origin}, {displayName:'Rejected'},401],
  [{...writeHeaders(a),cookie:'city_session=tampered'}, {displayName:'Rejected'},401],
  [{...writeHeaders(a),origin:'https://attacker.example'}, {displayName:'Rejected'},403],
  [{origin,cookie:a.cookie,'idempotency-key':randomUUID()}, {displayName:'Rejected'},403],
  [{...writeHeaders(a),'x-csrf-token':b.me.csrfToken}, {displayName:'Rejected'},403],
  [writeHeaders(a), {displayName:'Rejected',accountId:b.me.profile.id,role:'safety-admin'},422],
 ];
 for(const [headers,body,status] of attempts)expect((await tcp('/v1/me','PATCH',headers,body,a.address)).status).toBe(status);
 for(const [headers,auth] of [[{cookie:b.cookie},{}],[{origin:'https://attacker.example'},{}],[{cookie:'city_session=tampered'},{}],[{}, {accountId:b.me.profile.id,role:'safety-admin'}]] as [Record<string,string>,Record<string,unknown>][])await expect(connect(a,headers,auth)).rejects.toThrow('Synthetic handshake denied');
 const socket=await connect(a),snapshot=await join(socket);expect(snapshot.self.accountId===a.me.profile.id).toBe(true);
 for(const u of [a,b]){const observed=await tcp('/v1/me','GET',{cookie:u.cookie},undefined,u.address);expect(observed.status).toBe(200);const me=MeSchema.parse(JSON.parse(observed.body));expect(me.profile.id===u.me.profile.id&&me.profile.displayName===u.me.profile.displayName).toBe(true);}
 expect((await pool.query('SELECT count(*)::int AS n FROM identity_accounts')).rows[0].n).toBe(2);
});

it('actual TCP known room authority stays viewer scoped and a persisted world ban denies live commands,reconnect and owner restart without blocking independent logout',async()=>{
 const a=await guest(),b=await guest(),ca=await connect(a),cb=await connect(b),sa=await join(ca),sb=await join(cb,sa.roomId);
 const forged=await command(cb,'seat.claim',{...own(sa),seatId:'seat-1'});expect(forged.ok).toBe(false);
 const self=await command(cb,'room.snapshot',own(sb));expect(self.ok).toBe(true);if(self.ok&&self.result.type==='snapshot')expect(self.result.participants.every(p=>p.profile.id===b.me.profile.id)).toBe(true);
 const caseId=randomUUID(),now=Date.now();
 // Persisted synthetic restriction models another issuer/process. Existing sanctions suite tests audited issuance/ejection.
 await pool.query("INSERT INTO safety_cases(id,receipt_id,reporter_id,subject_id,request_id,fingerprint,world_slug,category,severity,created_at) VALUES($1,$2,$3,$4,$5,$6,'sdk-sandbox','harassment','medium',$7)",[caseId,randomUUID(),b.me.profile.id,a.me.profile.id,randomUUID(),'s'.repeat(64),new Date(now)]);
 await pool.query("INSERT INTO safety_sanctions(id,case_id,subject_id,kind,category,world_slug,effective_at,expires_at,appeal_until) VALUES($1,$2,$3,'world-ban','harassment','sdk-sandbox',$4,$5,$5)",[randomUUID(),caseId,a.me.profile.id,new Date(now-1000),new Date(now+60000)]);
 for(const socket of [ca,await connect(a)]){const denied=await command(socket,'room.join',joinBody('sdk-sandbox',sa.roomId));expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('NOT_FOUND');}
 const live=await command(ca,'room.snapshot',own(sa));expect(live.ok).toBe(false);
 expect((await tcp('/v1/worlds/sdk-sandbox/rooms','GET',{cookie:a.cookie},undefined,a.address)).status).toBe(404);
 for(const socket of clients)socket.close();clients.clear();await runtime!.stop();expect(runtime!.child.exitCode).toBe(0);runtime=await startRoomProcess(databaseUrl,secret);
 const resumed=await connect(a),denied=await command(resumed,'room.join',joinBody());expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('NOT_FOUND');
 expect((await tcp('/v1/me','GET',{cookie:a.cookie},undefined,a.address)).status).toBe(200);
 expect((await tcp('/v1/session/logout','POST',writeHeaders(a),{},a.address)).status).toBe(200);
 await expect(connect(a)).rejects.toThrow('Synthetic handshake denied');expect((await tcp('/v1/me','GET',{cookie:a.cookie},undefined,a.address)).status).toBe(401);
 expect((await join(await connect(b))).occupancy).toBe(1);
});

it('actual TCP forwarded-header spoofing cannot bypass guest limits,session budget is shared across sockets and adult claims cannot open the closed world',async()=>{
 const address='127.103.240.1',u=await guest(address);
 for(let n=0;n<9;n++)expect((await tcp('/v1/session/guest','POST',{origin,'x-forwarded-for':`198.51.100.${n+1}`},guestBody(),address)).status).toBe(201);
 expect((await tcp('/v1/session/guest','POST',{origin,'x-forwarded-for':'203.0.113.99'},guestBody(),address)).status).toBe(429);
 expect((await pool.query('SELECT count(*)::int AS n FROM identity_accounts')).rows[0].n).toBe(10);
 const a=await connect(u),b=await connect(u);for(let n=0;n<60;n++){const result=SessionCheckAckSchema.parse(await (n%2?a:b).timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()}));expect(result.ok).toBe(true);}
 const limited=SessionCheckAckSchema.parse(await a.timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()}));expect(limited.ok).toBe(false);if(!limited.ok)expect(limited.error.code).toBe('RATE_LIMITED');
 const gated=await guest(),socket=await connect(gated);
 expect((await tcp('/v1/dating/profile','GET',{cookie:gated.cookie,'x-reviewed-adult':'true','x-role':'safety-admin'},undefined,gated.address)).status).toBe(404);
 const closed=await command(socket,'room.join',joinBody('dating'));expect(closed.ok).toBe(false);if(!closed.ok)expect(closed.error.code).toBe('NOT_FOUND');
 const forged=await command(socket,'room.join',{...joinBody('dating'),age:18,reviewedAdult:true});expect(forged.ok).toBe(false);if(!forged.ok)expect(forged.error.code).toBe('INVALID_REQUEST');
 expect((await pool.query('SELECT count(*)::int AS n FROM restricted_dating_enrollments')).rows[0].n).toBe(0);
 expect((await tcp('/v1/me','GET',{cookie:u.cookie},undefined,u.address)).status).toBe(200);
});
