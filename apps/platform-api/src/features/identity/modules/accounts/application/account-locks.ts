import type {PoolClient} from 'pg';
// Same canonical transaction-lock namespace/order as every identity mutation.
export async function lockAccounts(db: Pick<PoolClient, 'query'>, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['account:' + id]);
}
