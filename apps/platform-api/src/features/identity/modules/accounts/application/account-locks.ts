import type {PoolClient} from 'pg';
const accountKeys=(ids:string[])=>[...new Set(ids)].sort().map(id=>'account:'+id);

// Same canonical transaction-lock namespace/order as every identity mutation.
export async function lockAccounts(db: Pick<PoolClient, 'query'>, ids: string[]) {
  for (const key of accountKeys(ids)) await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
}
// Erasure already holds its own account lock. Taking any peer lock must
// be nonblocking so it can roll back if a worker has reached this account.
export async function tryLockAccounts(db: Pick<PoolClient, 'query'>, ids: string[]) {
  for (const key of accountKeys(ids)) {
    const result = await db.query<{ acquired: boolean }>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired', [key]);
    if (!result.rows[0]?.acquired) return false;
  }
  return true;
}
