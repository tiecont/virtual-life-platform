import type { PoolClient } from 'pg';
import type { IdentityContext } from '../identity/service';
import type { ReportService } from '../safety/reports';
import { DomainError } from '../common/errors';
export class EventPermissions {
  constructor(private reports: ReportService, private now = Date.now) {}
  async permits(db: PoolClient, actor: IdentityContext, worldSlug: string) {
    if (actor.kind !== 'registered') return false;
    return !!(await db.query("SELECT 1 FROM engine_event_grants WHERE account_id=$1 AND world_slug=$2 AND role='organizer' AND expires_at>$3 FOR SHARE", [actor.accountId, worldSlug, new Date(this.now())])).rowCount;
  }
  async performs(db: PoolClient, actor: IdentityContext, worldSlug: string, eventId: string) {
    if (actor.kind !== 'registered') return false;
    return !!(await db.query("SELECT 1 FROM engine_event_grants WHERE account_id=$1 AND world_slug=$2 AND event_id=$3 AND role='performer' AND expires_at>$4 FOR SHARE", [actor.accountId, worldSlug, eventId, new Date(this.now())])).rowCount;
  }
  async moderates(db: PoolClient, actor: IdentityContext, worldSlug: string) {
    try { return (await this.reports.grantsInTransaction(db, actor.accountId, worldSlug)).some(grant => ['moderator', 'safety-admin'].includes(grant.role)); }
    catch (error) { if (error instanceof DomainError && error.status === 404) return false; throw error; }
  }
}
