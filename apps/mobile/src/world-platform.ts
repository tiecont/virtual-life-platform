import {AvatarOwnStateSchema,MeSchema,NativeSocketHandshakeSchema,NativeTicketResultSchema,TravelIntentInputSchema} from '@virtual-city/contracts';
import type {ClientPlatform,NativeSessionCustodyPort,NativeWorldCall} from '@virtual-city/client-sdk';
import {mobilePlatform} from './platform';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const unavailable=()=>new Response(JSON.stringify({error:{code:'NOT_AVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});
// Every instance belongs to one displayed account. The bridge owns credentials,
// fixed destinations and pre-HTTP assertions;no generic gameplay HTTP is opened.
export function nativeWorldPlatform(session:NativeSessionCustodyPort,accountId:string,navigate:(path:string)=>void):ClientPlatform{
 if(!uuid.test(accountId))throw Error('Account unavailable');
 const base=mobilePlatform(navigate),listeners=new Set<()=>void>();let invalid=false;
 const invalidate=()=>{if(invalid)return;invalid=true;for(const listener of listeners)listener();};
 return {...base,sessionEnded:invalidate,watchIdentity(listener){listeners.add(listener);return()=>listeners.delete(listener);},async request(path,init={}){
  init.signal?.throwIfAborted();if(invalid)return unavailable();
  const method=init.method??'GET',headers=new Headers(init.headers),requestId=headers.get('idempotency-key')??'';
  let reply:{status:number;body:unknown};
  if(path==='/v1/me'&&method==='GET'){
   reply=await session.request({method:'GET',path:'/v1/me'});
   if(reply.status===200&&MeSchema.parse(reply.body).profile.id!==accountId){invalidate();return unavailable();}
  }else if(path==='/v1/me/avatar'&&method==='GET'){
   const own=AvatarOwnStateSchema.parse(await session.avatarState({expectedAccountId:accountId}));if(own.accountId!==accountId){invalidate();return unavailable();}reply={status:200,body:own};
  }else{
   let call:NativeWorldCall|undefined;
   if(method==='GET'&&path==='/v1/worlds')call={expectedAccountId:accountId,operation:'catalog'};
   else if(method==='GET'&&path==='/v1/client-compatibility')call={expectedAccountId:accountId,operation:'compatibility'};
   else if(method==='GET'&&path==='/v1/me/room')call={expectedAccountId:accountId,operation:'visit'};
   else if(method==='POST'&&path==='/v1/travel-intents'&&uuid.test(requestId)&&typeof init.body==='string')call={expectedAccountId:accountId,operation:'travel-create',requestId,input:TravelIntentInputSchema.parse(JSON.parse(init.body))};
   else {const match=/^\/v1\/travel-intents\/([a-f0-9-]{36})(\/cancel)?$/.exec(path);if(match&&uuid.test(match[1])){
    if(method==='GET'&&!match[2])call={expectedAccountId:accountId,operation:'travel-read',intentId:match[1]};
    else if(method==='POST'&&match[2]&&uuid.test(requestId)&&init.body==='{}')call={expectedAccountId:accountId,operation:'travel-cancel',intentId:match[1],requestId};
   }}
   if(!call)return unavailable();reply=await session.world(call);
  }
  init.signal?.throwIfAborted();if(reply.status===401)invalidate();if(invalid)return unavailable();
  return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{'content-type':'application/json'}});
 },async socketAuth({expectedAccountId,protocol}){
  if(invalid||expectedAccountId!==accountId)throw Error('Account changed');
  const result=NativeTicketResultSchema.parse(await session.roomTicket({expectedAccountId:accountId,protocol}));
  if(invalid||result.selection.nonce!==protocol.nonce||Date.parse(result.expiresAt)<=Date.now())throw Error('Connection changed');
  return NativeSocketHandshakeSchema.parse({schemaVersion:1,nativeTicket:result.ticket,protocol});
 }};
}
