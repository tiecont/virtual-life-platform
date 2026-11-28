import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createApp} from '../../apps/platform-api/src/app';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import {PrelaunchEmailCipher} from '../../apps/platform-api/src/features/identity/modules/prelaunch/infrastructure/email-cipher';
import type {PrelaunchMailMessage,PrelaunchMailSink} from '../../apps/platform-api/src/features/identity/modules/prelaunch/infrastructure/mail-sink';

let admin:Pool;
const emailKey='67'.repeat(32),emailKeyId='prelaunch-integration',playerSecret='prelaunch-player-session-secret-'.repeat(2),operatorKey='68'.repeat(32),operatorPassword='synthetic-prelaunch-operator-password',totpSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const origin='http://127.0.0.1:3300',adminOrigin='http://127.0.0.1:3400';
const key=Buffer.from(emailKey,'hex');
const seal=(purpose:string,value:unknown)=>createHmac('sha256',key).update('prelaunch:'+purpose+':v1:'+JSON.stringify(value)).digest('hex');

class TestMailSink implements PrelaunchMailSink {
  messages:PrelaunchMailMessage[]=[];
  failures=0;
  async send(message:PrelaunchMailMessage){
    if(this.failures>0){this.failures--;throw Error('Synthetic mail outage');}
    if(this.messages.some(value=>value.idempotencyKey===message.idempotencyKey))return;
    this.messages.push(message);
  }
}

describe('prelaunch double opt-in',()=>{
  let pool:Pool,schema:string,server:Awaited<ReturnType<typeof createApp>>,campaignId:string,now:number,mail:TestMailSink;

  beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});});
  beforeEach(async()=>{
    schema='prelaunch_'+randomUUID().replaceAll('-','');
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
    pool=new Pool({connectionString:url.toString(),max:40});
    await migrate(pool);
    now=Date.parse('2026-11-24T00:00:00.000Z');mail=new TestMailSink();campaignId=randomUUID();
    await pool.query("INSERT INTO prelaunch_campaigns(id,slug,title,capacity,admissions,phase,created_at,changed_at) VALUES($1,'launch-5000','Synthetic launch',5000,0,'OPEN',$2,$2)",[campaignId,new Date(now)]);
    server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:playerSecret,ADMIN_ORIGIN:adminOrigin,OPERATOR_AUTH_KEY:operatorKey,PRELAUNCH_REGISTRATION_ENABLED:'1',PRELAUNCH_EMAIL_KEY:emailKey,PRELAUNCH_EMAIL_KEY_ID:emailKeyId}),pool,false,{now:()=>now,prelaunch:{mail}});
  });
  afterEach(async()=>{await server?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
  afterAll(async()=>{await admin.end();});

  const ip=()=>'127.0.1.'+(Math.floor(Math.random()*250)+1);
  const register=(email:string,requestId=randomUUID(),marketingConsent=false)=>({schemaVersion:1,requestId,campaignId,email,marketingConsent});
  const post=(path:string,payload:unknown,address=ip())=>server.http.inject({method:'POST',url:'/v1/prelaunch/'+path,remoteAddress:address,headers:{origin},payload});
  const drain=()=>server.prelaunch!.drain();
  const confirmationCode=()=>{
    const message=[...mail.messages].reverse().find(value=>value.kind==='confirmation');
    const match=message?.text.match(/[a-f0-9]{64}/);
    if(!match)throw Error('Confirmation mail missing');
    return match[0];
  };

  it('keeps pending email encrypted, consumes capacity only on confirmation, and never reallocates on withdrawal',async()=>{
    const owner='Owner@Example.COM';
    const response=await post('requests',register(owner));
    expect(response.statusCode).toBe(202);expect(response.json()).toEqual({schemaVersion:1,accepted:true});
    expect((await pool.query("SELECT coalesce(sum(admissions),0)::int AS n FROM prelaunch_campaigns")).rows[0].n).toBe(0);
    const registration=(await pool.query('SELECT * FROM prelaunch_registrations')).rows[0];
    expect(JSON.stringify(registration)).not.toContain(owner.toLowerCase());
    expect(registration.marketing_consent).toBe(false);
    expect((await post('requests',register(owner))).statusCode).toBe(202);
    expect((await pool.query('SELECT count(*)::int AS n FROM prelaunch_registrations')).rows[0].n).toBe(1);
    expect(await drain()).toMatchObject({sent:1,failed:0});
    const message=mail.messages[0];expect(message.to).toBe('owner@example.com');expect(message.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    const token=confirmationCode();
    expect((await pool.query('SELECT * FROM prelaunch_challenges')).rows).not.toEqual(expect.arrayContaining([expect.objectContaining({token_hash:token})]));
    const confirmed=await post('confirm',{schemaVersion:1,token});
    expect(confirmed.statusCode).toBe(200);expect(confirmed.json()).toMatchObject({state:'CONFIRMED',version:1,marketingConsent:false});
    const managementToken=confirmed.json().managementToken as string;
    expect(managementToken).toMatch(/^[a-f0-9]{64}$/);
    expect((await post('confirm',{schemaVersion:1,token})).json()).toEqual(confirmed.json());
    expect((await pool.query("SELECT count(*)::int AS n FROM prelaunch_registrations WHERE state='CONFIRMED'")).rows[0].n).toBe(1);
    expect((await pool.query('SELECT admissions FROM prelaunch_campaigns')).rows[0].admissions).toBe(1);
    expect((await server.http.inject({url:'/v1/prelaunch/registration',remoteAddress:ip(),headers:{authorization:'Bearer '+managementToken}})).json()).toMatchObject({state:'CONFIRMED',version:1});
    const requestId=randomUUID(),withdrawn=await server.http.inject({method:'POST',url:'/v1/prelaunch/withdraw',remoteAddress:ip(),headers:{origin,authorization:'Bearer '+managementToken},payload:{schemaVersion:1,requestId,expectedVersion:1}});
    expect(withdrawn.statusCode).toBe(200);expect(withdrawn.json()).toMatchObject({state:'WITHDRAWN',version:2});
    expect((await server.http.inject({method:'POST',url:'/v1/prelaunch/withdraw',remoteAddress:ip(),headers:{origin,authorization:'Bearer '+managementToken},payload:{schemaVersion:1,requestId,expectedVersion:1}})).json()).toEqual(withdrawn.json());
    expect((await pool.query('SELECT admissions FROM prelaunch_campaigns')).rows[0].admissions).toBe(1);
    expect((await post('requests',register('owner@example.com'))).statusCode).toBe(202);
    expect((await pool.query('SELECT count(*)::int AS n FROM prelaunch_registrations')).rows[0].n).toBe(1);
  });

  it('returns generic accepted responses, durable-idempotent retries, durable rate limits, and no email in operator output',async()=>{
    const requestId=randomUUID(),body=register('repeat@example.com',requestId,true);
    const copies=await Promise.all(Array.from({length:8},()=>post('requests',body)));
    expect(copies.every(value=>value.statusCode===202&&value.json().accepted===true)).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM prelaunch_registrations')).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM prelaunch_outbox')).rows[0].n).toBe(1);
    const cipher=new PrelaunchEmailCipher(emailKey,emailKeyId);
    await pool.query("INSERT INTO prelaunch_suppressions(email_hash,reason,created_at) VALUES($1,'owner_request',$2)",[cipher.lookup('suppressed@example.com'),new Date(now)]);
    const unknown=await post('resend',{schemaVersion:1,requestId:randomUUID(),campaignId,email:'unknown@example.com'});
    const suppressed=await post('resend',{schemaVersion:1,requestId:randomUUID(),campaignId,email:'suppressed@example.com'});
    expect(unknown.statusCode).toBe(202);expect(suppressed.statusCode).toBe(202);expect(unknown.body).toBe(suppressed.body);
    for(let index=0;index<3;index++)expect((await post('resend',{schemaVersion:1,requestId:randomUUID(),campaignId,email:'repeat@example.com'})).statusCode).toBe(202);
    for(let index=0;index<2;index++)expect((await post('resend',{schemaVersion:1,requestId:randomUUID(),campaignId,email:'repeat@example.com'})).statusCode).toBe(429);
    const operator=new OperatorService(pool,operatorKey,()=>now);
    await operator.bootstrap({password:operatorPassword,totpSecret,code:totp(totpSecret,now-30000)});
    const login=await server.http.inject({method:'POST',url:'/v1/operator/login',remoteAddress:ip(),headers:{origin:adminOrigin},payload:{password:operatorPassword,code:totp(totpSecret,now)}});
    expect(login.statusCode).toBe(200);
    const cookie=String(login.headers['set-cookie']).split(';')[0],summary=await server.http.inject({url:'/v1/operator/prelaunch-summary?campaignId='+campaignId,remoteAddress:ip(),headers:{cookie}});
    expect(summary.statusCode).toBe(200);expect(summary.json()).toMatchObject({capacity:5000,confirmed:0,pending:1,recentAudit:expect.any(Array)});
    for(const privateValue of ['repeat@example.com','suppressed@example.com',requestId,body.requestId])expect(summary.body).not.toContain(privateValue);
    expect((await server.http.inject({url:'/v1/operator/prelaunch-summary?campaignId='+campaignId,remoteAddress:ip()})).statusCode).toBe(401);
  });

  it('retries a retryable sink failure and suppresses an existing pending registration without exposing mail',async()=>{
    mail.failures=2;
    expect((await post('requests',register('retry@example.com'))).statusCode).toBe(202);
    expect(await drain()).toMatchObject({sent:0,failed:1});
    expect((await pool.query('SELECT state,attempts FROM prelaunch_outbox')).rows[0]).toEqual({state:'PENDING',attempts:1});
    now+=1000;expect(await drain()).toMatchObject({sent:0,failed:1});
    now+=2000;expect(await drain()).toMatchObject({sent:1,failed:0});
    expect((await pool.query('SELECT state,attempts FROM prelaunch_outbox WHERE kind=\'confirmation\'')).rows[0]).toEqual({state:'SENT',attempts:3});
    const second=randomUUID();
    expect((await post('requests',register('blocked@example.com',second))).statusCode).toBe(202);
    const cipher=new PrelaunchEmailCipher(emailKey,emailKeyId);
    await pool.query("INSERT INTO prelaunch_suppressions(email_hash,reason,created_at) VALUES($1,'hard_bounce',$2)",[cipher.lookup('blocked@example.com'),new Date(now)]);
    expect(await drain()).toMatchObject({suppressed:1});
    expect((await pool.query("SELECT state FROM prelaunch_registrations WHERE email_hash=$1",[cipher.lookup('blocked@example.com')])).rows[0].state).toBe('SUPPRESSED');
    expect((await pool.query("SELECT o.state AS outbox_state FROM prelaunch_outbox o JOIN prelaunch_registrations r ON r.id=o.registration_id WHERE r.email_hash=$1",[cipher.lookup('blocked@example.com')])).rows[0].outbox_state).toBe('SUPPRESSED');
    expect(JSON.stringify((await pool.query('SELECT * FROM prelaunch_outbox')).rows)).not.toContain('blocked@example.com');
  });

  it('rolls confirmation capacity, consent and outbox back together when the final COMMIT fails',async()=>{
    expect((await post('requests',register('rollback@example.com'))).statusCode).toBe(202);
    expect(await drain()).toMatchObject({sent:1});
    const token=confirmationCode();
    await pool.query("CREATE FUNCTION fail_prelaunch_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='confirmed' THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END; $$;CREATE CONSTRAINT TRIGGER fail_prelaunch_commit AFTER INSERT ON prelaunch_outbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_prelaunch_commit()");
    expect((await post('confirm',{schemaVersion:1,token})).statusCode).toBe(503);
    expect((await pool.query('SELECT admissions FROM prelaunch_campaigns')).rows[0].admissions).toBe(0);
    expect((await pool.query('SELECT state,confirmed_at FROM prelaunch_registrations')).rows[0]).toEqual({state:'PENDING',confirmed_at:null});
    expect((await pool.query('SELECT used_at FROM prelaunch_challenges')).rows[0].used_at).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM prelaunch_consent_events WHERE action='email.confirmed'")).rows[0].n).toBe(0);
  });

  it('keeps registration routes unavailable by default',async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
    const disabled=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:playerSecret}),pool,false,{now:()=>now});
    try{
      expect((await disabled.http.inject({url:'/v1/prelaunch/campaigns/'+campaignId,remoteAddress:ip()})).statusCode).toBe(404);
      expect((await disabled.http.inject({method:'POST',url:'/v1/prelaunch/requests',remoteAddress:ip(),headers:{origin},payload:register('closed@example.com')})).statusCode).toBe(404);
    }finally{await disabled.app.close();}
  });

  it('proves the 5000 lifetime cap under 10001 concurrent confirm/retry requests',async()=>{
    const count=5001,at=new Date(now),cipher=new PrelaunchEmailCipher(emailKey,emailKeyId);
    for(let start=0;start<count;start+=500){
      const ids=Array.from({length:Math.min(500,count-start)},()=>randomUUID());
      const values:string[]=[],parameters:unknown[]=[];
      ids.forEach((id,index)=>{
        const nonce=randomBytes(32).toString('hex'),email='cap-'+(start+index)+'@example.com',management=seal('management-token',[id,nonce]);
        const offset=parameters.length;
        values.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6},$${offset+7},false,'PENDING',0,$${offset+8})`);
        parameters.push(id,campaignId,cipher.lookup(email),cipher.seal(email),emailKeyId,seal('management-token-hash',management),nonce,at);
      });
      await pool.query(`INSERT INTO prelaunch_registrations(id,campaign_id,email_hash,email_sealed,email_key_id,management_token_hash,management_nonce,marketing_consent,state,version,created_at) VALUES ${values.join(',')}`,parameters);
    }
    const registrations=(await pool.query<{id:string;management_nonce:string;email_hash:string}>('SELECT id,management_nonce,email_hash FROM prelaunch_registrations ORDER BY id')).rows;
    const tokens=registrations.map(registration=>seal('confirmation-token',[registration.id,registration.management_nonce]));
    const challengeValues:string[]=[],challengeParameters:unknown[]=[];
    registrations.forEach((registration,index)=>{
      const nonce=randomBytes(32).toString('hex'),offset=challengeParameters.length;
      challengeValues.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6})`);
      challengeParameters.push(randomUUID(),registration.id,seal('confirmation-token-hash',tokens[index]),nonce,at,new Date(at.getTime()+30*60000));
    });
    await pool.query(`INSERT INTO prelaunch_challenges(id,registration_id,token_hash,server_nonce,created_at,expires_at) VALUES ${challengeValues.join(',')}`,challengeParameters);
    const calls=[...tokens,...tokens.slice(0,5000)];
    const results=await Promise.allSettled(calls.map(token=>server.prelaunch!.confirm({schemaVersion:1,token})));
    expect(results.filter(value=>value.status==='rejected').length).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT admissions FROM prelaunch_campaigns')).rows[0].admissions).toBe(5000);
    expect((await pool.query("SELECT count(*)::int AS n FROM prelaunch_registrations WHERE state='CONFIRMED'")).rows[0].n).toBe(5000);
    expect((await pool.query("SELECT count(*)::int AS n FROM prelaunch_registrations WHERE state='PENDING'")).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(DISTINCT email_hash)::int AS n FROM prelaunch_registrations')).rows[0].n).toBe(count);
  },180000);
});
