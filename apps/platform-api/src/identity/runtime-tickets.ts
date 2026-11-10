import {createPrivateKey,randomBytes,sign,type KeyObject} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {IdentityService} from './service';

export const RUNTIME_TICKET_TTL_SECONDS=30;
export const RUNTIME_TICKET_ISSUER='vl-platform-v1';
export const RUNTIME_TICKET_AUDIENCE='vl-native-runtime-v1';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const label=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export type RuntimeScope=Readonly<{
 worldId:string;runtimeBootId:string;contentHash:string;protocolVersion:1;
}>;
export type RuntimeAdmission=Readonly<{
 accountId:string;sessionId:string;generation:number;validUntilMs:number;
}>;
export type RuntimeAdmissionPort=(db:PoolClient,accountId:string,sessionId:string,scope:RuntimeScope)=>Promise<RuntimeAdmission>;
export class RuntimeTicketError extends Error {
 constructor(){super('Runtime admission unavailable');}
}
function validScope(scope:RuntimeScope){return /^native:[a-z0-9][a-z0-9._-]{0,63}$/.test(scope.worldId)&&uuid.test(scope.runtimeBootId)&&hash.test(scope.contentHash)&&scope.protocolVersion===1;}

// Internal identity-owned adapter, intentionally absent from public app routes.
// The policy port must read current admission under the same account lock.
export class RuntimeTicketIssuer {
 private readonly key:KeyObject;
 constructor(private identity:IdentityService,private kid:string,key:KeyObject,private admission:RuntimeAdmissionPort,private now=Date.now){
  if(!label.test(kid)||key.type!=='private'||key.asymmetricKeyType!=='ed25519')throw new RuntimeTicketError();
  this.key=createPrivateKey(key.export({type:'pkcs8',format:'pem'}));
 }
 async issue(credential:string,scope:RuntimeScope){
  if(!validScope(scope))throw new RuntimeTicketError();
  // Copy before awaits: caller mutation cannot change signed admission scope.
  const target=Object.freeze({...scope});
  const initial=await this.identity.authenticate(credential);
  const db=await this.identity.pool.connect();
  try{
   await db.query('BEGIN');
   await this.identity.lockAccounts(db,[initial.accountId]);
   const current=await this.identity.contextInTransaction(db,credential);
   if(current.accountId!==initial.accountId||current.sessionId!==initial.sessionId||!uuid.test(current.accountId)||!uuid.test(current.sessionId))throw new RuntimeTicketError();
   const policy=await this.admission(db,current.accountId,current.sessionId,target);
   const nowMs=this.now(),iat=Math.floor(nowMs/1000);
   const exp=Math.min(iat+RUNTIME_TICKET_TTL_SECONDS,Math.floor(current.expiresAt/1000),Math.floor(policy.validUntilMs/1000));
   if(!Number.isSafeInteger(nowMs)||nowMs<0||policy.accountId!==current.accountId||policy.sessionId!==current.sessionId||!Number.isSafeInteger(policy.generation)||policy.generation<1||!Number.isSafeInteger(exp)||exp<=iat)throw new RuntimeTicketError();
   const header=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'vl-runtime-ticket+jwt',kid:this.kid})).toString('base64url');
   const claims={v:1,iss:RUNTIME_TICKET_ISSUER,aud:RUNTIME_TICKET_AUDIENCE,sub:current.accountId,sid:current.sessionId,jti:randomBytes(16).toString('hex'),iat,nbf:iat,exp,world:target.worldId,boot:target.runtimeBootId,content:target.contentHash,protocol:1,scope:'world.connect game.command',generation:String(policy.generation)};
   const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
   const input=header+'.'+payload;
   const ticket=input+'.'+sign(null,Buffer.from(input),this.key).toString('base64url');
   await db.query('COMMIT');
   return Object.freeze({ticket,expiresAt:new Date(exp*1000).toISOString()});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
}
