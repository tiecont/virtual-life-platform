import type { Pool, PoolClient } from 'pg';
import { OrderCompletedSchema, type OrderCompleted } from '@virtual-city/contracts';
import {z} from 'zod';
// The durable dispatcher needs account transaction locks, not identity/room runtime.
export interface HospitalityAccountLocks {
  // Trusted adapter: preserve IdentityService's sorted account transaction-lock ordering.
  lockAccounts(db: PoolClient, ids: string[]): Promise<void>;
}
export interface HospitalityCompletionSink {
  key: string;
  // Trusted in-process hooks must await only this transaction's DB operations; no network side effects.
  apply(db: Pick<PoolClient, 'query'>, event: Readonly<OrderCompleted>): Promise<void>;
}
export class HospitalityOutbox {
  #running?: Promise<void>; #closed = false;
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: HospitalityAccountLocks, private sinks: readonly HospitalityCompletionSink[] = [], private now = Date.now, private retryLimit?: number) {
    if (sinks.length > 8 || new Set(sinks.map(sink => sink.key)).size !== sinks.length || sinks.some(sink => !/^[a-z][a-z0-9-]{0,63}$/.test(sink.key))) throw new Error('Invalid hospitality completion consumers');
    if (retryLimit !== undefined && (!Number.isInteger(retryLimit) || retryLimit < 1 || retryLimit > 30)) throw Error('Invalid delivery retry limit');
  }
  drain() {
    if (this.#closed) return Promise.resolve(); if (this.#running) return this.#running;
    this.#running = this.deliver().finally(() => { this.#running = undefined; }); return this.#running;
  }
  private async deliver() {
    let failures = 0;
    for (const sink of this.sinks) {
      const legacyQuery = 'SELECT b.event_id,o.customer_id,o.assignee_id FROM engine_hospitality_outbox b JOIN engine_hospitality_completions c ON c.id=b.event_id JOIN engine_hospitality_orders o ON o.id=c.order_id WHERE NOT EXISTS(SELECT 1 FROM engine_hospitality_deliveries d WHERE d.event_id=b.event_id AND d.consumer_key=$1) AND NOT EXISTS(SELECT 1 FROM engine_hospitality_delivery_retries r WHERE r.event_id=b.event_id AND r.consumer_key=$1 AND r.next_at>$2) ORDER BY b.creation_order LIMIT 20';
      const query = this.retryLimit === undefined ? legacyQuery : legacyQuery.replace('r.next_at>$2', '(r.next_at>$2 OR r.attempts>=$3)');
      const pending = (await this.pool.query<{ event_id: string; customer_id: string; assignee_id: string }>(query, this.retryLimit === undefined ? [sink.key, new Date(this.now())] : [sink.key, new Date(this.now()), this.retryLimit])).rows;
      for (const entry of pending) {
        const db = await this.pool.connect();
        try {
          await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await this.identity.lockAccounts(db, [entry.customer_id, entry.assignee_id]);
          const row = (await db.query<{ id: string; order_id: string; world_slug: string; item_key: string; policy_version: string; customer_id: string; assignee_id: string; course_index: number; completed_at: Date }>('SELECT c.*,o.world_slug,o.item_key,o.policy_version,o.customer_id,o.assignee_id,o.course_index FROM engine_hospitality_outbox b JOIN engine_hospitality_completions c ON c.id=b.event_id JOIN engine_hospitality_orders o ON o.id=c.order_id WHERE b.event_id=$1 AND o.phase=\'COMPLETED\' FOR UPDATE OF b', [entry.event_id])).rows[0];
          if (row && !(await db.query('SELECT 1 FROM engine_hospitality_deliveries WHERE event_id=$1 AND consumer_key=$2', [row.id, sink.key])).rowCount) {
            const event = Object.freeze(OrderCompletedSchema.parse({ schemaVersion: 1, type: 'OrderCompleted', id: row.id, orderId: row.order_id, worldSlug: row.world_slug, itemKey: row.item_key, policyVersion: row.policy_version, customerId: row.customer_id, staffId: row.assignee_id, coursesServed: row.course_index + 1, completedAt: row.completed_at.toISOString() }));
            await sink.apply({ query: db.query.bind(db) } as Pick<PoolClient, 'query'>, event);
            await db.query('INSERT INTO engine_hospitality_deliveries VALUES($1,$2,$3)', [row.id, sink.key, new Date(this.now())]);
            await db.query('DELETE FROM engine_hospitality_delivery_retries WHERE event_id=$1 AND consumer_key=$2', [row.id, sink.key]);
          }
          await db.query('COMMIT');
        } catch {
          await db.query('ROLLBACK'); failures++;
          await db.query("INSERT INTO engine_hospitality_delivery_retries VALUES($1,$2,1,$3::timestamptz+interval '1 second') ON CONFLICT(event_id,consumer_key) DO UPDATE SET attempts=least(engine_hospitality_delivery_retries.attempts+1,30),next_at=$3::timestamptz+least(60,power(2,least(engine_hospitality_delivery_retries.attempts,6))) * interval '1 second'", [entry.event_id, sink.key, new Date(this.now())]);
        } finally { db.release(); }
      }
    }
    if (failures) throw new Error('Hospitality completion delivery unavailable');
  }
  // Aggregate-only read port for the API's configured consumers. Execution is
  // intentionally not inferred: zero pending deliveries does not prove a worker.
  async operationalBacklog(db:Pick<PoolClient,'query'>){
    if(this.#closed)throw Error('Backlog unavailable');if(!this.sinks.length)return null;
    const row=(await db.query<{pending:string;oldest:Date|null}>("SELECT count(*)::text AS pending,min(c.completed_at) AS oldest FROM engine_hospitality_outbox b JOIN engine_hospitality_completions c ON c.id=b.event_id JOIN engine_hospitality_orders o ON o.id=c.order_id CROSS JOIN unnest($1::text[]) AS sinks(consumer_key) WHERE o.world_slug<>'dating' AND NOT EXISTS(SELECT 1 FROM engine_hospitality_deliveries d WHERE d.event_id=b.event_id AND d.consumer_key=sinks.consumer_key)",[this.sinks.map(sink=>sink.key)])).rows[0];
    const pending=Number(row.pending);if(!Number.isSafeInteger(pending)||pending<0||pending>0&&!row.oldest)throw Error('Invalid backlog observation');return {pendingDeliveries:pending,oldestAgeMs:row.oldest?Math.max(0,this.now()-row.oldest.getTime()):null,consumerCount:this.sinks.length};
  }
  async deadLetters() {
    if (this.retryLimit === undefined) throw Error('Bounded retry policy required');
    return (await this.pool.query<{event_id: string; consumer_key: string; attempts: number; next_at: Date}>('SELECT event_id,consumer_key,attempts,next_at FROM engine_hospitality_delivery_retries r WHERE consumer_key=ANY($1::text[]) AND attempts>=$2 AND NOT EXISTS(SELECT 1 FROM engine_hospitality_deliveries d WHERE d.event_id=r.event_id AND d.consumer_key=r.consumer_key) ORDER BY next_at,event_id LIMIT 20', [this.sinks.map(sink => sink.key), this.retryLimit])).rows;
  }
  // Trusted CLI/service operation only. Never clear committed delivery receipts.
  async retryDeadLetter(eventId: string, consumer: string, expectedAttempts: number, expectedNextAt: string) {
    if (this.#closed) throw Error('Delivery dispatcher closed');
    if (this.retryLimit === undefined) throw Error('Bounded retry policy required');
    z.uuid().parse(eventId); z.number().int().min(this.retryLimit).max(30).parse(expectedAttempts);
    z.iso.datetime().parse(expectedNextAt);
    if (!this.sinks.some(sink => sink.key === consumer)) throw Error('Unknown delivery consumer');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='2000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'");
      const row = (await db.query<{customer_id: string; assignee_id: string}>('SELECT o.customer_id,o.assignee_id FROM engine_hospitality_outbox b JOIN engine_hospitality_completions c ON c.id=b.event_id JOIN engine_hospitality_orders o ON o.id=c.order_id WHERE b.event_id=$1', [eventId])).rows[0];
      if (!row) throw Error('Delivery no longer available');
      await this.identity.lockAccounts(db, [row.customer_id, row.assignee_id]);
      await db.query('SELECT event_id FROM engine_hospitality_outbox WHERE event_id=$1 FOR UPDATE', [eventId]);
      const removed = await db.query('DELETE FROM engine_hospitality_delivery_retries r WHERE event_id=$1 AND consumer_key=$2 AND attempts=$3 AND next_at=$4::timestamptz AND NOT EXISTS(SELECT 1 FROM engine_hospitality_deliveries d WHERE d.event_id=r.event_id AND d.consumer_key=r.consumer_key) RETURNING event_id', [eventId, consumer, expectedAttempts, expectedNextAt]);
      if (removed.rowCount !== 1) throw Error('Delivery retry conflict');
      await db.query('COMMIT');
    } catch (error) {await db.query('ROLLBACK'); throw error;} finally {db.release();}
  }
  async close() { this.#closed = true; await this.#running; }
}
