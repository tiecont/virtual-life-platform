import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { IncidentInputSchema, IncidentResultSchema, IncidentPageSchema, ModerationSessionSchema } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { RoomService } from '../rooms/service';
import type { ReportService } from './reports';
import { DomainError } from '../common/errors';
type Control = { world_slug: string; surface: 'world' | 'chat'; closed: boolean; changed_by: string | null; changed_at: Date };
export class IncidentPolicy {
  constructor(private pool: Pick<Pool, 'query'>) {}
  async permits(_accountId: string, world: string) { return (await this.pool.query("SELECT 1 FROM safety_incident_controls WHERE world_slug=$1 AND surface='world' AND closed", [world])).rowCount === 0; }
  async assert(_accountId: string, world: string, _room?: string, chat = false) {
    if ((await this.pool.query("SELECT 1 FROM safety_incident_controls WHERE world_slug=$1 AND closed AND (surface='world' OR $2)", [world, chat])).rowCount) throw new DomainError('FORBIDDEN', 403, 'This activity is temporarily closed');
  }
}
export class IncidentService {
  constructor(private pool: Pick<Pool, 'query' | 'connect'>, private identity: IdentityService, private reports: ReportService, private rooms: RoomService, private slugs: () => string[], private now = Date.now) {}
  private async tx<T>(token: string, work: (db: PoolClient, actor: string) => Promise<T>) {
    const initial = await this.identity.authenticate(token), db = await this.pool.connect();
    try { await db.query('BEGIN'); await this.identity.lockAccounts(db, [initial.accountId]); const actor = await this.identity.contextInTransaction(db, token); const result = await work(db, actor.accountId); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private state(row: Control) { return { worldSlug: row.world_slug, surface: row.surface, closed: row.closed, changedAt: row.changed_at.toISOString() }; }
  session(token: string) { return this.tx(token, async (db, actor) => ModerationSessionSchema.parse({ schemaVersion: 1, accountId: actor, scopes: (await this.reports.grantsInTransaction(db, actor)).map(grant => ({ worldSlug: grant.world_slug, role: grant.role })), reportsAvailable: this.reports.available() })); }
  list(token: string) {
    return this.tx(token, async (db, actor) => {
      const grants = await this.reports.grantsInTransaction(db, actor);
      const rows = (await db.query<Control>('SELECT * FROM safety_incident_controls WHERE world_slug=ANY($1::text[]) ORDER BY world_slug,surface', [grants.map(grant => grant.world_slug)])).rows;
      return IncidentPageSchema.parse({ schemaVersion: 1, items: rows.map(row => this.state(row)) });
    });
  }
  async change(token: string, world: string, key: string, raw: unknown) {
    const input = IncidentInputSchema.parse(raw);
    if (!this.slugs().includes(world)) throw new DomainError('NOT_AVAILABLE', 404, 'This control is unavailable');
    return this.rooms.safetyMutation(async () => {
      const result = await this.tx(token, async (db, actor) => {
        const grants = await this.reports.grantsInTransaction(db, actor, world); if (!grants.some(grant => grant.role === 'safety-admin')) throw new DomainError('NOT_AVAILABLE', 404, 'This control is unavailable');
        const fingerprint = this.identity.fingerprint({ operation: 'incident.change', world, input });
        const previous = (await db.query('SELECT * FROM safety_incident_mutations WHERE actor_id=$1 AND request_id=$2', [actor, key])).rows[0];
        if (previous && previous.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Request key was used with different input');
        const current = (await db.query<Control>('SELECT * FROM safety_incident_controls WHERE world_slug=$1 AND surface=$2 FOR UPDATE', [world, input.surface])).rows[0];
        if (previous) return IncidentResultSchema.parse({ schemaVersion: 1, control: this.state(current) });
        if (!input.closed && (!current || current.closed && (!current.changed_by || current.changed_by === actor))) throw new DomainError('FORBIDDEN', 403, 'Recovery requires a different current safety administrator');
        if (!current || current.closed !== input.closed) {
          await db.query('INSERT INTO safety_incident_controls VALUES($1,$2,$3,$4,$5) ON CONFLICT(world_slug,surface) DO UPDATE SET closed=EXCLUDED.closed,changed_by=EXCLUDED.changed_by,changed_at=EXCLUDED.changed_at', [world, input.surface, input.closed, actor, new Date(this.now())]);
          await db.query('INSERT INTO safety_incident_audit(event_id,world_slug,surface,closed,actor_digest,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), world, input.surface, input.closed, this.identity.fingerprint({ auditActor: actor }), input.reason, new Date(this.now())]);
        }
        await db.query('INSERT INTO safety_incident_mutations VALUES($1,$2,$3,$4,$5,$6)', [actor, key, fingerprint, world, input.surface, new Date(this.now())]);
        const row = (await db.query<Control>('SELECT * FROM safety_incident_controls WHERE world_slug=$1 AND surface=$2', [world, input.surface])).rows[0];
        return IncidentResultSchema.parse({ schemaVersion: 1, control: this.state(row) });
      });
      return { result, closeWorld: result.control.closed && result.control.surface === 'world' ? world : undefined };
    });
  }
}
