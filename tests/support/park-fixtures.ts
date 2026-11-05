import { expect,type BrowserContext,type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Pool } from 'pg';
import { MeSchema,type Me } from '@virtual-city/contracts';
import { libraryWorldVersion } from '@virtual-city/library-world';
export const origin='http://127.0.0.1:3300';
let bootstrapSerial=1;
export async function guest(context:BrowserContext,displayName='Park visitor'){
 const payload=JSON.stringify({requestId:randomUUID(),displayName,avatarKey:'mint'});
 const result=await new Promise<{cookie:string;body:unknown}>((resolve,reject)=>{const req=request('http://127.0.0.1:4300/v1/session/guest',{method:'POST',localAddress:'127.107.0.'+bootstrapSerial++,headers:{origin,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{expect(res.statusCode).toBe(201);resolve({cookie:res.headers['set-cookie']![0].split(';')[0],body:JSON.parse(body)});}catch(error){reject(error);}});});req.on('error',reject);req.end(payload);});
 const separator=result.cookie.indexOf('=');await context.addCookies([{name:result.cookie.slice(0,separator),value:result.cookie.slice(separator+1),url:origin,httpOnly:true,sameSite:'Lax'}]);return MeSchema.parse(result.body);
}
export async function publicPark(context:BrowserContext,csrf:string){expect((await context.request.patch('/v1/me/privacy',{headers:{origin,'x-csrf-token':csrf,'idempotency-key':randomUUID()},data:{presence:'hidden',analyticsConsent:false,worldVisibility:{dating:'hidden',park:'public'}}})).status()).toBe(200);}
export async function enterPark(page:Page){await page.goto('/worlds/park');await page.getByRole('button',{name:'Enter park',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Connected');}
export function parkTestDb(){const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');return new Pool({connectionString:url.toString()});}
export async function parkFriends(a:BrowserContext,actor:Me,b:BrowserContext,peer:Me){const code=(await (await b.request.get('/v1/social/me')).json()).contactCode;const sent=await a.request.post('/v1/friends/requests',{headers:{origin,'x-csrf-token':actor.csrfToken,'idempotency-key':randomUUID()},data:{contactCode:code}});expect(sent.status()).toBe(200);expect((await b.request.post('/v1/friends/requests/'+(await sent.json()).id+'/respond',{headers:{origin,'x-csrf-token':peer.csrfToken,'idempotency-key':randomUUID()},data:{action:'accept'}})).status()).toBe(200);}
export async function allowParkInvites(context:BrowserContext,me:Me){expect((await context.request.patch('/v1/me/invitations/settings',{headers:{origin,'x-csrf-token':me.csrfToken,'idempotency-key':randomUUID()},data:{schemaVersion:1,allowInvitations:true}})).status()).toBe(200);}
export async function parkScheduleFixtures(organizerId:string){
 const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');const db=new Pool({connectionString:url.toString()}),ids=Array.from({length:4},()=>randomUUID()),at=new Date();
 // Rendering/filtering fixtures only,not new organizer/provider authority or actual Dating enrollment.
 try{for(let i=0;i<4;i++){const base=new Date(+at-(i===2?10800000:0));await db.query("INSERT INTO engine_events(id,organizer_id,world_slug,world_version,policy_version,title,audience,visibility,capacity,time_zone,opens_at,starts_at,check_in_closes_at,ends_at,phase,created_at,changed_at) VALUES($1,$2,$3,$4,'1.0.0',$5,'silent',$6,2,'Asia/Ho_Chi_Minh',$7,$8,$9,$10,$11,$12::timestamptz-interval '120 seconds',$13)",[ids[i],organizerId,i===3?'dating':'library',i===3?'1.0.0':libraryWorldVersion,['Park board listed study','Private board sentinel','Ended board sentinel','Restricted board sentinel'][i],i===1?'private':'listed',new Date(+base-60000),new Date(+base+120000),new Date(+base+3600000),new Date(+base+7200000),i===2?'ENDED':'OPEN',base,at]);}}
 catch(error){await db.query('DELETE FROM engine_events WHERE id=ANY($1::uuid[])',[ids]).catch(()=>{});await db.end();throw error;}
 return {ids,db,close:async()=>{await db.query('DELETE FROM engine_events WHERE id=ANY($1::uuid[])',[ids]);await db.end();}};
}
