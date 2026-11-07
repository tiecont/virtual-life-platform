import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {
 NativeClientSchema,NativeGuestInputSchema,NativeLoginInputSchema,NativeUpgradeInputSchema,
 NativeRefreshInputSchema,NativeRefreshTokenSchema,NativeAccessTokenSchema,NativeSocketTicketSchema,
 NativeDevicesSchema,NativeTicketInputSchema,ClientProtocolOfferSchema,negotiateClientProtocol,
 type NativeClient,type NativeTokens,type ClientProtocolOffer,type NegotiatedSession,
} from '@virtual-city/contracts';
import type {IdentityService} from './service';
import {IdentityError,unauthorized} from './errors';
import {NativeCredentialsCrypto} from './native-crypto';

type DB=Pick<Pool,'query'>|PoolClient;
type Family={id:string;account_id:string;identity_session_id:string;credential_ciphertext:string;bootstrap_hash:string;refresh_hash:string;label:string;created_at:Date;expires_at:Date;revoked_at:Date|null};
type Grant=Family&{grant_id:string;grant_expires_at:Date;client_build:string};
type Revoked={accountId:string;sessionIds:string[]};
export class NativeProtocolError extends Error{constructor(){super('A supported application update is required');}}
export const NATIVE_ACCESS_TTL_MS=300000,NATIVE_TICKET_TTL_MS=30000;

// Independent privacy port: disabling login must not hide existing own data.
export function registerNativePrivacy(identity:IdentityService,now=Date.now){identity.registerExportOwner('nativeDevices',async(account,db)=>{
 const rows=(await db.query<{label:string;created_at:Date;expires_at:Date;revoked:boolean}>('SELECT n.label,n.created_at,n.expires_at,(n.revoked_at IS NOT NULL OR s.revoked_at IS NOT NULL OR n.expires_at<=$2) AS revoked FROM native_device_sessions n JOIN identity_sessions s ON s.id=n.identity_session_id WHERE n.account_id=$1 ORDER BY n.created_at,n.id LIMIT 50',[account,new Date(now())])).rows;
 return rows.length?rows.map(row=>({platform:'android',label:row.label,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),revoked:row.revoked})):undefined;
});}

// An identity-owned adapter. No room authority,caller-selected subject or
// browser cookie is created here. Every mutation uses the canonical account lock.
export class NativeIdentityService{
 private crypto:NativeCredentialsCrypto;
 private detach:()=>void;
 constructor(private identity:IdentityService,key:string,private now=Date.now){
  this.crypto=new NativeCredentialsCrypto(key);
  this.detach=identity.attachNativeCredentialResolver((db,reference)=>this.resolveCredential(db,reference));
 }
 close(){this.detach();}
 private client(value:NativeClient){
  const parsed=NativeClientSchema.parse({schemaVersion:value.schemaVersion,platform:value.platform,clientBuild:value.clientBuild,protocol:value.protocol});
  if(!negotiateClientProtocol(parsed.protocol))throw new NativeProtocolError();return parsed;
 }
 private async tx<T>(work:(db:PoolClient)=>Promise<T>):Promise<T>{
  const db=await this.identity.pool.connect();try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 private same(a:string,b:string){return /^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
 private binding(row:Family){return{deviceId:row.id,accountId:row.account_id,sessionId:row.identity_session_id,expiresAt:row.expires_at.getTime()};}
 private core(row:Family){try{return this.crypto.openCore(row.credential_ciphertext,this.binding(row));}catch{throw unauthorized();}}
 private active(row:Family){if(row.revoked_at||row.expires_at.getTime()<=this.now())throw unauthorized();}
 private async family(db:PoolClient,id:string):Promise<Family>{
  const initial=(await db.query<Family>('SELECT * FROM native_device_sessions WHERE id=$1',[id])).rows[0];if(!initial)throw unauthorized();
  await this.identity.lockAccounts(db,[initial.account_id]);
  const row=(await db.query<Family>('SELECT * FROM native_device_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||row.account_id!==initial.account_id)throw unauthorized();return row;
 }
 private async grant(db:DB,id:string):Promise<Grant>{
  const row=(await db.query<Grant>('SELECT n.*,g.id AS grant_id,g.expires_at AS grant_expires_at,g.client_build FROM native_access_grants g JOIN native_device_sessions n ON n.id=g.device_id WHERE g.id=$1',[id])).rows[0];
  if(!row)throw unauthorized();this.active(row);if(row.grant_expires_at.getTime()<=this.now())throw unauthorized();return row;
 }
 private async resolveCredential(db:DB,reference:string){
  let id:string;try{id=this.crypto.readGrantCredential(reference);}catch{throw unauthorized();}
  const row=await this.grant(db,id);return{credential:this.core(row),accountId:row.account_id,sessionId:row.identity_session_id,expiresAt:Math.min(row.grant_expires_at.getTime(),row.expires_at.getTime())};
 }
 async authenticateAccess(value:string){
  if(!NativeAccessTokenSchema.safeParse(value).success)throw unauthorized();
  const found=(await this.identity.pool.query<{id:string}>('SELECT id FROM native_access_grants WHERE token_hash=$1',[this.identity.hash(value)])).rows[0];if(!found)throw unauthorized();
  const credential=this.crypto.grantCredential(found.id),context=await this.identity.authenticate(credential),row=await this.grant(this.identity.pool,found.id);
  return{credential,context,row};
 }
 private refreshToken(deviceId:string,secret=randomBytes(32).toString('hex')){return'nr1.'+deviceId+'.'+secret;}
 private async prune(db:PoolClient,id:string){
  await db.query('DELETE FROM native_socket_tickets WHERE device_id=$1 AND expires_at<=$2',[id,new Date(this.now())]);
  await db.query('DELETE FROM native_access_grants WHERE device_id=$1 AND expires_at<=$2',[id,new Date(this.now())]);
 }
 private async mintAccess(db:PoolClient,row:Family,client:NativeClient,refreshToken:string){
  this.active(row);await this.prune(db,row.id);this.active(row);
  const id=randomUUID(),token='na1.'+randomBytes(32).toString('hex'),expires=new Date(Math.min(row.expires_at.getTime(),this.now()+NATIVE_ACCESS_TTL_MS));
  await db.query('INSERT INTO native_access_grants(id,device_id,token_hash,client_build,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,row.id,this.identity.hash(token),client.clientBuild,expires,new Date(this.now())]);
  const tokens:NativeTokens={deviceId:row.id,accessToken:token,accessExpiresAt:expires.toISOString(),refreshToken,refreshExpiresAt:row.expires_at.toISOString()};
  return{tokens,credential:this.crypto.grantCredential(id)};
 }
 private async attach(core:string,client:NativeClient,requestId:string,label:string){
  const initial=await this.identity.authenticate(core);
  const result=await this.tx(async db=>{
   await this.identity.lockAccounts(db,[initial.accountId]);const current=await this.identity.contextInTransaction(db,core);
   if(current.accountId!==initial.accountId||current.sessionId!==initial.sessionId)throw unauthorized();
   const fingerprint=this.identity.fingerprint({purpose:'native-bootstrap-v1',requestId,client,label});
   let row=(await db.query<Family>('SELECT * FROM native_device_sessions WHERE identity_session_id=$1 FOR UPDATE',[current.sessionId])).rows[0];
   if(row){this.active(row);if(row.bootstrap_hash!==fingerprint)throw new IdentityError('IDEMPOTENCY_CONFLICT',409,'Request key was used with different input');}
   else{
    const id=randomUUID(),expires=new Date(current.expiresAt),refresh=this.refreshToken(id,this.crypto.bootstrapRefresh(id,current.sessionId,requestId));
    const ciphertext=this.crypto.sealCore(core,{deviceId:id,accountId:current.accountId,sessionId:current.sessionId,expiresAt:current.expiresAt});
    row=(await db.query<Family>('INSERT INTO native_device_sessions(id,account_id,identity_session_id,credential_ciphertext,bootstrap_hash,refresh_hash,label,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id,current.accountId,current.sessionId,ciphertext,fingerprint,this.identity.hash(refresh),label,new Date(this.now()),expires])).rows[0];
   }
   const refresh=this.refreshToken(row.id,this.crypto.bootstrapRefresh(row.id,row.identity_session_id,requestId));if(!this.same(row.refresh_hash,this.identity.hash(refresh)))throw unauthorized();
   return this.mintAccess(db,row,client,refresh);
  });
  return{tokens:result.tokens,me:await this.identity.me(result.credential)};
 }
 async guest(input:unknown){
  const body=NativeGuestInputSchema.parse(input),client=this.client(body);
  const result=await this.identity.guest({...body.guest,requestId:this.crypto.namespaceRequest('guest',body.guest.requestId)});
  return{...await this.attach(result.token,client,body.guest.requestId,body.deviceLabel),created:result.created};
 }
 async login(input:unknown){
  const body=NativeLoginInputSchema.parse(input),client=this.client(body);
  const result=await this.identity.login({...body.login,requestId:this.crypto.namespaceRequest('login',body.login.requestId)});
  return this.attach(result.token,client,body.login.requestId,body.deviceLabel);
 }
 async upgrade(access:string,input:unknown){
  const body=NativeUpgradeInputSchema.parse(input),client=this.client(body),auth=await this.authenticateAccess(access);
  const result=await this.identity.upgrade(auth.credential,this.crypto.namespaceRequest('upgrade',body.requestId),body.upgrade);
  return this.attach(result.token,client,body.requestId,auth.row.label);
 }
 private async revoke(db:PoolClient,row:Family):Promise<Revoked>{
  await db.query('UPDATE native_device_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1',[row.id,new Date(this.now())]);
  const removed=(await db.query<{id:string}>("UPDATE identity_sessions SET revoked_at=$3,revoked_reason='logout' WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL RETURNING id",[row.identity_session_id,row.account_id,new Date(this.now())])).rows.map(value=>value.id);
  return{accountId:row.account_id,sessionIds:removed};
 }
 private notify(event:Revoked|undefined){if(event)this.identity.afterSessionRevocation(event.accountId,event.sessionIds);}
 async refresh(input:unknown){
  const body=NativeRefreshInputSchema.parse(input),client=this.client(body),id=body.refreshToken.split('.')[1],digest=this.identity.hash(body.refreshToken);
  const result=await this.tx(async db=>{
   const row=await this.family(db,id);this.active(row);
   if(!this.same(row.refresh_hash,digest)){
    const spent=(await db.query('SELECT 1 FROM native_refresh_spent WHERE token_hash=$1 AND device_id=$2',[digest,row.id])).rowCount;
    return{ok:false as const,revoked:spent?await this.revoke(db,row):undefined};
   }
   const context=await this.identity.contextInTransaction(db,this.core(row));if(context.accountId!==row.account_id||context.sessionId!==row.identity_session_id)throw unauthorized();
   const next=this.refreshToken(row.id);
   await db.query('INSERT INTO native_refresh_spent(token_hash,device_id,expires_at) VALUES($1,$2,$3)',[digest,row.id,row.expires_at]);
   await db.query('UPDATE native_device_sessions SET refresh_hash=$2 WHERE id=$1',[row.id,this.identity.hash(next)]);
   const issued=await this.mintAccess(db,row,client,next);return{ok:true as const,...issued};
  });
  if(!result.ok){this.notify(result.revoked);throw unauthorized();}
  return{tokens:result.tokens,me:await this.identity.me(result.credential)};
 }
 async logout(refresh:string){
  if(!NativeRefreshTokenSchema.safeParse(refresh).success)throw unauthorized();
  const result=await this.tx(async db=>{
   const row=await this.family(db,refresh.split('.')[1]),digest=this.identity.hash(refresh);
   const spent=!this.same(row.refresh_hash,digest)&&(await db.query('SELECT 1 FROM native_refresh_spent WHERE token_hash=$1 AND device_id=$2',[digest,row.id])).rowCount;
   if(!this.same(row.refresh_hash,digest)&&!spent)throw unauthorized();return this.revoke(db,row);
  });this.notify(result);return{schemaVersion:1 as const,loggedOut:true as const};
 }
 async devices(access:string){
  const auth=await this.authenticateAccess(access),rows=(await this.identity.pool.query<Family>('SELECT n.* FROM native_device_sessions n JOIN identity_sessions s ON s.id=n.identity_session_id WHERE n.account_id=$1 AND n.revoked_at IS NULL AND n.expires_at>$2 AND s.revoked_at IS NULL AND s.expires_at>$2 ORDER BY n.created_at,n.id LIMIT 10',[auth.context.accountId,new Date(this.now())])).rows;
  return NativeDevicesSchema.parse({schemaVersion:1,devices:rows.map(row=>({deviceId:row.id,platform:'android',label:row.label,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),current:row.id===auth.row.id}))});
 }
 async revokeDevice(access:string,id:string){
  const initial=await this.authenticateAccess(access),result=await this.tx(async db=>{
   await this.identity.lockAccounts(db,[initial.context.accountId]);const current=await this.identity.contextInTransaction(db,initial.credential);
   const row=(await db.query<Family>('SELECT * FROM native_device_sessions WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,current.accountId])).rows[0];if(!row)throw new IdentityError('NOT_FOUND',404,'Device unavailable');return this.revoke(db,row);
  });this.notify(result);return{schemaVersion:1 as const,revoked:true as const};
 }
 async ticket(access:string,input:unknown){
  const body=NativeTicketInputSchema.parse(input),client=this.client(body),initial=await this.authenticateAccess(access);
  const result=await this.tx(async db=>{
   await this.identity.lockAccounts(db,[initial.context.accountId]);const current=await this.identity.contextInTransaction(db,initial.credential),row=await this.grant(db,initial.row.grant_id);
   if(row.client_build!==client.clientBuild)throw new NativeProtocolError();await this.prune(db,row.id);
   const token='nt1.'+randomBytes(32).toString('hex'),expires=new Date(Math.min(current.expiresAt,this.now()+NATIVE_TICKET_TTL_MS)),selection=negotiateClientProtocol(client.protocol)!;
   await db.query('INSERT INTO native_socket_tickets(token_hash,device_id,grant_id,account_id,identity_session_id,audience,protocol,protocol_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[this.identity.hash(token),row.id,row.grant_id,current.accountId,current.sessionId,'native-socket-v1',client.protocol,this.identity.fingerprint(client.protocol),expires,new Date(this.now())]);
   return{schemaVersion:1 as const,ticket:token,expiresAt:expires.toISOString(),selection};
  });return result;
 }
 async consumeTicket(ticket:string,input:ClientProtocolOffer){
  if(!NativeSocketTicketSchema.safeParse(ticket).success)throw unauthorized();const protocol=ClientProtocolOfferSchema.parse(input),selection=negotiateClientProtocol(protocol);if(!selection)throw new NativeProtocolError();
  return this.tx(async db=>{
   const lookup=(await db.query<{account_id:string}>('SELECT account_id FROM native_socket_tickets WHERE token_hash=$1',[this.identity.hash(ticket)])).rows[0];if(!lookup)throw unauthorized();await this.identity.lockAccounts(db,[lookup.account_id]);
   const row=(await db.query<{device_id:string;grant_id:string;account_id:string;identity_session_id:string;audience:string;protocol_hash:string;expires_at:Date;consumed_at:Date|null}>('SELECT * FROM native_socket_tickets WHERE token_hash=$1 FOR UPDATE',[this.identity.hash(ticket)])).rows[0];
   if(!row||row.consumed_at||row.expires_at.getTime()<=this.now()||row.audience!=='native-socket-v1'||!this.same(row.protocol_hash,this.identity.fingerprint(protocol)))throw unauthorized();
   const credential=this.crypto.grantCredential(row.grant_id),context=await this.identity.contextInTransaction(db,credential),grant=await this.grant(db,row.grant_id);
   if(context.accountId!==row.account_id||context.sessionId!==row.identity_session_id||grant.id!==row.device_id)throw unauthorized();
   const claimed=await db.query('UPDATE native_socket_tickets SET consumed_at=$2 WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING token_hash',[this.identity.hash(ticket),new Date(this.now())]);
   if(!claimed.rowCount||row.expires_at.getTime()<=this.now())throw unauthorized();return{credential,context,selection:selection as NegotiatedSession,ticketExpiresAt:row.expires_at.getTime()};
  });
 }
}
