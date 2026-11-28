import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {
  OperatorPrelaunchQuerySchema,
  OperatorPrelaunchSummarySchema,
  PrelaunchAcceptedSchema,
  PrelaunchCampaignSchema,
  PrelaunchConfirmationSchema,
  PrelaunchConfirmSchema,
  PrelaunchRegisterSchema,
  PrelaunchRegistrationViewSchema,
  PrelaunchResendSchema,
  PrelaunchWithdrawSchema,
  type PrelaunchCampaign,
  type PrelaunchRegistrationView,
} from '@aetheria/contracts';
import {DomainError} from '../../../../../shared/common/errors';
import type {IdentityService} from '../../accounts/application/service';
import type {OperatorService} from '../../operators/application/operator-service';
import {PrelaunchEmailCipher} from '../infrastructure/email-cipher';
import type {PrelaunchMailSink} from '../infrastructure/mail-sink';

type CampaignRow={id:string;slug:string;capacity:number;admissions:number;phase:'OPEN'|'CLOSED';opens_at:Date|null;closes_at:Date|null};
type RegistrationRow={id:string;campaign_id:string;email_hash:string;email_sealed:string;email_key_id:string;management_token_hash:string;management_nonce:string;marketing_consent:boolean;state:'PENDING'|'CONFIRMED'|'WITHDRAWN'|'SUPPRESSED';version:number;created_at:Date;confirmed_at:Date|null;withdrawn_at:Date|null;suppressed_at:Date|null};
type ChallengeRow={id:string;registration_id:string;token_hash:string;server_nonce:string;created_at:Date;expires_at:Date;used_at:Date|null;confirmed:boolean};
type OutboxRow={id:string;registration_id:string;challenge_id:string|null;kind:'confirmation'|'confirmed';state:'PENDING'|'SENDING'|'SENT'|'FAILED'|'SUPPRESSED'|'CANCELED';attempts:number;next_attempt_at:Date;locked_until:Date|null;created_at:Date;sent_at:Date|null};
type DeliveryRow=OutboxRow&{email_hash:string;email_sealed:string;email_key_id:string;registration_state:RegistrationRow['state'];challenge_nonce:string|null;challenge_used_at:Date|null};
type RequestRow={operation:'register'|'resend'|'withdraw';registration_id:string|null;fingerprint:string};
const HOUR=3600000,DAY=24*HOUR,PENDING_CAP=10000,MAX_OUTBOX_ATTEMPTS=5;
const accepted=PrelaunchAcceptedSchema.parse({schemaVersion:1,accepted:true});
const unavailable=()=>new DomainError('NOT_FOUND',404,'Prelaunch registration is unavailable');
const confirmationUnavailable=()=>new DomainError('NOT_FOUND',404,'Confirmation is unavailable');
const stale=()=>new DomainError('IDEMPOTENCY_CONFLICT',409,'Registration changed; refresh before retrying');
const limited=(retryAfterMs=300)=>new DomainError('RATE_LIMITED',429,'Please wait before trying again',Math.max(1,Math.ceil(retryAfterMs/1000)));

export class PrelaunchRegistrationService {
  private readonly key:Buffer;
  private readonly cipher:PrelaunchEmailCipher;

  constructor(
    private readonly identity:IdentityService,
    emailKey:string,
    emailKeyId:string,
    private readonly operator:OperatorService|undefined,
    private readonly mail:PrelaunchMailSink,
    private readonly now=Date.now,
  ){
    if(!/^[a-f0-9]{64}$/i.test(emailKey))throw Error('Invalid prelaunch email key');
    this.key=Buffer.from(emailKey,'hex');
    this.cipher=new PrelaunchEmailCipher(emailKey,emailKeyId);
  }

  private seal(purpose:string,value:unknown){return createHmac('sha256',this.key).update('prelaunch:'+purpose+':v1:'+JSON.stringify(value)).digest('hex');}
  private confirmationToken(registrationId:string,nonce:string){return this.seal('confirmation-token',[registrationId,nonce]);}
  private confirmationTokenHash(registrationId:string,nonce:string){return this.seal('confirmation-token-hash',this.confirmationToken(registrationId,nonce));}
  private managementToken(registrationId:string,nonce:string){return this.seal('management-token',[registrationId,nonce]);}
  private managementTokenHash(value:string){return this.seal('management-token-hash',value);}
  private requestFingerprint(value:unknown){return this.seal('request',value);}

  private async tx<T>(work:(db:PoolClient)=>Promise<T>):Promise<T>{
    const db=await this.identity.pool.connect();
    try{await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}
    catch(error){await db.query('ROLLBACK');throw error;}
    finally{db.release();}
  }

  private async lock(db:PoolClient,key:string){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['prelaunch:'+key]);}

  private state(campaign:CampaignRow):PrelaunchCampaign['state']{
    const at=this.now();
    if(campaign.admissions>=campaign.capacity)return 'FULL';
    if(campaign.phase!=='OPEN'||(campaign.opens_at&&campaign.opens_at.getTime()>at)||(campaign.closes_at&&campaign.closes_at.getTime()<=at))return 'CLOSED';
    return 'OPEN';
  }

  private campaign(row:CampaignRow):PrelaunchCampaign{
    return PrelaunchCampaignSchema.parse({schemaVersion:1,id:row.id,slug:row.slug,state:this.state(row)});
  }

  private view(row:RegistrationRow):PrelaunchRegistrationView{
    return PrelaunchRegistrationViewSchema.parse({
      schemaVersion:1,
      state:row.state,
      version:row.version,
      marketingConsent:row.marketing_consent,
      confirmedAt:row.confirmed_at?.toISOString()??null,
      withdrawnAt:row.withdrawn_at?.toISOString()??null,
    });
  }

  private async campaignRow(db:Pick<PoolClient,'query'>,id:string,lock=false){
    const row=(await db.query<CampaignRow>('SELECT id,slug,capacity,admissions,phase,opens_at,closes_at FROM prelaunch_campaigns WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
    if(!row)throw unavailable();
    return row;
  }

  private async registrationByManagement(db:Pick<PoolClient,'query'>,token:string,lock=false){
    const row=(await db.query<RegistrationRow>('SELECT * FROM prelaunch_registrations WHERE management_token_hash=$1'+(lock?' FOR UPDATE':''),[this.managementTokenHash(token)])).rows[0];
    if(!row)throw confirmationUnavailable();
    return row;
  }

  private async rate(db:PoolClient,entries:ReadonlyArray<readonly [string,number,number]>){
    const at=new Date(this.now());
    for(const [name,max,windowMs] of [...entries].sort(([a],[b])=>a.localeCompare(b))){
      const bucket=this.seal('rate-bucket',name);
      await this.lock(db,'rate:'+bucket);
      const previous=(await db.query<{window_started_at:Date;attempts:number}>('SELECT window_started_at,attempts FROM prelaunch_rate_limits WHERE bucket=$1 FOR UPDATE',[bucket])).rows[0];
      if(!previous||previous.window_started_at.getTime()+windowMs<=at.getTime()){
        await db.query('INSERT INTO prelaunch_rate_limits(bucket,window_started_at,attempts,touched_at) VALUES($1,$2,1,$2) ON CONFLICT(bucket) DO UPDATE SET window_started_at=$2,attempts=1,touched_at=$2',[bucket,at]);
        continue;
      }
      if(previous.attempts>=max)throw limited(previous.window_started_at.getTime()+windowMs-at.getTime());
      await db.query('UPDATE prelaunch_rate_limits SET attempts=attempts+1,touched_at=$2 WHERE bucket=$1',[bucket,at]);
    }
  }

  private consent(db:PoolClient,registrationId:string,action:'registration.requested'|'marketing.opted_in'|'email.confirmed'|'registration.withdrawn'){
    return db.query('INSERT INTO prelaunch_consent_events(registration_id,action,occurred_at) VALUES($1,$2,$3)',[registrationId,action,new Date(this.now())]);
  }

  private async audit(db:PoolClient,campaignId:string,registrationId:string|null,action:'registration.requested'|'email.confirmed'|'registration.withdrawn'|'mail.suppressed'){
    const at=new Date(this.now()),after={state:registrationId?'recorded':'accepted'},event=[campaignId,registrationId,action,'system',after,at.toISOString()];
    await db.query("INSERT INTO prelaunch_audit(campaign_id,registration_id,action,actor,after_state,occurred_at,event_hash) VALUES($1,$2,$3,'system',$4,$5,$6)",[campaignId,registrationId,action,after,at,this.seal('audit',event)]);
  }

  private async issueChallenge(db:PoolClient,registration:RegistrationRow){
    const at=new Date(this.now()),nonce=randomBytes(32).toString('hex'),id=randomUUID(),expires=new Date(at.getTime()+30*60000);
    await db.query('UPDATE prelaunch_challenges SET used_at=$2 WHERE registration_id=$1 AND used_at IS NULL',[registration.id,at]);
    await db.query('INSERT INTO prelaunch_challenges(id,registration_id,token_hash,server_nonce,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,registration.id,this.confirmationTokenHash(registration.id,nonce),nonce,at,expires]);
    await db.query("INSERT INTO prelaunch_outbox(id,registration_id,challenge_id,kind,next_attempt_at,created_at) VALUES($1,$2,$3,'confirmation',$4,$4)",[randomUUID(),registration.id,id,at]);
  }

  private async priorRequest(db:PoolClient,campaignId:string,requestId:string){
    const row=(await db.query<RequestRow>('SELECT operation,registration_id,fingerprint FROM prelaunch_requests WHERE campaign_id=$1 AND request_id=$2',[campaignId,requestId])).rows[0];
    if(!row||row.operation!=='register'&&row.operation!=='resend')return undefined;
    return row;
  }

  private async rememberRequest(db:PoolClient,campaignId:string,requestId:string,operation:'register'|'resend'|'withdraw',registrationId:string|null,emailHash:string,fingerprint:string){
    const at=new Date(this.now());
    await db.query('INSERT INTO prelaunch_requests(campaign_id,request_id,operation,registration_id,email_hash,fingerprint,created_at,retain_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(campaign_id,request_id) DO NOTHING',[campaignId,requestId,operation,registrationId,emailHash,fingerprint,at,new Date(at.getTime()+DAY)]);
    const saved=(await db.query<RequestRow>('SELECT operation,registration_id,fingerprint FROM prelaunch_requests WHERE campaign_id=$1 AND request_id=$2',[campaignId,requestId])).rows[0];
    if(!saved||saved.operation!==operation||saved.registration_id!==registrationId||saved.fingerprint!==fingerprint)throw stale();
  }

  async campaignState(campaignId:string){
    const id=z.uuid().parse(campaignId);
    return this.campaign(await this.campaignRow(this.identity.pool,id));
  }

  async request(input:unknown,clientKey:string){
    const value=PrelaunchRegisterSchema.parse(input),emailHash=this.cipher.lookup(value.email),fingerprint=this.requestFingerprint({campaignId:value.campaignId,requestId:value.requestId,operation:'register',emailHash,marketingConsent:value.marketingConsent});
    return this.tx(async db=>{
      await this.lock(db,'request:'+value.campaignId+':'+value.requestId);
      const prior=await this.priorRequest(db,value.campaignId,value.requestId);
      if(prior){if(prior.fingerprint!==fingerprint)throw stale();return accepted;}
      const campaign=await this.campaignRow(db,value.campaignId);
      await this.rate(db,[['ip-register:'+this.seal('ip',clientKey),30,HOUR],['email-register:'+emailHash,5,HOUR]]);
      if(this.state(campaign)==='OPEN'){
        await this.lock(db,'email:'+value.campaignId+':'+emailHash);
        const suppressed=(await db.query('SELECT 1 FROM prelaunch_suppressions WHERE email_hash=$1',[emailHash])).rowCount;
        if(!suppressed){
          let registration=(await db.query<RegistrationRow>('SELECT * FROM prelaunch_registrations WHERE campaign_id=$1 AND email_hash=$2 FOR UPDATE',[value.campaignId,emailHash])).rows[0];
          if(!registration){
            const pending=(await db.query<{n:number}>("SELECT count(*)::int AS n FROM prelaunch_registrations WHERE campaign_id=$1 AND state='PENDING'",[value.campaignId])).rows[0].n;
            if(pending<PENDING_CAP){
              const id=randomUUID(),managementNonce=randomBytes(32).toString('hex'),at=new Date(this.now());
              registration=(await db.query<RegistrationRow>('INSERT INTO prelaunch_registrations(id,campaign_id,email_hash,email_sealed,email_key_id,management_token_hash,management_nonce,marketing_consent,state,version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'PENDING\',0,$9) RETURNING *',[id,value.campaignId,emailHash,this.cipher.seal(value.email),this.cipher.keyId,this.managementTokenHash(this.managementToken(id,managementNonce)),managementNonce,value.marketingConsent,at])).rows[0];
              await this.consent(db,registration.id,'registration.requested');
              if(value.marketingConsent)await this.consent(db,registration.id,'marketing.opted_in');
              await this.audit(db,value.campaignId,registration.id,'registration.requested');
            }
          }
          if(registration?.state==='PENDING')await this.issueChallenge(db,registration);
        }
      }
      await this.rememberRequest(db,value.campaignId,value.requestId,'register',null,emailHash,fingerprint);
      return accepted;
    });
  }

  async resend(input:unknown,clientKey:string){
    const value=PrelaunchResendSchema.parse(input),emailHash=this.cipher.lookup(value.email),fingerprint=this.requestFingerprint({campaignId:value.campaignId,requestId:value.requestId,operation:'resend',emailHash});
    return this.tx(async db=>{
      await this.lock(db,'request:'+value.campaignId+':'+value.requestId);
      const prior=await this.priorRequest(db,value.campaignId,value.requestId);
      if(prior){if(prior.fingerprint!==fingerprint)throw stale();return accepted;}
      await this.campaignRow(db,value.campaignId);
      await this.rate(db,[['ip-resend:'+this.seal('ip',clientKey),15,HOUR],['email-resend:'+emailHash,3,HOUR]]);
      await this.lock(db,'email:'+value.campaignId+':'+emailHash);
      const registration=(await db.query<RegistrationRow>('SELECT * FROM prelaunch_registrations WHERE campaign_id=$1 AND email_hash=$2 FOR UPDATE',[value.campaignId,emailHash])).rows[0];
      if(registration?.state==='PENDING'&&!((await db.query('SELECT 1 FROM prelaunch_suppressions WHERE email_hash=$1',[emailHash])).rowCount))await this.issueChallenge(db,registration);
      await this.rememberRequest(db,value.campaignId,value.requestId,'resend',null,emailHash,fingerprint);
      return accepted;
    });
  }

  async confirm(input:unknown){
    const value=PrelaunchConfirmSchema.parse(input),tokenHash=this.seal('confirmation-token-hash',value.token);
    const initial=(await this.identity.pool.query<{campaign_id:string;registration_id:string}>(`SELECT r.campaign_id,ch.registration_id
      FROM prelaunch_challenges ch JOIN prelaunch_registrations r ON r.id=ch.registration_id
      WHERE ch.token_hash=$1`,[tokenHash])).rows[0];
    if(!initial)throw confirmationUnavailable();
    return this.tx(async db=>{
      const campaign=await this.campaignRow(db,initial.campaign_id,true);
      const challenge=(await db.query<ChallengeRow>('SELECT * FROM prelaunch_challenges WHERE token_hash=$1 FOR UPDATE',[tokenHash])).rows[0];
      const registration=(await db.query<RegistrationRow>('SELECT * FROM prelaunch_registrations WHERE id=$1 FOR UPDATE',[initial.registration_id])).rows[0];
      if(!challenge||!registration||challenge.registration_id!==registration.id)throw confirmationUnavailable();
      if(challenge.expires_at.getTime()<=this.now())throw confirmationUnavailable();
      if(registration.state==='CONFIRMED'&&challenge.confirmed)return PrelaunchConfirmationSchema.parse({...this.view(registration),managementToken:this.managementToken(registration.id,registration.management_nonce)});
      if(registration.state!=='PENDING'||challenge.used_at)throw confirmationUnavailable();
      if(campaign.admissions>=campaign.capacity)throw new DomainError('NOT_AVAILABLE',409,'This campaign is full');
      if(this.state(campaign)!=='OPEN')throw confirmationUnavailable();
      const at=new Date(this.now()),updated=(await db.query<RegistrationRow>("UPDATE prelaunch_registrations SET state='CONFIRMED',version=version+1,confirmed_at=$2 WHERE id=$1 RETURNING *",[registration.id,at])).rows[0];
      await db.query('UPDATE prelaunch_challenges SET used_at=$2,confirmed=true WHERE id=$1',[challenge.id,at]);
      await db.query('UPDATE prelaunch_campaigns SET admissions=admissions+1,changed_at=$2 WHERE id=$1',[campaign.id,at]);
      await this.consent(db,registration.id,'email.confirmed');
      await db.query("INSERT INTO prelaunch_outbox(id,registration_id,kind,next_attempt_at,created_at) VALUES($1,$2,'confirmed',$3,$3)",[randomUUID(),registration.id,at]);
      await this.audit(db,campaign.id,registration.id,'email.confirmed');
      return PrelaunchConfirmationSchema.parse({...this.view(updated),managementToken:this.managementToken(updated.id,updated.management_nonce)});
    });
  }

  async manage(token:string){
    if(!/^[a-f0-9]{64}$/.test(token))throw confirmationUnavailable();
    return this.view(await this.registrationByManagement(this.identity.pool,token));
  }

  async withdraw(token:string,input:unknown){
    if(!/^[a-f0-9]{64}$/.test(token))throw confirmationUnavailable();
    const value=PrelaunchWithdrawSchema.parse(input),initial=await this.registrationByManagement(this.identity.pool,token);
    return this.tx(async db=>{
      const campaign=await this.campaignRow(db,initial.campaign_id,true);
      const registration=await this.registrationByManagement(db,token,true);
      if(registration.campaign_id!==campaign.id)throw confirmationUnavailable();
      const fingerprint=this.requestFingerprint({campaignId:campaign.id,requestId:value.requestId,operation:'withdraw',registrationId:registration.id,expectedVersion:value.expectedVersion});
      const prior=(await db.query<RequestRow>('SELECT operation,registration_id,fingerprint FROM prelaunch_requests WHERE campaign_id=$1 AND request_id=$2',[campaign.id,value.requestId])).rows[0];
      if(prior){
        if(prior.operation!=='withdraw'||prior.registration_id!==registration.id||prior.fingerprint!==fingerprint)throw stale();
        return this.view(registration);
      }
      if(registration.version!==value.expectedVersion)throw stale();
      if(registration.state==='WITHDRAWN'||registration.state==='SUPPRESSED'){
        await this.rememberRequest(db,campaign.id,value.requestId,'withdraw',registration.id,registration.email_hash,fingerprint);
        return this.view(registration);
      }
      const at=new Date(this.now()),updated=(await db.query<RegistrationRow>("UPDATE prelaunch_registrations SET state='WITHDRAWN',version=version+1,withdrawn_at=$2 WHERE id=$1 RETURNING *",[registration.id,at])).rows[0];
      await db.query('UPDATE prelaunch_challenges SET used_at=$2 WHERE registration_id=$1 AND used_at IS NULL',[registration.id,at]);
      await db.query("UPDATE prelaunch_outbox SET state='CANCELED',locked_until=NULL WHERE registration_id=$1 AND state IN ('PENDING','SENDING')",[registration.id]);
      await this.consent(db,registration.id,'registration.withdrawn');
      await this.audit(db,campaign.id,registration.id,'registration.withdrawn');
      await this.rememberRequest(db,campaign.id,value.requestId,'withdraw',registration.id,registration.email_hash,fingerprint);
      return this.view(updated);
    });
  }

  async maintain(){
    const at=new Date(this.now());
    return this.tx(async db=>{
      const requests=await db.query('DELETE FROM prelaunch_requests WHERE campaign_id IN (SELECT campaign_id FROM prelaunch_requests WHERE retain_until<=$1 ORDER BY retain_until LIMIT 100) AND retain_until<=$1',[at]);
      const limits=await db.query('DELETE FROM prelaunch_rate_limits WHERE bucket IN (SELECT bucket FROM prelaunch_rate_limits WHERE touched_at<$1 ORDER BY touched_at LIMIT 100)',[new Date(at.getTime()-DAY)]);
      const challenges=await db.query('UPDATE prelaunch_challenges SET used_at=expires_at WHERE id IN (SELECT id FROM prelaunch_challenges WHERE used_at IS NULL AND expires_at<=$1 ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)',[at]);
      const recycled=await db.query("UPDATE prelaunch_outbox SET state='PENDING',locked_until=NULL WHERE id IN (SELECT id FROM prelaunch_outbox WHERE state='SENDING' AND locked_until<=$1 ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED)",[at]);
      return {requests:requests.rowCount??0,limits:limits.rowCount??0,challenges:challenges.rowCount??0,recycled:recycled.rowCount??0};
    });
  }

  async drain(){
    await this.maintain();
    const at=new Date(this.now()),lockedUntil=new Date(at.getTime()+120000);
    const claimed=await this.tx(async db=>(await db.query<OutboxRow>(`WITH due AS (
      SELECT id FROM prelaunch_outbox WHERE state='PENDING' AND next_attempt_at<=$1
      ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED
    ) UPDATE prelaunch_outbox o SET state='SENDING',attempts=attempts+1,locked_until=$2
      FROM due WHERE o.id=due.id RETURNING o.*`,[at,lockedUntil])).rows);
    const result={sent:0,failed:0,suppressed:0,canceled:0};
    for(const row of claimed){
      try{
        const delivery=(await this.identity.pool.query<DeliveryRow>(`SELECT o.*,r.email_hash,r.email_sealed,r.email_key_id,r.state AS registration_state,
          ch.server_nonce AS challenge_nonce,ch.used_at AS challenge_used_at
          FROM prelaunch_outbox o JOIN prelaunch_registrations r ON r.id=o.registration_id
          LEFT JOIN prelaunch_challenges ch ON ch.id=o.challenge_id WHERE o.id=$1`,[row.id])).rows[0];
        if(!delivery)throw Error('Prelaunch outbox target unavailable');
        if(delivery.registration_state==='WITHDRAWN'||delivery.registration_state==='SUPPRESSED'||
          delivery.kind==='confirmed'&&delivery.registration_state!=='CONFIRMED'||
          delivery.kind==='confirmation'&&delivery.challenge_used_at){
          await this.identity.pool.query("UPDATE prelaunch_outbox SET state='CANCELED',locked_until=NULL WHERE id=$1 AND state='SENDING'",[delivery.id]);result.canceled++;continue;
        }
        if((await this.identity.pool.query('SELECT 1 FROM prelaunch_suppressions WHERE email_hash=$1',[delivery.email_hash])).rowCount){
          await this.markSuppressed(delivery);result.suppressed++;continue;
        }
        if(delivery.email_key_id!==this.cipher.keyId)throw Error('Prelaunch email key mismatch');
        const email=this.cipher.open(delivery.email_sealed);
        if(this.cipher.lookup(email)!==delivery.email_hash)throw Error('Prelaunch email binding mismatch');
        const confirmationToken=delivery.kind==='confirmation'?this.confirmationToken(delivery.registration_id,delivery.challenge_nonce!):undefined;
        await this.mail.send({
          kind:delivery.kind,
          idempotencyKey:delivery.id,
          to:email,
          subject:delivery.kind==='confirmation'?'Confirm your Aetheria preregistration':'Aetheria preregistration confirmed',
          text:delivery.kind==='confirmation'?'Enter this single-use code in the private confirmation page: '+confirmationToken:'Your preregistration is confirmed. Keep this message for your private management code.',
        });
        const sent=new Date(this.now());
        await this.identity.pool.query("UPDATE prelaunch_outbox SET state='SENT',sent_at=$2,locked_until=NULL WHERE id=$1 AND state='SENDING'",[delivery.id,sent]);
        result.sent++;
      }catch{
        const attempts=row.attempts,delay=Math.min(15*60000,1000*2**Math.max(0,attempts-1)),next=new Date(this.now()+delay);
        await this.identity.pool.query("UPDATE prelaunch_outbox SET state=$2,next_attempt_at=$3,locked_until=NULL WHERE id=$1 AND state='SENDING'",[row.id,attempts>=MAX_OUTBOX_ATTEMPTS?'FAILED':'PENDING',next]);
        result.failed++;
      }
    }
    return result;
  }

  private async markSuppressed(delivery:DeliveryRow){
    await this.tx(async db=>{
      const campaignId=(await db.query<{campaign_id:string}>('SELECT campaign_id FROM prelaunch_registrations WHERE id=$1',[delivery.registration_id])).rows[0].campaign_id;
      const campaign=await this.campaignRow(db,campaignId,true);
      const registration=(await db.query<RegistrationRow>('SELECT * FROM prelaunch_registrations WHERE id=$1 FOR UPDATE',[delivery.registration_id])).rows[0];
      const at=new Date(this.now());
      if(registration.state==='PENDING'||registration.state==='CONFIRMED')await db.query("UPDATE prelaunch_registrations SET state='SUPPRESSED',version=version+1,suppressed_at=$2 WHERE id=$1",[registration.id,at]);
      await db.query("UPDATE prelaunch_outbox SET state='SUPPRESSED',locked_until=NULL WHERE id=$1 AND state='SENDING'",[delivery.id]);
      await db.query('UPDATE prelaunch_challenges SET used_at=$2 WHERE registration_id=$1 AND used_at IS NULL',[registration.id,at]);
      await this.audit(db,campaign.id,registration.id,'mail.suppressed');
    });
  }

  async operatorSummary(operatorToken:string,input:unknown){
    if(!this.operator)throw unavailable();
    const value=OperatorPrelaunchQuerySchema.parse(input);
    return this.operator.controlRead(operatorToken,async db=>{
      const campaign=await this.campaignRow(db,value.campaignId);
      const counts=(await db.query<{pending:number;withdrawn:number;suppressed:number}>("SELECT count(*) FILTER(WHERE state='PENDING')::int AS pending,count(*) FILTER(WHERE state='WITHDRAWN')::int AS withdrawn,count(*) FILTER(WHERE state='SUPPRESSED')::int AS suppressed FROM prelaunch_registrations WHERE campaign_id=$1",[campaign.id])).rows[0];
      const outbox=(await db.query<{pending:number;sent:number;failed:number;suppressed:number}>("SELECT count(*) FILTER(WHERE state IN ('PENDING','SENDING'))::int AS pending,count(*) FILTER(WHERE state='SENT')::int AS sent,count(*) FILTER(WHERE state='FAILED')::int AS failed,count(*) FILTER(WHERE state='SUPPRESSED')::int AS suppressed FROM prelaunch_outbox WHERE registration_id IN(SELECT id FROM prelaunch_registrations WHERE campaign_id=$1)",[campaign.id])).rows[0];
      const recentAudit=(await db.query<{action:'registration.requested'|'email.confirmed'|'registration.withdrawn'|'mail.suppressed';actor:'system'|'operator'|'owner';occurred_at:Date}>('SELECT action,actor,occurred_at FROM prelaunch_audit WHERE campaign_id=$1 ORDER BY sequence DESC LIMIT 20',[campaign.id])).rows.map(row=>({action:row.action,actor:row.actor,occurredAt:row.occurred_at.toISOString()}));
      return OperatorPrelaunchSummarySchema.parse({schemaVersion:1,campaignId:campaign.id,slug:campaign.slug,state:this.state(campaign),capacity:campaign.capacity,confirmed:campaign.admissions,remaining:campaign.capacity-campaign.admissions,pending:counts.pending,withdrawn:counts.withdrawn,suppressed:counts.suppressed,outbox,recentAudit});
    });
  }
}
