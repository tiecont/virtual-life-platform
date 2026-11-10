import type { PoolClient } from 'pg';
import type { IdentityContext } from '../../../../identity/modules/accounts/application/service';
import type { ReportService } from '../../../../safety/modules/reporting/application/reports';
import { DomainError } from '../../../../../shared/common/errors';
export class EventPermissions {
  constructor(private reports: ReportService, private now = Date.now) {}
  async permits(db: PoolClient, actor: IdentityContext, worldSlug: string) {
    if (actor.kind !== 'registered') return false;
    return this.organizesAccount(db,actor.accountId,worldSlug);
  }
  async organizesAccount(db:PoolClient,accountId:string,worldSlug:string){return !!(await db.query("SELECT 1 FROM engine_event_grants WHERE account_id=$1 AND world_slug=$2 AND role='organizer' AND expires_at>$3 FOR SHARE",[accountId,worldSlug,new Date(this.now())])).rowCount;}
  async performs(db: PoolClient, actor: IdentityContext, worldSlug: string, eventId: string) {
    if (actor.kind !== 'registered') return false;
    return !!(await db.query("SELECT 1 FROM engine_event_grants WHERE account_id=$1 AND world_slug=$2 AND event_id=$3 AND role='performer' AND expires_at>$4 FOR SHARE", [actor.accountId, worldSlug, eventId, new Date(this.now())])).rowCount;
  }
  async moderates(db: PoolClient, actor: IdentityContext, worldSlug: string) {
    try { return (await this.reports.grantsInTransaction(db, actor.accountId, worldSlug)).some(grant => ['moderator', 'safety-admin'].includes(grant.role)); }
    catch (error) { if (error instanceof DomainError && error.status === 404) return false; throw error; }
  }
  // Current persisted authority for recovery and deadline clipping; no client role input.
  async stageUntil(db: PoolClient, account: string, world: string, event: string, role: 'organizer' | 'performer' | 'moderator') {
    if (role === 'moderator') {
      try { return Math.max(0, ...(await this.reports.grantsInTransaction(db, account, world)).map(grant => grant.expires_at.getTime())); }
      catch (error) { if (error instanceof DomainError && error.status === 404) return 0; throw error; }
    }
    const row = (await db.query<{ expires_at: Date }>("SELECT g.expires_at FROM engine_event_grants g JOIN identity_accounts a ON a.id=g.account_id WHERE g.account_id=$1 AND a.kind='registered' AND g.world_slug=$2 AND g.role=$3 AND (g.event_id=$4 OR g.role='organizer') AND g.expires_at>$5 FOR SHARE OF g", [account, world, role, event, new Date(this.now())])).rows[0];
    return row?.expires_at.getTime() ?? 0;
  }
}
