import type { Pool, PoolClient, QueryResultRow, QueryResult } from 'pg';
import { DomainError } from '../common/errors';

export const ROOM_OWNER_LOCK_CLASS = 1447840561;
const unavailable = () => new DomainError('WORLD_UNAVAILABLE', 503, 'Room authority unavailable');

// A deployment guard for one process per DB schema, not a distributed ownership lease.
export class RoomAuthority {
  #state: 'idle' | 'held' | 'blocked' | 'lost' | 'closed' = 'idle';
  #client: PoolClient | null = null;
  #key = 0;
  #checking: Promise<void> | null = null;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #listeners = new Set<() => void>();
  constructor(private db: Pick<Pool, 'connect'>) {}
  get state() { return this.#state; }
  #assertOpen() { if (this.#state === 'lost' || this.#state === 'closed') throw unavailable(); }
  onLost(listener: () => void) { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  #release() {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    const client = this.#client; this.#client = null;
    // Destroy the dedicated connection: no session advisory locks can return to the shared pool.
    if (client) client.release(true);
  }
  #lose() {
    if (this.#state === 'lost' || this.#state === 'closed') return;
    this.#state = 'lost'; this.#release();
    for (const listener of this.#listeners) { try { listener(); } catch { /* Authority stays lost. */ } }
  }
  #query<Row extends QueryResultRow>(text: string, values: number[] = []): Promise<QueryResult<Row>> {
    const client = this.#client; if (!client) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#lose(); reject(unavailable()); }, 1000);
      client.query<Row>(text, values).then(result => { clearTimeout(timer); resolve(result); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  #connect(): Promise<PoolClient> {
    return new Promise((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => { expired = true; this.#lose(); reject(unavailable()); }, 2000);
      this.db.connect().then(client => {
        clearTimeout(timer);
        if (expired) client.release(true); else resolve(client);
      }, error => { clearTimeout(timer); reject(error); });
    });
  }
  async #check() {
    this.#assertOpen();
    try {
      if (!this.#client) {
        const client = await this.#connect();
        try { this.#assertOpen(); } catch (error) { client.release(true); throw error; }
        this.#client = client;
        client.on('error', () => { if (this.#client === client) this.#lose(); });
        client.on('end', () => { if (this.#client === client) this.#lose(); });
        await this.#query("SET application_name='virtual-life-platform-room-owner'");
        const scope = await this.#query<{ key: number }>('SELECT hashtext(current_schema()) AS key');
        this.#key = scope.rows[0].key;
        const result = await this.#query<{ held: boolean }>('SELECT pg_try_advisory_lock($1::int,$2::int) AS held', [ROOM_OWNER_LOCK_CLASS, this.#key]);
        this.#assertOpen();
        if (!result.rows[0].held) { this.#state = 'blocked'; this.#release(); throw unavailable(); }
        this.#state = 'held';
        this.#heartbeat = setInterval(() => { void this.assert().catch(() => {}); }, 1000); this.#heartbeat.unref();
      }
      const result = await this.#query<{ held: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND classid=$1::oid AND objid=$2::oid AND objsubid=2 AND granted) AS held", [ROOM_OWNER_LOCK_CLASS, this.#key >>> 0]);
      if (!result.rows[0].held || this.state !== 'held') throw unavailable();
    } catch (error) {
      if (this.state !== 'blocked' && this.state !== 'closed') this.#lose();
      if (error instanceof DomainError) throw error;
      throw unavailable();
    }
  }
  assert(): Promise<void> {
    if (this.#checking) return this.#checking;
    this.#checking = this.#check().finally(() => { this.#checking = null; }); return this.#checking;
  }
  close() { this.#state = 'closed'; this.#release(); this.#listeners.clear(); }
}
