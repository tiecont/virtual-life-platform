import type { Pool, PoolClient } from 'pg';
import { OrderCompletedSchema, type OrderCompleted } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
export interface HospitalityCompletionSink {
  key: string;
  // Trusted in-process hooks must await only this transaction's DB operations; no network side effects.
  apply(db: Pick<PoolClient, 'query'>, event: Readonly<OrderCompleted>): Promise<void>;
}
export class HospitalityOutbox {
  #running?: Promise<void>; #closed = false;
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private sinks: readonly HospitalityCompletionSink[] = [], private now = Date.now) {
    if (sinks.length > 8 || new Set(sinks.map(sink => sink.key)).size !== sinks.length || sinks.some(sink => !/^[a-z][a-z0-9-]{0,63}$/.test(sink.key))) throw new Error('Invalid hospitality completion consumers');
  }
  drain() {
    if (this.#closed) return Promise.resolve(); if (this.#running) return this.#running;
    this.#running = this.deliver().finally(() => { this.#running = undefined; }); return this.#running;
  }
  private async deliver() {
    let failures = 0;
    for (const sink of this.sinks) {
      const pending = (await this.pool.query<{ event_id: string; customer_id: string; assignee_id: string }>('SELECT b.event_id,o.customer_id,o.assignee_id FROM engine_hospitality_outbox b JOIN engine_hospitality_completions c ON c.id=b.event_id JOIN engine_hospitality_orders o ON o.id=c.order_id WHERE NOT EXISTS(SELECT 1 FROM engine_hospitality_deliveries d WHERE d.event_id=b.event_id AND d.consumer_key=$1) AND NOT EXISTS(SELECT 1 FROM engine_hospitality_delivery_retries r WHERE r.event_id=b.event_id AND r.consumer_key=$1 AND r.next_at>$2) ORDER BY b.creation_order LIMIT 20', [sink.key, new Date(this.now())])).rows;
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
  async close() { this.#closed = true; await this.#running; }
}
