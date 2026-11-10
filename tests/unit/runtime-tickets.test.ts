import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,verify,sign} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {IdentityService} from '../../apps/platform-api/src/identity/service';
import {readConfig} from '../../apps/platform-api/src/config';
import {RuntimeTicketIssuer,type RuntimeAdmissionPort,type RuntimeScope} from '../../apps/platform-api/src/identity/runtime-tickets';

const keys=generateKeyPairSync('ed25519'),key2=generateKeyPairSync('ed25519');
const schema='runtime_ticket_'+randomUUID().replaceAll('-','');
const instant=1_700_000_000_000;
let now=instant,admin:Pool,pool:Pool,identity:IdentityService;
const scope:RuntimeScope={worldId:'native:training',runtimeBootId:'11111111-1111-4111-8111-111111111111',contentHash:'ab'.repeat(32),protocolVersion:1};
const policy:RuntimeAdmissionPort=async(_db,accountId,sessionId)=>({accountId,sessionId,generation:1,validUntilMs:now+5000});
before(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);
 identity=new IdentityService(pool,readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'runtime-ticket-test-only-secret-00000001'}),()=>now);
});
after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
const guest=()=>identity.guest({requestId:randomUUID(),displayName:'Trust Fixture',avatarKey:'fern'});
function payload(ticket:string){return JSON.parse(Buffer.from(ticket.split('.')[1],'base64url').toString()) as Record<string,unknown>;}
test('real identity owner issues Ed25519 scoped grants and produces live cross-language fixtures',async()=>{
 const user=await guest(),issuer=new RuntimeTicketIssuer(identity,'key-a',keys.privateKey,policy,()=>now);
 const first=await issuer.issue(user.token,scope),second=await issuer.issue(user.token,scope);
 const parts=first.ticket.split('.'),claims=payload(first.ticket);
 assert.equal(verify(null,Buffer.from(parts[0]+'.'+parts[1]),keys.publicKey,Buffer.from(parts[2],'base64url')),true);
 assert.equal(claims.sub,user.me.profile.id);assert.equal(claims.world,'native:training');
 assert.equal(claims.exp,Math.floor(now/1000)+5);assert.equal(claims.generation,'1');
 assert.notEqual(payload(second.ticket).jti,claims.jti);
 assert.equal(first.ticket.includes(user.token),false);
 assert.deepEqual(Object.keys(JSON.parse(Buffer.from(parts[0],'base64url').toString())).sort(),['alg','kid','typ']);
 const rotate=await new RuntimeTicketIssuer(identity,'key-b',key2.privateKey,policy,()=>now).issue(user.token,scope);
 const encode=(change:Record<string,unknown>,header:Record<string,unknown>={alg:'EdDSA',typ:'vl-runtime-ticket+jwt',kid:'key-a'})=>{
  const input=Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+Buffer.from(JSON.stringify({...claims,...change})).toString('base64url');
  return input+'.'+sign(null,Buffer.from(input),keys.privateKey).toString('base64url');
 };
 const negativeTokens={
  issuer:encode({iss:'other'}),audience:encode({aud:'native-socket-v1'}),world:encode({world:'native:other'}),boot:encode({boot:randomUUID()}),content:encode({content:'cd'.repeat(32)}),protocol:encode({protocol:2}),scope:encode({scope:'admin'}),generation:encode({generation:'01'}),subject:encode({sub:'caller'}),nonce:encode({jti:'bad'}),expired:encode({iat:Number(claims.iat)-10,nbf:Number(claims.iat)-10,exp:Number(claims.iat)}),future:encode({iat:Number(claims.iat)+1,nbf:Number(claims.iat)+1,exp:Number(claims.iat)+5}),ttl:encode({exp:Number(claims.iat)+31}),unknownClaim:encode({role:'admin'}),unknownKey:encode({},{alg:'EdDSA',typ:'vl-runtime-ticket+jwt',kid:'unknown'}),critical:encode({},{alg:'EdDSA',typ:'vl-runtime-ticket+jwt',kid:'key-a',crit:['b64']}),algorithm:encode({},{alg:'HS256',typ:'vl-runtime-ticket+jwt',kid:'key-a'}),keyUrl:encode({},{alg:'EdDSA',typ:'vl-runtime-ticket+jwt',kid:'key-a',jku:'https://invalid.example/key'}),
 };
 const fixture={now:Math.floor(now/1000),publicKeys:{'key-a':keys.publicKey.export({format:'jwk'}).x,'key-b':key2.publicKey.export({format:'jwk'}).x},ticket:first.ticket,rotationTicket:rotate.ticket,negativeTokens,account:claims.sub,session:claims.sid,world:scope.worldId,boot:scope.runtimeBootId,content:scope.contentHash};
 const path=process.env.VL_TICKET_FIXTURE_PATH??'artifacts/desktop-first/vl013/tickets.json';
 await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(fixture,null,2)+'\n');
});
test('rechecks identity after a real account-lock wait and never signs a revoked session',async()=>{
 const user=await guest(),context=await identity.authenticate(user.token),blocker=await pool.connect();
 let admissionCalls=0;const issuer=new RuntimeTicketIssuer(identity,'key-a',keys.privateKey,async(...args)=>{admissionCalls++;return policy(...args);},()=>now);
 let pending:Promise<unknown>|undefined;
 try{
  await blocker.query('BEGIN');await identity.lockAccounts(blocker,[context.accountId]);
  pending=issuer.issue(user.token,scope);const denied=assert.rejects(pending);
  let waiting=false;for(let i=0;i<100;i++){
   if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true);
  await blocker.query('UPDATE identity_sessions SET revoked_at=$2 WHERE id=$1',[context.sessionId,new Date(now)]);
  await blocker.query('COMMIT');await denied;assert.equal(admissionCalls,0);
 }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
});
test('bounds TTL and rejects unavailable policy,wrong account and legacy world scope',async()=>{
 const user=await guest();
 const issue=(port:RuntimeAdmissionPort)=>new RuntimeTicketIssuer(identity,'key-a',keys.privateKey,port,()=>now).issue(user.token,scope);
 await assert.rejects(issue(async()=>{throw Error('Policy unavailable');}));
 await assert.rejects(issue(async(_db,accountId,sessionId)=>({accountId,sessionId,generation:0,validUntilMs:now+5000})));
 await assert.rejects(issue(async(_db,_accountId,sessionId)=>({accountId:randomUUID(),sessionId,generation:1,validUntilMs:now+5000})));
 await assert.rejects(issue(async(_db,accountId,sessionId)=>({accountId,sessionId,generation:1,validUntilMs:now})));
 const long=await issue(async(_db,accountId,sessionId)=>({accountId,sessionId,generation:1,validUntilMs:now+600000}));
 assert.equal(Number(payload(long.ticket).exp)-Number(payload(long.ticket).iat),30);
 const issuer=new RuntimeTicketIssuer(identity,'key-a',keys.privateKey,policy,()=>now);
 await assert.rejects(issuer.issue(user.token,{...scope,worldId:'deadline-cafe'}));
 await assert.rejects(issuer.issue(user.token,{...scope,contentHash:'no'}));
 assert.throws(()=>new RuntimeTicketIssuer(identity,'key-a',keys.publicKey,policy));
 now=instant;
});
