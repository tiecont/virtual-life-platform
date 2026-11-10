import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {IdentityService} from '../../apps/platform-api/src/identity/service';
import {readConfig} from '../../apps/platform-api/src/config';
import {RuntimeAdmissionStore} from '../../apps/platform-api/src/identity/runtime-admission';
import {RuntimeTicketIssuer,type RuntimeScope} from '../../apps/platform-api/src/identity/runtime-tickets';

const schema='runtime_admission_'+randomUUID().replaceAll('-','');
let admin:Pool,pool:Pool,identity:IdentityService,store:RuntimeAdmissionStore;
const keys=generateKeyPairSync('ed25519');
beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable local DB required');
 admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString(),max:12});await migrate(pool);
 identity=new IdentityService(pool,readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'native-admission-test-only-secret-000001'}));
 store=new RuntimeAdmissionStore(pool,identity);
});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
const guest=()=>identity.guest({requestId:randomUUID(),displayName:'Admission fixture',avatarKey:'fern'});
function scope():RuntimeScope{return {worldId:'native:test-'+randomUUID(),runtimeBootId:randomUUID(),contentHash:'ab'.repeat(32),protocolVersion:1};}
function claims(ticket:string){return JSON.parse(Buffer.from(ticket.split('.')[1],'base64url').toString()) as {generation:string;sub:string;sid:string};}
function issuer(port=store){return new RuntimeTicketIssuer(identity,'fixture',keys.privateKey,port.admission);}

it('closed and unknown native destinations never allocate or sign and do not accept legacy namespace',async()=>{
 const user=await guest(),target=scope();
 await expect(store.allocate(user.token,target)).rejects.toThrow();
 expect(await store.configure(target,0)).toBe(1);
 await expect(store.allocate(user.token,target)).rejects.toThrow();
 await expect(issuer().issue(user.token,target)).rejects.toThrow();
 await expect(store.configure({...target,worldId:'deadline'},0,true,1)).rejects.toThrow();
 expect((await pool.query('SELECT count(*) AS n FROM platform_native_admissions WHERE account_id=$1',[user.me.profile.id])).rows[0].n).toBe('0');
});
it('eight real concurrent allocations admit one account at capacity1 and reject a second active world',async()=>{
 const target=scope(),users=await Promise.all(Array.from({length:8},()=>guest()));await store.configure(target,0,true,1);
 const outcomes=await Promise.allSettled(users.map(user=>store.allocate(user.token,target)));
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 const winner=users[outcomes.findIndex(x=>x.status==='fulfilled')];
 expect((await pool.query('SELECT count(*) AS n FROM platform_native_admissions WHERE world_id=$1 AND allowed',[target.worldId])).rows[0].n).toBe('1');
 const other=scope();await store.configure(other,0,true,2);
 await expect(store.allocate(winner.token,other)).rejects.toThrow();
 const ticket=await issuer().issue(winner.token,target);expect(claims(ticket.ticket).sub).toBe(winner.me.profile.id);
 await store.release(winner.token);await expect(issuer().issue(winner.token,target)).rejects.toThrow();
 await store.allocate(users.find(x=>x!==winner)!.token,target);
});
it('durable generation survives store restart, release and fresh allocation invalidate previous grants',async()=>{
 const target=scope(),user=await guest();await store.configure(target,0,true,2);
 const first=await store.allocate(user.token,target),ticket=await issuer().issue(user.token,target);
 const restarted=new RuntimeAdmissionStore(pool,identity);expect(claims((await issuer(restarted).issue(user.token,target)).ticket).generation).toBe(String(first.generation));
 await restarted.release(user.token);await expect(issuer(restarted).issue(user.token,target)).rejects.toThrow();
 const second=await restarted.allocate(user.token,target);expect(second.generation).toBe(first.generation+2);
 expect(claims(ticket.ticket).generation).not.toBe(String(second.generation));
 expect(claims((await issuer(restarted).issue(user.token,target)).ticket).generation).toBe(String(second.generation));
});
it('world generation/boot/content and expired owner lease fail closed without resetting account generations',async()=>{
 const target=scope(),user=await guest();await store.configure(target,0,true,2);const grant=await store.allocate(user.token,target);
 const replacement={...target,runtimeBootId:randomUUID(),contentHash:'cd'.repeat(32)};
 await expect(store.configure(replacement,0,true,2)).rejects.toThrow();
 expect(await store.configure(replacement,1,true,2)).toBe(2);
 await expect(issuer().issue(user.token,target)).rejects.toThrow();
 await expect(issuer().issue(user.token,replacement)).rejects.toThrow();
 expect((await store.allocate(user.token,replacement)).generation).toBe(grant.generation+1);
 await expect(store.heartbeat(target,1)).rejects.toThrow();
 await store.heartbeat(replacement,2);
 await pool.query("UPDATE platform_native_worlds SET lease_until=clock_timestamp()-interval '1 second' WHERE world_id=$1",[target.worldId]);
 await expect(store.heartbeat(replacement,2)).rejects.toThrow();
 await expect(issuer().issue(user.token,replacement)).rejects.toThrow();
 await expect(store.allocate(user.token,replacement)).rejects.toThrow();
});
it('issuer waits on canonical identity lock then rejects actual session revocation before signing',async()=>{
 const target=scope(),user=await guest();await store.configure(target,0,true,2);await store.allocate(user.token,target);
 const context=await identity.authenticate(user.token),db=await pool.connect();let pending:Promise<unknown>|undefined;
 try{
  await db.query('BEGIN');await identity.lockAccounts(db,[context.accountId]);
  pending=issuer().issue(user.token,target);const denied=expect(pending).rejects.toThrow();
  await expect.poll(async()=>Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount)).toBe(true);
  await db.query("UPDATE identity_sessions SET revoked_at=clock_timestamp(),revoked_reason='logout' WHERE id=$1",[context.sessionId]);
  await db.query('COMMIT');await denied;
  await expect(store.allocate(user.token,target)).rejects.toThrow();
 }finally{await db.query('ROLLBACK');db.release();await pending?.catch(()=>{});}
});
it('session replacement and disabled world cannot reuse an admission and identity deletion cascades grants',async()=>{
 const target=scope(),user=await guest();await store.configure(target,0,true,2);await store.allocate(user.token,target);
 const context=await identity.authenticate(user.token);
 const changed=await identity.rotate(user.token,randomUUID());
 await expect(issuer().issue(changed.token,target)).rejects.toThrow();
 const renewed=await store.allocate(changed.token,target);expect(renewed.sessionId).not.toBe(context.sessionId);
 await store.configure(target,1,false,0);await expect(issuer().issue(changed.token,target)).rejects.toThrow();
 await pool.query('DELETE FROM identity_accounts WHERE id=$1',[context.accountId]);
 expect((await pool.query('SELECT count(*) AS n FROM platform_native_admissions WHERE account_id=$1',[context.accountId])).rows[0].n).toBe('0');
});
