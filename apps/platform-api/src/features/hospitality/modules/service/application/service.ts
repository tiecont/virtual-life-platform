import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { OrderPickUpSchema,StaffStateSchema,StaffStoppedSchema,StaffShiftRoleSchema,OrderRefusedSchema, OrderCompleteSchema, HospitalityMenuSchema, OrderWorkflowStrategySchema, StaffShiftStartSchema, StaffShiftResultSchema, StaffShiftViewSchema, OrderPlaceSchema, OrderMutationSchema, OrderQueueSchema, OrderPageSchema, OrderResultSchema, OrderViewSchema, type OrderPhase, type HospitalityPolicy, type OrderWorkflowStrategy } from '@virtual-city/contracts';
import type { IdentityService, IdentityContext } from '../../../../identity/modules/accounts/application/service';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import type { SocialService } from '../../../../social/modules/relationships/application/service';
import { DomainError } from '../../../../../shared/common/errors';
import { nextOrderPhase } from '../domain/lifecycle';
import { advanceService, type ServiceAction } from '../domain/workflow';
import { OrderPhaseSchema } from '@virtual-city/contracts';
import { OrderReadySchema } from '@virtual-city/contracts';
import { preparationFor,verifyPreparation,canRestartPreparation } from '../domain/preparation';
type Row = { id: string; customer_id: string; assignee_id: string | null; customer_epoch: string; customer_membership_id: string; world_slug: string; room_id: string; item_key: string; policy_version: string; phase: OrderPhase; version: number; created_at: Date; updated_at: Date; workflow: OrderWorkflowStrategy | null; course_index: number; ready_at: Date | null };
type Shift = { id: string;role_key:string; account_id: string; world_slug: string; room_id: string; owner_epoch: string; membership_id: string; policy_version: string; started_at: Date; expires_at: Date; interrupted_at: Date | null; ended_at: Date | null; reason: 'voluntary' | 'disconnected' | 'visit-ended' | 'restart' | 'expired' | 'restricted' | null };
type Context = { worldSlug: string; roomId: string; seatId: string | null; epoch: string; membershipId: string; policy: HospitalityPolicy };
export interface HospitalityStaffPort { permits(db: PoolClient, actor: IdentityContext, context: Readonly<Context>): Promise<boolean> }
const uuid = z.uuid().transform(value => value.toLowerCase());
const absent = () => new DomainError('NOT_AVAILABLE', 404, 'This order is unavailable');
export class HospitalityService {
  // Read-only owner port for protected operational counts;no participant/world
  // projection or infrastructure-owned direct access to hospitality tables.
  async operationalSummary(){
    if(this.#closed)throw new DomainError('WORLD_UNAVAILABLE',503,'Order gauges unavailable');
    const db=await this.pool.connect();try{
      await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='500ms'");await db.query("SET LOCAL lock_timeout='200ms'");
      const phases=Object.fromEntries(OrderPhaseSchema.options.map(phase=>[phase,0])) as Record<OrderPhase,number>;
      const rows=await db.query<{phase:OrderPhase;n:string}>("SELECT phase,count(*)::text AS n FROM engine_hospitality_orders WHERE world_slug<>'dating' GROUP BY phase");
      for(const row of rows.rows){const n=Number(row.n);if(!Object.hasOwn(phases,row.phase)||!Number.isSafeInteger(n)||n<0)throw Error('Gauge outside bounded schema');phases[row.phase]=n;}
      await db.query('COMMIT');return {observedAt:this.now(),phases};
    }catch{await db.query('ROLLBACK');throw new DomainError('WORLD_UNAVAILABLE',503,'Order gauges unavailable');}finally{db.release();}
  }
  async permitsUniform(account:string,world:string,source:{epoch:string;roomId:string;membershipId:string},policyVersion:string) { return !!(await this.pool.query('SELECT 1 FROM engine_hospitality_shifts WHERE account_id=$1 AND world_slug=$2 AND room_id=$3 AND owner_epoch=$4 AND membership_id=$5 AND policy_version=$6 AND ended_at IS NULL AND interrupted_at IS NULL AND expires_at>$7',[account,world,source.roomId,source.epoch,source.membershipId,policyVersion,new Date(this.now())])).rowCount; }
  #maintenance?: Promise<void>; #closed = false;
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private rooms: RoomService, private social: SocialService, private staff?: HospitalityStaffPort, private now = Date.now) {}
  private async permits(db: PoolClient, actor: IdentityContext, context: Context,action?:'claim'|ServiceAction) {
    if (this.staff&&!context.policy.staffing?.roles) return this.staff.permits(db, actor, context);
    if (!context.policy.staffing) return false;
    const row=(await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 AND world_slug=$2 AND room_id=$3 AND owner_epoch=$4 AND membership_id=$5 AND policy_version=$6 AND ended_at IS NULL AND expires_at>$7 AND interrupted_at IS NULL', [actor.accountId, context.worldSlug, context.roomId, context.epoch, context.membershipId, context.policy.version, new Date(this.now())])).rows[0];if(!row)return false;
    const roles=context.policy.staffing.roles;return !roles||roles.some(role=>role.key===row.role_key&&(!action||role.actions.includes(action)));
  }
  private view(row: Row, actor: string,includePreparation=true) {
    const workflow = row.workflow ? OrderWorkflowStrategySchema.parse(row.workflow) : null,preparation=includePreparation?preparationFor({...row,workflow},actor,value=>this.identity.fingerprint(value)):undefined;
    return OrderViewSchema.parse({ schemaVersion: 1, id: row.id, phase: row.phase, version: row.version, worldSlug: row.world_slug, roomId: row.room_id, itemKey: row.item_key, policyVersion: row.policy_version, mine: row.customer_id === actor, assignedToMe: row.assignee_id === actor, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), ...(workflow ? { service: { workflowKey: workflow.key, workflowVersion: workflow.version, courseNumber: row.course_index + 1, courseCount: workflow.courses.length, coursesServed: row.course_index + (['SERVED', 'COMPLETED'].includes(row.phase) ? 1 : 0), courseLabel: workflow.courses[row.course_index].label, readyAt: row.ready_at?.toISOString() ?? null,...preparation?{preparation}:{},...workflow.handoff?{passChoices:workflow.courses.map(course=>({key:course.key,label:course.label}))}:{} } } : {}) });
  }
  private result(row: Row, actor: string) { return OrderResultSchema.parse({ schemaVersion: 1, order: this.view(row, actor) }); }
  private async tx<T>(token: string, targets: string[], work: (db: PoolClient, actor: IdentityContext) => Promise<T>) {
    if (this.#closed) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Service unavailable');
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [initial.accountId, ...targets]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private async prior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const prior = (await db.query<{ order_id: string; fingerprint: string }>('SELECT order_id,fingerprint FROM engine_hospitality_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (prior && prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    if (!prior) return null; const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1', [prior.order_id])).rows[0]; if (!row || ![row.customer_id, row.assignee_id].includes(actor)) throw absent(); return row;
  }
  private async quota(db: PoolClient, actor: string, place: boolean) {
    if ((await db.query('SELECT count(*)::int AS n FROM engine_hospitality_mutations WHERE actor_id=$1 AND created_at>$2', [actor, new Date(this.now() - 60000)])).rows[0].n >= 30) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing another order');
    if (place && (await db.query("SELECT count(*)::int AS n FROM engine_hospitality_mutations WHERE actor_id=$1 AND operation='place' AND created_at>$2", [actor, new Date(this.now() - 3600000)])).rows[0].n >= 12) throw new DomainError('RATE_LIMITED', 429, 'Please wait before placing more orders');
  }
  private remember(db: PoolClient, actor: string, key: string, row: Row, fingerprint: string, operation: string) { return db.query('INSERT INTO engine_hospitality_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, row.id, operation, fingerprint, new Date(this.now())]); }
  async place(token: string, requestKey: string, raw: unknown) {
    const input = OrderPlaceSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'order.place', input });
    const old = await this.tx(token, [], async (db, actor) => { const row = await this.prior(db, actor.accountId, key, fingerprint); return row ? this.result(row, actor.accountId) : null; }); if (old) return old;
    return this.rooms.hospitalityContext(token, input.source, true, (_actor, context, valid) => this.tx(token, [], async (db, actor) => {
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.result(prior, actor.accountId);
      if (input.policyVersion !== context.policy.version || !context.policy.itemKeys.includes(input.itemKey)) throw absent();
      const menuItem = context.policy.menu?.items.find(item => item.key === input.itemKey), workflow = menuItem ? context.policy.menu!.workflows.find(workflow => workflow.key === menuItem.workflowKey)! : null;
      if ((await db.query("SELECT 1 FROM engine_hospitality_orders WHERE customer_id=$1 AND phase NOT IN ('COMPLETED','CANCELLED')", [actor.accountId])).rowCount) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'An existing order must finish or be cancelled first');
      if ((await db.query("SELECT count(*)::int AS n FROM engine_hospitality_orders WHERE room_id=$1 AND phase NOT IN ('COMPLETED','CANCELLED')", [context.roomId])).rows[0].n >= context.policy.maxQueue) throw new DomainError('RATE_LIMITED', 429, 'The service queue is full');
      await this.quota(db, actor.accountId, true); const at = new Date(this.now());
      const row = (await db.query<Row>("INSERT INTO engine_hospitality_orders(id,customer_id,world_slug,room_id,customer_epoch,customer_membership_id,item_key,policy_version,phase,created_at,updated_at,workflow) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$9,$10) RETURNING *", [randomUUID(), actor.accountId, context.worldSlug, context.roomId, input.source.epoch, input.source.membershipId, input.itemKey, context.policy.version, at, workflow ? JSON.stringify(workflow) : null])).rows[0];
      await this.remember(db, actor.accountId, key, row, fingerprint, 'place'); if (!valid() || this.now() >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return this.result(row, actor.accountId);
    }));
  }
  async mutate(token: string, id: string, requestKey: string, action: 'claim' | 'cancel' | ServiceAction, raw: unknown) {
    id = uuid.parse(id); const key = uuid.parse(requestKey), ready=action==='ready'?OrderReadySchema.parse(raw):undefined,input=ready??OrderMutationSchema.parse(raw), fingerprint = this.identity.fingerprint({ operation: 'order.' + action, id, input });
    await this.maintain();
    const known = (await this.pool.query<{ customer_id: string }>('SELECT customer_id FROM engine_hospitality_orders WHERE id=$1', [id])).rows[0]; if (!known) { await this.identity.authenticate(token); throw absent(); }
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [known.customer_id], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || row.room_id !== context.roomId || row.world_slug !== context.worldSlug || row.customer_id !== known.customer_id) throw absent();
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.result(prior, actor.accountId);
      if (action === 'cancel' ? row.customer_id !== actor.accountId : row.customer_id === actor.accountId || !await this.permits(db, actor, context,action) || await this.social.isBlocked(actor.accountId, row.customer_id, db)) throw absent();
      if (action === 'claim' && (await db.query('SELECT 1 FROM engine_hospitality_refusals WHERE order_id=$1 AND staff_id=$2', [id, actor.accountId])).rowCount) throw absent();
      if (action !== 'cancel') { if (row.policy_version !== context.policy.version) throw absent(); await this.rooms.hospitalityCustomer(row.customer_id, { epoch: row.customer_epoch, roomId: row.room_id, membershipId: row.customer_membership_id }); }
      if (row.version !== input.expectedVersion) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Refresh this order before trying again');
      if (action !== 'claim' && action !== 'cancel' && row.assignee_id !== actor.accountId) throw absent();
      const at = this.now(); if (at < row.updated_at.getTime()) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Service clock unavailable');
      const workflow = row.workflow ? OrderWorkflowStrategySchema.parse(row.workflow) : null;
      if (action !== 'claim' && action !== 'cancel' && !workflow) throw absent();
      if(action==='ready')verifyPreparation({...row,workflow},actor.accountId,ready?.preparation,at,value=>this.identity.fingerprint(value));
      const step = action === 'claim' || action === 'cancel' ? { phase: nextOrderPhase(row.phase, action), course: row.course_index, readyAt: null } : advanceService(workflow!, action==='prepare'&&canRestartPreparation({...row,workflow},at)?'ASSIGNED':row.phase, row.course_index, row.ready_at?.getTime() ?? null, action, at);
      await this.quota(db, actor.accountId, false);
      if (action === 'claim' && (await db.query("SELECT count(*)::int AS n FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('ASSIGNED','PREPARING','READY')", [actor.accountId])).rows[0].n >= context.policy.maxActivePerStaff) throw new DomainError('NOT_AVAILABLE', 409, 'Your service queue is full');
      if (action === 'serve') await db.query('INSERT INTO engine_hospitality_courses VALUES($1,$2,$3,$4,$5)', [id, row.course_index, workflow!.courses[row.course_index].key, new Date(at), row.version + 1]);
      const nextKitchen=action==='serve'&&!!workflow?.handoff&&step.phase==='ASSIGNED';
      const updated = (await db.query<Row>('UPDATE engine_hospitality_orders SET phase=$2,assignee_id=$3,version=version+1,updated_at=$4,course_index=$5,ready_at=$6 WHERE id=$1 RETURNING *', [id, nextKitchen?'PENDING':step.phase, action === 'claim' ? actor.accountId : action === 'cancel'||nextKitchen ? null : row.assignee_id, new Date(at), step.course, step.readyAt === null ? null : new Date(step.readyAt)])).rows[0];
      await this.remember(db, actor.accountId, key, updated, fingerprint, action); if(action==='ready')verifyPreparation({...row,workflow},actor.accountId,ready?.preparation,this.now(),value=>this.identity.fingerprint(value)); if (!valid() || this.now() >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return this.result(updated, actor.accountId);
    }));
  }
  menu(token: string, raw: unknown) {
    const input = OrderQueueSchema.parse(raw);
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [], async () => {
      if (!context.policy.menu || !valid()) throw absent();
      return HospitalityMenuSchema.parse({ schemaVersion: 1, policyVersion: context.policy.version, items: context.policy.menu.items.map(item => ({ key: item.key, label: item.label, courseCount: context.policy.menu!.workflows.find(workflow => workflow.key === item.workflowKey)!.courses.length })) });
    }));
  }
  async pickUp(token:string,id:string,requestKey:string,raw:unknown){
    id=uuid.parse(id);const input=OrderPickUpSchema.parse(raw),key=uuid.parse(requestKey),fingerprint=this.identity.fingerprint({operation:'order.pick-up',id,input});await this.identity.authenticate(token);await this.maintain();
    const known=(await this.pool.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1',[id])).rows[0];if(!known)throw absent();
    return this.rooms.hospitalityContext(token,input.source,false,(_actor,context,valid)=>this.tx(token,[known.customer_id,...known.assignee_id?[known.assignee_id]:[]],async(db,actor)=>{
      const row=(await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||row.room_id!==context.roomId||row.world_slug!==context.worldSlug||row.policy_version!==context.policy.version||row.customer_id===actor.accountId||!await this.permits(db,actor,context,'serve'))throw absent();
      const prior=await this.prior(db,actor.accountId,key,fingerprint);if(prior)return this.result(prior,actor.accountId);
      if(row.assignee_id!==known.assignee_id||!row.assignee_id||row.assignee_id===actor.accountId||row.version!==input.expectedVersion||row.phase!=='READY'||!row.workflow)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Refresh the kitchen pass');const workflow=OrderWorkflowStrategySchema.parse(row.workflow),handoff=workflow.handoff;if(!handoff)throw absent();
      const server=(await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 AND ended_at IS NULL',[actor.accountId])).rows[0],kitchen=(await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 AND ended_at IS NULL',[row.assignee_id])).rows[0];
      if(!server||server.role_key!==handoff.toRole||!kitchen||kitchen.role_key!==handoff.fromRole||kitchen.interrupted_at||kitchen.world_slug!==context.worldSlug||kitchen.room_id!==context.roomId||kitchen.owner_epoch!==context.epoch||kitchen.policy_version!==context.policy.version||kitchen.expires_at.getTime()<=this.now())throw absent();
      if(await this.social.isBlocked(actor.accountId,row.customer_id,db)||await this.social.isBlocked(actor.accountId,kitchen.account_id,db)||await this.social.isBlocked(kitchen.account_id,row.customer_id,db))throw absent();
      const customer={epoch:row.customer_epoch,roomId:row.room_id,membershipId:row.customer_membership_id},worker={epoch:kitchen.owner_epoch,roomId:kitchen.room_id,membershipId:kitchen.membership_id};await this.rooms.hospitalityCustomer(row.customer_id,customer);await this.rooms.hospitalityWorker(kitchen.account_id,worker);
      if(workflow.courses[row.course_index]?.key!==input.courseKey)throw new DomainError('NOT_AVAILABLE',409,'That course does not match the kitchen call');const at=this.now();if(at<row.updated_at.getTime()||row.ready_at===null||at<row.ready_at.getTime())throw new DomainError('NOT_AVAILABLE',409,'The kitchen pass is not ready');
      if((await db.query("SELECT count(*)::int AS n FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('ASSIGNED','PREPARING','READY')",[actor.accountId])).rows[0].n>=context.policy.maxActivePerStaff)throw new DomainError('NOT_AVAILABLE',409,'Your service queue is full');await this.quota(db,actor.accountId,false);
      const updated=(await db.query<Row>('UPDATE engine_hospitality_orders SET assignee_id=$2,version=version+1,updated_at=$3 WHERE id=$1 RETURNING *',[id,actor.accountId,new Date(at)])).rows[0];await this.remember(db,actor.accountId,key,updated,fingerprint,'pick-up');await this.rooms.hospitalityWorker(kitchen.account_id,worker);await this.rooms.hospitalityCustomer(row.customer_id,customer);if(!valid()||this.now()>=actor.expiresAt||this.now()>=kitchen.expires_at.getTime())throw absent();return this.result(updated,actor.accountId);
    }));
  }
  ownOrders(token:string){return this.tx(token,[],async(db,actor)=>{const rows=(await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE customer_id=$1 ORDER BY creation_order DESC LIMIT 21',[actor.accountId])).rows;return OrderPageSchema.parse({schemaVersion:1,items:rows.slice(0,20).map(row=>this.view(row,actor.accountId)),truncated:rows.length>20});});}
  async complete(token: string, id: string, requestKey: string, raw: unknown) {
    id = uuid.parse(id); const key = uuid.parse(requestKey), input = OrderCompleteSchema.parse(raw), fingerprint = this.identity.fingerprint({ operation: 'order.complete', id, input });
    const known = (await this.pool.query<{ assignee_id: string | null }>('SELECT assignee_id FROM engine_hospitality_orders WHERE id=$1', [id])).rows[0];
    return this.tx(token, known?.assignee_id ? [known.assignee_id] : [], async (db, actor) => {
      const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 AND customer_id=$2 FOR UPDATE', [id, actor.accountId])).rows[0]; if (!row) throw absent();
      const prior = await this.prior(db, actor.accountId, key, fingerprint); if (prior) return this.result(prior, actor.accountId);
      if (row.phase === 'COMPLETED') return this.result(row, actor.accountId);
      if (row.version !== input.expectedVersion || !row.workflow || !row.assignee_id || row.assignee_id !== known?.assignee_id) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Refresh this order');
      const workflow = OrderWorkflowStrategySchema.parse(row.workflow), count = (await db.query('SELECT count(*)::int AS n FROM engine_hospitality_courses WHERE order_id=$1', [id])).rows[0].n;
      if (count !== workflow.courses.length || row.course_index !== count - 1) throw new DomainError('NOT_AVAILABLE', 409, 'Service has not finished');
      const phase = nextOrderPhase(row.phase, 'complete'), at = new Date(this.now()); if (at < row.updated_at) throw new DomainError('WORLD_UNAVAILABLE', 503, 'Service clock unavailable'); await this.quota(db, actor.accountId, false);
      const updated = (await db.query<Row>('UPDATE engine_hospitality_orders SET phase=$2,version=version+1,updated_at=$3 WHERE id=$1 RETURNING *', [id, phase, at])).rows[0], eventId = randomUUID();
      await db.query('INSERT INTO engine_hospitality_completions VALUES($1,$2,$3)', [eventId, id, at]); await db.query('INSERT INTO engine_hospitality_outbox(event_id) VALUES($1)', [eventId]); await this.remember(db, actor.accountId, key, updated, fingerprint, 'complete'); return this.result(updated, actor.accountId);
    });
  }
  async withdrawContact(db: PoolClient, a: string, b: string) {
    if (!await this.social.isBlocked(a, b, db)) return;
    await db.query("UPDATE engine_hospitality_orders SET phase='PENDING',assignee_id=NULL,ready_at=NULL,version=version+1,updated_at=greatest(updated_at,$3) WHERE ((customer_id=$1 AND assignee_id=$2) OR (customer_id=$2 AND assignee_id=$1)) AND phase IN ('ASSIGNED','PREPARING','READY')", [a, b, new Date(this.now())]);
  }
  async withdraw(token: string, id: string, requestKey: string, raw: unknown, refuse: boolean) {
    id = uuid.parse(id); const input = OrderCompleteSchema.parse(raw), key = uuid.parse(requestKey), operation = refuse ? 'refuse' : 'withdraw', fingerprint = this.identity.fingerprint({ operation: 'order.' + operation, id, input });
    const initial = await this.identity.authenticate(token);
    return this.rooms.hospitalityRecovery(async () => {
      const known = (await this.pool.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1', [id])).rows[0];
      return this.tx(token, known ? [known.customer_id, ...(known.assignee_id ? [known.assignee_id] : [])] : [], async (db, actor) => {
        const prior = (await db.query<{ fingerprint: string }>('SELECT fingerprint FROM engine_hospitality_mutations WHERE actor_id=$1 AND request_id=$2', [actor.accountId, key])).rows[0];
        if (prior && prior.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
        if (prior && refuse) return OrderRefusedSchema.parse({ schemaVersion: 1, refused: true });
        const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!row || (refuse ? row.assignee_id !== actor.accountId : row.customer_id !== actor.accountId) || actor.accountId !== initial.accountId) throw absent();
        if (prior) return this.result(row, actor.accountId);
        if (row.version !== input.expectedVersion || !(refuse ? ['ASSIGNED', 'PREPARING', 'READY'] : ['PENDING', 'ASSIGNED', 'PREPARING', 'READY']).includes(row.phase)) throw new DomainError('NOT_AVAILABLE', 409, 'Refresh this order');
        await this.quota(db, actor.accountId, false);
        if (refuse) await db.query('INSERT INTO engine_hospitality_refusals VALUES($1,$2,$3)', [id, actor.accountId, new Date(this.now())]);
        const updated = (await db.query<Row>("UPDATE engine_hospitality_orders SET phase=$2,assignee_id=NULL,ready_at=NULL,version=version+1,updated_at=greatest(updated_at,$3) WHERE id=$1 RETURNING *", [id, refuse ? 'PENDING' : 'CANCELLED', new Date(this.now())])).rows[0];
        await this.remember(db, actor.accountId, key, updated, fingerprint, operation); return refuse ? OrderRefusedSchema.parse({ schemaVersion: 1, refused: true }) : this.result(updated, actor.accountId);
      });
    });
  }
  get(token: string, id: string) { id = uuid.parse(id); return this.tx(token, [], async (db, actor) => { const row = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE id=$1 AND (customer_id=$2 OR assignee_id=$2)', [id, actor.accountId])).rows[0]; if (!row) throw absent(); return this.result(row, actor.accountId); }); }
  async queue(token: string, raw: unknown) {
    const input = OrderQueueSchema.parse(raw);
    await this.maintain();
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [], async (db, actor) => {
      if (!await this.permits(db, actor, context)) throw absent();
      const role=(await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 AND ended_at IS NULL',[actor.accountId])).rows[0];
      const rows = (await db.query<Row>("SELECT * FROM engine_hospitality_orders o WHERE room_id=$1 AND (phase='PENDING' OR assignee_id=$2 OR (phase='READY' AND workflow->'handoff'->>'toRole'=$3)) AND phase NOT IN ('COMPLETED','CANCELLED') AND NOT EXISTS(SELECT 1 FROM engine_hospitality_refusals r WHERE r.order_id=o.id AND r.staff_id=$2) ORDER BY creation_order LIMIT 51", [context.roomId, actor.accountId,role?.role_key??null])).rows, items = [];
      for (const row of rows.slice(0, 50)) if (!await this.social.isBlocked(actor.accountId, row.customer_id, db)&&(!row.assignee_id||!await this.social.isBlocked(actor.accountId,row.assignee_id,db))) items.push(this.view(row, actor.accountId));
      if (!valid()) throw absent(); return OrderPageSchema.parse({ schemaVersion: 1, items, truncated: rows.length > 50 });
    }));
  }
  async exportAccount(id: string, db: PoolClient) { const rows = (await db.query<Row>('SELECT * FROM engine_hospitality_orders WHERE customer_id=$1 OR assignee_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows, shifts = (await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 101', [id])).rows, refusals = (await db.query<{ order_id: string; created_at: Date }>('SELECT order_id,created_at FROM engine_hospitality_refusals WHERE staff_id=$1 ORDER BY created_at DESC,order_id LIMIT 101', [id])).rows; return { schemaVersion: 1, items: rows.slice(0, 100).map(row => this.view(row, id,false)), truncated: rows.length > 100, shifts: shifts.slice(0, 100).map(row => this.shiftView(row)), shiftsTruncated: shifts.length > 100, refusals: refusals.slice(0, 100).map(row => ({ orderId: row.order_id, createdAt: row.created_at.toISOString() })), refusalsTruncated: refusals.length > 100 }; }
  async redactAccount(id: string, db: PoolClient) {
    // Retain the customer's service request without retaining a deleted staff identity.
    await db.query("DELETE FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('SERVED','COMPLETED')", [id]);
    await db.query("UPDATE engine_hospitality_orders SET assignee_id=NULL,phase='PENDING',version=version+1,ready_at=NULL,updated_at=greatest(updated_at,$2) WHERE assignee_id=$1", [id, new Date(this.now())]);
  }
  private shiftView(row: Shift) { return StaffShiftViewSchema.parse({ schemaVersion: 1, id: row.id, worldSlug: row.world_slug, roomId: row.room_id, phase: row.ended_at ? 'ended' : row.interrupted_at ? 'interrupted' : 'active', startedAt: row.started_at.toISOString(), expiresAt: row.expires_at.toISOString(), interruptedAt: row.interrupted_at?.toISOString() ?? null, endsAt: row.ended_at?.toISOString() ?? null, reason: row.reason,...row.role_key!=='staff'?{role:row.role_key}:{} }); }
  private shiftResult(row: Shift | null) { return StaffShiftResultSchema.parse({ schemaVersion: 1, shift: row ? this.shiftView(row) : null }); }
  private async shiftPrior(db: PoolClient, actor: string, key: string, fingerprint: string) {
    const receipt = (await db.query<{ fingerprint: string; shift_id: string }>('SELECT fingerprint,shift_id FROM engine_hospitality_shift_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
    if (receipt && receipt.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
    return receipt ? (await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE id=$1 AND account_id=$2', [receipt.shift_id, actor])).rows[0] ?? null : null;
  }
  private async shiftBudget(db: PoolClient, actor: string) { if ((await db.query('SELECT count(*)::int AS n FROM engine_hospitality_shift_mutations WHERE actor_id=$1 AND created_at>$2', [actor, new Date(this.now() - 3600000)])).rows[0].n >= 24) throw new DomainError('RATE_LIMITED', 429, 'Please wait before changing your shift'); }
  private shiftRemember(db: PoolClient, actor: string, key: string, id: string, fingerprint: string, operation: 'start' | 'end'|'role') { return db.query('INSERT INTO engine_hospitality_shift_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, id, fingerprint, operation, new Date(this.now())]); }
  private async staffRevision(db:Pick<Pool,'query'>,account:string){return (await db.query<{revision:number}>('SELECT revision FROM engine_hospitality_consent WHERE account_id=$1',[account])).rows[0]?.revision??0;}
  private async advanceStaffRevision(db:PoolClient,account:string){return (await db.query<{revision:number}>('INSERT INTO engine_hospitality_consent VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=engine_hospitality_consent.revision+1 RETURNING revision',[account])).rows[0].revision;}
  private async roleInput(db:PoolClient,actor:IdentityContext,context:Context,input:{role?:string;expectedRevision?:number}){const roles=context.policy.staffing?.roles;if(roles){if(!roles.some(role=>role.key===input.role)||input.expectedRevision!==await this.staffRevision(db,actor.accountId))throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Refresh your role and consent before trying again');return input.role!;}if(input.role!==undefined||input.expectedRevision!==undefined)throw new DomainError('INVALID_REQUEST',422,'This world does not offer role fields');return 'staff';}
  async startShift(token: string, requestKey: string, raw: unknown) {
    const input = StaffShiftStartSchema.parse(raw), key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'shift.start', input }); await this.maintain();
    const old = await this.tx(token, [], async (db, actor) => { const prior = await this.shiftPrior(db, actor.accountId, key, fingerprint); return prior ? this.shiftResult(prior) : null; }); if (old) return old;
    return this.rooms.hospitalityContext(token, input.source, false, (_actor, context, valid) => this.tx(token, [], async (db, actor) => {
      const prior = await this.shiftPrior(db, actor.accountId, key, fingerprint); if (prior) return this.shiftResult(prior);
      const role=await this.roleInput(db,actor,context,input);
      if (!context.policy.staffing || input.policyVersion !== context.policy.version) throw absent();
      if ((await db.query('SELECT 1 FROM engine_hospitality_shifts WHERE account_id=$1 AND ended_at IS NULL', [actor.accountId])).rowCount) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'End your current shift first');
      if ((await db.query('SELECT count(*)::int AS n FROM engine_hospitality_shifts WHERE room_id=$1 AND ended_at IS NULL', [context.roomId])).rows[0].n >= context.policy.staffing.maxStaff) throw new DomainError('NOT_AVAILABLE', 409, 'Staff capacity is full');
      await this.shiftBudget(db, actor.accountId); const at = new Date(this.now()), row = (await db.query<Shift>('INSERT INTO engine_hospitality_shifts(id,account_id,world_slug,room_id,owner_epoch,membership_id,policy_version,started_at,expires_at,role_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [randomUUID(), actor.accountId, context.worldSlug, context.roomId, context.epoch, context.membershipId, context.policy.version, at, new Date(at.getTime() + 4 * 3600000),role])).rows[0];
      if(context.policy.staffing.roles)await this.advanceStaffRevision(db,actor.accountId);
      await this.shiftRemember(db, actor.accountId, key, row.id, fingerprint, 'start'); if (!valid() || this.now() >= actor.expiresAt) throw new DomainError('NOT_IN_ROOM', 409, 'Your visit changed'); return this.shiftResult(row);
    }));
  }
  private requeue(db: PoolClient, account: string) { return db.query("UPDATE engine_hospitality_orders SET phase='PENDING',assignee_id=NULL,ready_at=NULL,version=version+1,updated_at=greatest(updated_at,$2) WHERE assignee_id=$1 AND phase IN ('ASSIGNED','PREPARING','READY')", [account, new Date(this.now())]); }
  private async customers(account: string) { return (await this.pool.query<{ customer_id: string }>("SELECT customer_id FROM engine_hospitality_orders WHERE assignee_id=$1 AND phase IN ('ASSIGNED','PREPARING','READY')", [account])).rows.map(row => row.customer_id); }
  async endShift(token: string, id: string, requestKey: string) {
    id = uuid.parse(id); const key = uuid.parse(requestKey), fingerprint = this.identity.fingerprint({ operation: 'shift.end', id }), initial = await this.identity.authenticate(token);
    // No current-room admission is needed to withdraw from one's own voluntary work.
    return this.rooms.hospitalityRecovery(async () => this.tx(token, await this.customers(initial.accountId), async (db, actor) => {
      const prior = await this.shiftPrior(db, actor.accountId, key, fingerprint); if (prior) return this.shiftResult(prior);
      const row = (await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE id=$1 AND account_id=$2 FOR UPDATE', [id, actor.accountId])).rows[0]; if (!row) throw absent();
      await this.shiftBudget(db, actor.accountId);
      if (!row.ended_at) { await this.requeue(db, actor.accountId);await this.advanceStaffRevision(db,actor.accountId); row.ended_at = new Date(this.now()); row.reason = 'voluntary'; await db.query('UPDATE engine_hospitality_shifts SET ended_at=$2,reason=$3 WHERE id=$1', [id, row.ended_at, row.reason]); }
      await this.shiftRemember(db, actor.accountId, key, id, fingerprint, 'end'); return this.shiftResult(row);
    }));
  }
  async currentShift(token: string) { await this.identity.authenticate(token); await this.maintain(); return this.tx(token, [], async (db, actor) => this.shiftResult((await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 1', [actor.accountId])).rows[0] ?? null)); }
  async staffState(token:string){await this.identity.authenticate(token);await this.maintain();return this.tx(token,[],async(db,actor)=>StaffStateSchema.parse({...this.shiftResult((await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE account_id=$1 ORDER BY creation_order DESC LIMIT 1',[actor.accountId])).rows[0]??null),revision:await this.staffRevision(db,actor.accountId)}));}
  async changeRole(token:string,id:string,requestKey:string,raw:unknown){
    id=uuid.parse(id);const input=StaffShiftRoleSchema.parse(raw),key=uuid.parse(requestKey),fingerprint=this.identity.fingerprint({operation:'shift.role',id,input}),initial=await this.identity.authenticate(token);await this.maintain();
    const old=await this.tx(token,[],async(db,actor)=>{const prior=await this.shiftPrior(db,actor.accountId,key,fingerprint);return prior?this.shiftResult(prior):null;});if(old)return old;
    return this.rooms.hospitalityContext(token,input.source,false,async(_actor,context,valid)=>this.tx(token,await this.customers(initial.accountId),async(db,actor)=>{
      const prior=await this.shiftPrior(db,actor.accountId,key,fingerprint);if(prior)return this.shiftResult(prior);if(!context.policy.staffing?.roles||input.policyVersion!==context.policy.version)throw absent();const role=await this.roleInput(db,actor,context,input),row=(await db.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,actor.accountId])).rows[0];
      if(!row||row.ended_at||row.interrupted_at||row.expires_at.getTime()<=this.now()||row.world_slug!==context.worldSlug||row.room_id!==context.roomId||row.owner_epoch!==context.epoch||row.membership_id!==context.membershipId||row.policy_version!==context.policy.version)throw absent();await this.shiftBudget(db,actor.accountId);if(row.role_key!==role){await this.requeue(db,actor.accountId);row.role_key=role;await db.query('UPDATE engine_hospitality_shifts SET role_key=$2 WHERE id=$1',[id,role]);}await this.advanceStaffRevision(db,actor.accountId);await this.shiftRemember(db,actor.accountId,key,id,fingerprint,'role');if(!valid()||this.now()>=actor.expiresAt)throw absent();return this.shiftResult(row);
    }));
  }
  async stopStaff(token:string){const initial=await this.identity.authenticate(token);return this.rooms.hospitalityRecovery(async()=>this.tx(token,await this.customers(initial.accountId),async(db,actor)=>{const revision=await this.advanceStaffRevision(db,actor.accountId);await this.requeue(db,actor.accountId);await db.query("UPDATE engine_hospitality_shifts SET ended_at=greatest(started_at,$2),reason='voluntary' WHERE account_id=$1 AND ended_at IS NULL",[actor.accountId,new Date(this.now())]);return StaffStoppedSchema.parse({schemaVersion:1,stopped:true,revision});}));}
  maintain() {
    if (this.#closed) return Promise.resolve(); if (this.#maintenance) return this.#maintenance;
    this.#maintenance = this.rooms.hospitalityRecovery(async visit => {
      // Always put unseen/oldest rows first so healthy shifts cannot starve interrupted work.
      const shifts = (await this.pool.query<Shift>('SELECT * FROM engine_hospitality_shifts WHERE ended_at IS NULL ORDER BY checked_order,creation_order LIMIT 20')).rows;
      for (const row of shifts) {
        const lease = visit(row.account_id, { epoch: row.owner_epoch, roomId: row.room_id, membershipId: row.membership_id }), at = this.now();
        const interrupted = lease.state === 'grace' ? lease.disconnectedAt ?? at : null;
        const restricted = !await this.rooms.hospitalityAllowed(row.account_id, row.world_slug, row.room_id) || lease.state === 'connected' && !await this.identity.hasConnectedSession(row.account_id, lease.sessionIds);
        const reason: Shift['reason'] = at >= row.expires_at.getTime() ? 'expired' : restricted ? 'restricted' : lease.state === 'restart' ? 'restart' : lease.state === 'gone' ? 'visit-ended' : interrupted !== null && at >= interrupted + 15000 ? 'disconnected' : null;
        const db = await this.pool.connect();
        try {
          await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [row.account_id, ...await this.customers(row.account_id)]);
          const still = (await db.query('SELECT 1 FROM engine_hospitality_shifts WHERE id=$1 AND ended_at IS NULL FOR UPDATE', [row.id])).rowCount;
          if (still) { if (reason){await this.requeue(db, row.account_id);if(row.role_key!=='staff')await this.advanceStaffRevision(db,row.account_id);} await db.query("UPDATE engine_hospitality_shifts SET interrupted_at=$2,ended_at=$3,reason=$4,checked_order=nextval('engine_hospitality_recovery_sequence') WHERE id=$1", [row.id, interrupted === null ? null : new Date(interrupted), reason ? new Date(at) : null, reason]); }
          await db.query('COMMIT');
        } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
      }
      const orders = (await this.pool.query<Row>("SELECT * FROM engine_hospitality_orders WHERE phase IN ('PENDING','ASSIGNED','PREPARING','READY') ORDER BY checked_order,creation_order LIMIT 20")).rows;
      for (const row of orders) {
        const lease = visit(row.customer_id, { epoch: row.customer_epoch, roomId: row.room_id, membershipId: row.customer_membership_id }), at = this.now();
        const unavailable = lease.state === 'restart' || lease.state === 'gone' || lease.state === 'grace' && at >= (lease.disconnectedAt ?? at) + 15000 || lease.state === 'connected' && (!lease.seated || !await this.identity.hasConnectedSession(row.customer_id, lease.sessionIds)) || !await this.rooms.hospitalityAllowed(row.customer_id, row.world_slug, row.room_id) || at - row.created_at.getTime() >= 2 * 3600000;
        const db = await this.pool.connect();
        try {
          await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [row.customer_id, ...(row.assignee_id ? [row.assignee_id] : [])]);
          await db.query("UPDATE engine_hospitality_orders SET phase=CASE WHEN $2 THEN 'CANCELLED' ELSE phase END,assignee_id=CASE WHEN $2 THEN NULL ELSE assignee_id END,ready_at=CASE WHEN $2 THEN NULL ELSE ready_at END,version=version+CASE WHEN $2 THEN 1 ELSE 0 END,updated_at=CASE WHEN $2 THEN greatest(updated_at,$3) ELSE updated_at END,checked_order=nextval('engine_hospitality_recovery_sequence') WHERE id=$1 AND phase IN ('PENDING','ASSIGNED','PREPARING','READY')", [row.id, unavailable, new Date(at)]);
          await db.query('COMMIT');
        } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
      }
      await this.pool.query("DELETE FROM engine_hospitality_orders WHERE id IN (SELECT id FROM engine_hospitality_orders WHERE phase IN ('COMPLETED','CANCELLED') AND updated_at<$1 ORDER BY creation_order LIMIT 100)", [new Date(this.now() - 90 * 86400000)]);
      await this.pool.query('DELETE FROM engine_hospitality_shifts WHERE id IN (SELECT id FROM engine_hospitality_shifts WHERE ended_at<$1 ORDER BY creation_order LIMIT 100)', [new Date(this.now() - 90 * 86400000)]);
    }).finally(() => { this.#maintenance = undefined; }); return this.#maintenance;
  }
  async close() { this.#closed = true; await this.#maintenance; }
}
