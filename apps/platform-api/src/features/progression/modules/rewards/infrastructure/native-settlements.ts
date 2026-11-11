import {validNativeCompletion} from '../domain/native-completion';
import type {Pool, PoolClient} from 'pg';
import {lockAccounts} from '../../../../identity/modules/accounts/application/account-locks';
import type {NativeRewardPolicy} from '../../../../../shared/config/native-rewards';

type Settlement = {
  event_id: string;
  settlement_id: string;
  proposal: unknown;
  proposal_hash: Buffer;
  actor_id: string;
};
type Outcome = 'granted' | 'declined';

export class NativeSettlements {
  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly policy: NativeRewardPolicy,
    private readonly eligible: (db: PoolClient, account: string, world: string) => Promise<boolean>,
  ) {}

  async drain(): Promise<void> {
    for (let processed = 0; processed < 32; processed++) {
      if (!await this.deliverOne()) return;
    }
  }

  private async deliverOne(): Promise<boolean> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout='2000ms'; SET LOCAL lock_timeout='1000ms'");
      const {world, ruleset, rulesetVersion, contentHash} = this.policy;
      const {rows: [event]} = await db.query<Settlement>(`
        SELECT o.event_id, o.settlement_id, s.proposal, s.proposal_hash, r.actor_id
        FROM game_native_outbox o
        JOIN game_native_settlements s USING (match_id, settlement_id)
        JOIN game_native_receipts r ON (r.match_id,r.committed_version,r.epoch)=(s.match_id,s.state_version,s.epoch)
        JOIN game_native_matches m ON m.id=s.match_id
        WHERE o.delivered_at IS NULL AND o.available_at<=clock_timestamp()
          AND o.effect_type='game.settlement.v1'
          AND m.world_id=$1 AND m.ruleset_id=$2 AND m.ruleset_version=$3 AND m.content_hash=decode($4,'hex')
          AND m.status='SETTLING' AND m.state_version=s.state_version AND m.epoch=s.epoch
        ORDER BY o.available_at,o.event_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED
      `, [world, ruleset, rulesetVersion, contentHash]);

      if (event) {
        const prior = (await db.query<{outcome: Outcome}>(
          'SELECT outcome FROM platform_native_reward_inbox WHERE settlement_id=$1', [event.settlement_id],
        )).rows[0];
        const outcome = prior?.outcome ?? await this.record(db, event);
        await db.query(
          'UPDATE game_native_outbox SET delivered_at=clock_timestamp(), delivery_outcome=$2 WHERE event_id=$1',
          [event.event_id, outcome],
        );
      }
      await db.query('COMMIT');
      return event !== undefined;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  private async record(db: PoolClient, event: Settlement): Promise<Outcome> {
    const {world, rewardKey} = this.policy;
    const valid = validNativeCompletion(this.policy, event.proposal, event.proposal_hash);
    let outcome: Outcome = 'declined';
    if (valid) {
      await lockAccounts(db, [event.actor_id]);
      const active = await db.query("SELECT 1 FROM identity_accounts WHERE id=$1 AND status='active'", [event.actor_id]);
      if (active.rowCount && await this.eligible(db, event.actor_id, world)) outcome = 'granted';
    }
    await db.query(
      'INSERT INTO platform_native_reward_inbox(settlement_id,event_id,outcome) VALUES($1,$2,$3)',
      [event.settlement_id, event.event_id, outcome],
    );
    if (outcome === 'granted') {
      await db.query(
        'INSERT INTO platform_native_reward_ledger(settlement_id,account_id,reward_key) VALUES($1,$2,$3)',
        [event.settlement_id, event.actor_id, rewardKey],
      );
    }
    return outcome;
  }
}
