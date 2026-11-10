import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import { IdentityService } from '../../apps/platform-api/src/features/identity/modules/accounts/application/service';
import { RoomAuthority, ROOM_OWNER_LOCK_CLASS } from '../../apps/platform-api/src/features/rooms/modules/presence/application/authority';
import { AdmissionStore } from '../../apps/platform-api/src/features/admission/modules/allocation/infrastructure/store';
let admin: Pool, pool: Pool, schema: string, identity: IdentityService, authority: RoomAuthority, store: AdmissionStore, epoch: string;
beforeAll(() => { const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))
    throw Error('Disposable local test DB required'); admin = new Pool({ connectionString: url.toString() }); });
beforeEach(async () => { schema = 'admission_' + randomUUID().replaceAll('-', ''); await admin.query(`CREATE SCHEMA "${schema}"`); const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: url.toString(), max: 16, connectionTimeoutMillis: 2000 }); await migrate(pool); identity = new IdentityService(pool, readConfig({ NODE_ENV: 'test', DATABASE_URL: url.toString(), SESSION_SECRET: 'synthetic-admission-player-key-'.repeat(2) })); authority = new RoomAuthority(pool); epoch = randomUUID(); store = new AdmissionStore(pool, identity, { epoch, assert: () => authority.assert() }); expect(await store.recover()).toBe(true); });
afterEach(async () => { store?.close(); authority?.close(); await pool?.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); });
afterAll(async () => { await admin.end(); });
async function actor() { const value = await identity.guest({ requestId: randomUUID(), displayName: 'Synthetic queue player', avatarKey: 'mint' }); return { id: value.me.profile.id, token: value.token }; }
const enqueue = (token: string, requestId = randomUUID()) => store.command(token, { schemaVersion: 1, requestId, action: 'enqueue' });
const claim = (token: string, id: string, version: number, requestId = randomUUID()) => store.command(token, { schemaVersion: 1, requestId, action: 'claim', offerId: id, expectedVersion: version });
const leave = (token: string, id: string, version: number, requestId = randomUUID()) => store.command(token, { schemaVersion: 1, requestId, action: 'leave', id, expectedVersion: version });
async function cap(hard: number) { await pool.query('UPDATE platform_admission_policy SET hard=$1,target=$1,paused=false WHERE singleton=true', [hard]); }
it('real concurrent duplicate enqueue/claim cannot exceed capacity and FIFO reservations survive a service instance retry', async () => {
    await cap(3);
    const users = await Promise.all(Array.from({ length: 8 }, actor));
    for (const user of users)
        await Promise.all([enqueue(user.token), enqueue(user.token)]);
    expect((await pool.query('SELECT 1 FROM platform_admission_entries')).rowCount).toBe(8);
    const offers = await Promise.all(Array.from({ length: 8 }, () => store.offer(randomUUID()))), grants = offers.filter(value => value !== null);
    expect(grants).toHaveLength(3);
    expect(grants.map(value => value!.accountId).sort()).toEqual(users.slice(0, 3).map(user => user.id).sort());
    await Promise.all(grants.flatMap(grant => { const user = users.find(user => user.id === grant!.accountId)!, requestId = randomUUID(); return Array.from({ length: 8 }, () => claim(user.token, grant!.own.id, grant!.own.version, requestId)); }));
    expect(await store.capacity()).toMatchObject({ active: 3, reserved: 0, reconnectGrace: 0, occupancy: 3, queued: 5 });
    const another = new AdmissionStore(pool, identity, { epoch, assert: () => authority.assert() });
    try {
        const user = users[0], own = await another.own(user.token);
        expect(own?.state).toBe('ACTIVE');
        const requestId = randomUUID();
        await Promise.all([leave(user.token, own!.id, own!.version, requestId), another.command(user.token, { schemaVersion: 1, requestId, action: 'leave', id: own!.id, expectedVersion: own!.version })]);
        expect((await another.capacity()).occupancy).toBe(2);
    }
    finally {
        another.close();
    }
});
async function reserved(user: Awaited<ReturnType<typeof actor>>) { await enqueue(user.token); const offer = await store.offer(randomUUID()); expect(offer?.accountId).toBe(user.id); return offer!.own; }
async function active(user: Awaited<ReturnType<typeof actor>>) { const offer = await reserved(user); return (await claim(user.token, offer.id, offer.version)).own!; }
// The wrapper changes transport acknowledgements around real PostgreSQL queries;
// all statements, constraints, locks and commits still execute in the disposable DB.
function intercepted(intercept: (db: PoolClient, text: string, args: unknown[]) => Promise<unknown>) { return new AdmissionStore({ connect: async () => { const db = await pool.connect(); return new Proxy(db, { get(target, key) { if (key === 'query')
            return (text: string, ...args: unknown[]) => intercept(target, text, args); const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }); } }, identity, { epoch, assert: () => authority.assert() }); }
const actual = (db: PoolClient, text: string, args: unknown[]) => (db.query as (...args: unknown[]) => Promise<unknown>).call(db, text, ...args);
it('preserves FIFO age across duplicates; expired offers release once and returning users join at the tail', async () => {
    await cap(1);
    const a = await actor(), b = await actor();
    const first = (await enqueue(a.token)).own!;
    await enqueue(b.token);
    expect((await enqueue(a.token)).own).toMatchObject({ id: first.id, version: first.version, position: 1, expiresAt: first.expiresAt });
    const offer = await store.offer(randomUUID());
    expect(offer!.accountId).toBe(a.id);
    await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=$1", [a.id]);
    await expect(claim(a.token, offer!.own.id, offer!.own.version)).rejects.toMatchObject({ status: 409 });
    expect((await store.capacity()).occupancy).toBe(0);
    expect((await store.capacity()).occupancy).toBe(0);
    expect((await enqueue(a.token)).own).toMatchObject({ state: 'WAITING', position: 2 });
    const next = await store.offer(randomUUID());
    expect(next!.accountId).toBe(b.id);
    expect((await store.capacity()).occupancy).toBe(1);
});
it('bounds reconnect grace, rejects stale/conflicting requests, and never resurrects a claim from a durable receipt', async () => {
    await cap(1);
    const a = await actor(), b = await actor(), state = await active(a);
    await enqueue(b.token);
    const disconnect = randomUUID(), grace = (await store.disconnect(a.token, state.id, state.version, disconnect)).own!;
    expect(grace.state).toBe('RECONNECT_GRACE');
    expect(Date.parse(grace.expiresAt!) - Date.parse(grace.observedAt)).toBeGreaterThan(28000);
    expect(Date.parse(grace.expiresAt!) - Date.parse(grace.observedAt)).toBeLessThanOrEqual(30000);
    expect(await store.offer(randomUUID())).toBeNull();
    await expect(store.reconnect(a.token, grace.id, state.version, randomUUID())).rejects.toMatchObject({ status: 409 });
    const requestId = randomUUID(), restored = (await store.reconnect(a.token, grace.id, grace.version, requestId)).own!;
    expect(restored.state).toBe('ACTIVE');
    await expect(leave(a.token, restored.id, restored.version, requestId)).rejects.toMatchObject({ status: 409 });
    const again = (await store.disconnect(a.token, restored.id, restored.version, randomUUID())).own!;
    await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=$1", [a.id]);
    await expect(store.reconnect(a.token, again.id, again.version, randomUUID())).rejects.toMatchObject({ status: 409 });
    expect((await store.capacity()).occupancy).toBe(0);
    const replay = await store.reconnect(a.token, grace.id, grace.version, requestId);
    expect(replay.own).toBeNull();
    expect((await enqueue(a.token)).own).toMatchObject({ state: 'WAITING', position: 2 });
    expect((await store.offer(randomUUID()))!.accountId).toBe(b.id);
});
it('retains active slots while draining and settles a pending hard decrease without kicking anyone', async () => {
    await cap(2);
    const a = await actor(), b = await actor(), x = await active(a), y = await active(b);
    await pool.query('UPDATE platform_admission_policy SET target=1,pending_hard=1,paused=true WHERE singleton=true');
    expect(await store.capacity()).toMatchObject({ hard: 2, target: 1, pendingHard: 1, mode: 'DRAINING_LIMIT', paused: true, active: 2 });
    expect((await store.own(a.token))?.state).toBe('ACTIVE');
    await expect(pool.query('UPDATE platform_admission_policy SET hard=1,pending_hard=NULL WHERE singleton=true')).rejects.toThrow('hard bound');
    await leave(a.token, x.id, x.version);
    expect(await store.capacity()).toMatchObject({ hard: 1, target: 1, pendingHard: null, active: 1, occupancy: 1 });
    expect((await store.own(b.token))?.id).toBe(y.id);
});
it('derives actors from live sessions; invalid heads are skipped and another account cannot claim or release a grant', async () => {
    await cap(1);
    const a = await actor(), b = await actor(), c = await actor();
    await enqueue(a.token);
    await enqueue(b.token);
    await pool.query("UPDATE identity_accounts SET status='suspended' WHERE id=$1", [a.id]);
    const offer = await store.offer(randomUUID());
    expect(offer?.accountId).toBe(b.id);
    await expect(store.own(a.token)).rejects.toMatchObject({ status: 401 });
    await expect(claim(c.token, offer!.own.id, offer!.own.version)).rejects.toMatchObject({ status: 409 });
    await expect(leave(c.token, offer!.own.id, offer!.own.version)).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE identity_sessions SET revoked_at=clock_timestamp(),revoked_reason='logout' WHERE account_id=$1", [b.id]);
    await expect(claim(b.token, offer!.own.id, offer!.own.version)).rejects.toMatchObject({ status: 401 });
    await expect(enqueue('invalid')).rejects.toMatchObject({ status: 401 });
    expect((await store.capacity()).active).toBe(0);
});
it('rechecks DB time after real SQL wait; a claim whose offer expired during work rolls back', async () => {
    await cap(1);
    const a = await actor(), offer = await reserved(a);
    await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE account_id=$1", [a.id]);
    let delayed = false;
    const slow = intercepted(async (db, text, args) => { const result = await actual(db, text, args); if (text.startsWith("UPDATE platform_admission_entries SET phase='ACTIVE'") && !delayed) {
        delayed = true;
        await db.query('SELECT pg_sleep(0.85)');
    } return result; });
    try {
        await expect(slow.command(a.token, { schemaVersion: 1, requestId: randomUUID(), action: 'claim', offerId: offer.id, expectedVersion: offer.version })).rejects.toMatchObject({ status: 409 });
        expect(delayed).toBe(true);
        expect((await pool.query('SELECT phase FROM platform_admission_entries WHERE account_id=$1', [a.id])).rows[0].phase).toBe('RESERVED');
        expect((await store.capacity()).occupancy).toBe(0);
    }
    finally {
        slow.close();
    }
});
it.each(['reserve', 'claim', 'release'] as const)('fails closed when the actual allocation backend dies during %s; retry uses canonical state', async (stage) => {
    await cap(1);
    const a = await actor();
    let state: Awaited<ReturnType<typeof store.own>>;
    if (stage === 'reserve') {
        await enqueue(a.token);
    }
    else {
        state = stage === 'claim' ? await reserved(a) : await active(a);
    }
    let killed = false;
    const fault = intercepted(async (db, text, args) => { const result = await actual(db, text, args); const match = stage === 'reserve' ? text.startsWith('UPDATE platform_admission_entries SET id=') : stage === 'claim' ? text.startsWith("UPDATE platform_admission_entries SET phase='ACTIVE'") : text === 'DELETE FROM platform_admission_entries WHERE account_id=$1'; if (match && !killed) {
        killed = true;
        await admin.query('SELECT pg_terminate_backend($1)', [(db as unknown as {
                processID: number;
            }).processID]);
    } return result; });
    const requestId = randomUUID();
    try {
        const operation = stage === 'reserve' ? () => fault.offer(requestId) : () => fault.command(a.token, { schemaVersion: 1, requestId, action: stage === 'claim' ? 'claim' : 'leave', ...(stage === 'claim' ? { offerId: state!.id } : { id: state!.id }), expectedVersion: state!.version });
        await expect(operation()).rejects.toMatchObject({ status: 503 });
        expect(killed).toBe(true);
        expect((await store.own(a.token))?.state).toBe(stage === 'reserve' ? 'WAITING' : stage === 'claim' ? 'RESERVED' : 'ACTIVE');
        if (stage === 'reserve')
            expect((await store.offer(requestId))?.own.state).toBe('RESERVED');
        else {
            const result = await store.command(a.token, { schemaVersion: 1, requestId, action: stage === 'claim' ? 'claim' : 'leave', ...(stage === 'claim' ? { offerId: state!.id } : { id: state!.id }), expectedVersion: state!.version });
            expect(result.own?.state ?? null).toBe(stage === 'claim' ? 'ACTIVE' : null);
        }
        expect((await store.capacity()).occupancy).toBeLessThanOrEqual(1);
    }
    finally {
        fault.close();
    }
});
it('handles lost real COMMIT acknowledgement without reapplying claim or resurrecting a later release', async () => {
    await cap(1);
    const a = await actor(), offer = await reserved(a), requestId = randomUUID();
    let lost = false;
    const fault = intercepted(async (db, text, args) => { const result = await actual(db, text, args); if (text === 'COMMIT' && !lost) {
        lost = true;
        throw Error('Synthetic transport lost actual COMMIT acknowledgement');
    } return result; });
    try {
        await expect(fault.command(a.token, { schemaVersion: 1, requestId, action: 'claim', offerId: offer.id, expectedVersion: offer.version })).rejects.toMatchObject({ status: 503 });
        expect((await store.capacity()).active).toBe(1);
        const replay = await claim(a.token, offer.id, offer.version, requestId);
        expect(replay.own?.state).toBe('ACTIVE');
        await leave(a.token, replay.own!.id, replay.own!.version);
        expect((await claim(a.token, offer.id, offer.version, requestId)).own).toBeNull();
        expect((await store.capacity()).occupancy).toBe(0);
    }
    finally {
        fault.close();
    }
});
it('rolls back a deferred database rejection at actual COMMIT including the receipt', async () => {
    await cap(1);
    const a = await actor(), offer = await reserved(a), requestId = randomUUID();
    await pool.query("CREATE FUNCTION admission_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.phase='ACTIVE' THEN RAISE EXCEPTION 'Synthetic deferred reject'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE CONSTRAINT TRIGGER admission_test_commit AFTER UPDATE ON platform_admission_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION admission_test_reject()');
    await expect(claim(a.token, offer.id, offer.version, requestId)).rejects.toMatchObject({ status: 503 });
    expect((await store.own(a.token))?.state).toBe('RESERVED');
    expect((await pool.query('SELECT 1 FROM platform_admission_receipts WHERE request_id=$1', [requestId])).rowCount).toBe(0);
    await pool.query('DROP TRIGGER admission_test_commit ON platform_admission_entries');
    expect((await claim(a.token, offer.id, offer.version, requestId)).own?.state).toBe('ACTIVE');
});
it('denies a second room owner, fences the lost owner, and reconciles old leases without restoring room consent', async () => {
    await cap(2);
    const a = await actor(), b = await actor(), c = await actor();
    await active(a);
    await reserved(b);
    await enqueue(c.token);
    const second = new RoomAuthority(pool);
    const replacement = new AdmissionStore(pool, identity, { epoch: randomUUID(), assert: () => second.assert() });
    try {
        await expect(replacement.recover()).rejects.toMatchObject({ status: 503 });
        const owner = await admin.query<{
            pid: number;
        }>("SELECT pid FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=$1::oid AND objid=((hashtext($2)::bigint & 4294967295)::oid) AND objsubid=2 AND granted", [ROOM_OWNER_LOCK_CLASS, schema]);
        expect(owner.rows).toHaveLength(1);
        await admin.query('SELECT pg_terminate_backend($1)', [owner.rows[0].pid]);
        await expect(store.offer(randomUUID())).rejects.toMatchObject({ status: 503 });
        expect(await replacement.recover()).toBe(true);
        expect(await replacement.capacity()).toMatchObject({ occupancy: 0, queued: 1 });
        expect(await replacement.own(a.token)).toBeNull();
        expect((await replacement.offer(randomUUID()))?.accountId).toBe(c.id);
        await expect(store.capacity()).rejects.toMatchObject({ status: 503 });
    }
    finally {
        replacement.close();
        second.close();
    }
});
it('bounds queue count, ticket TTL, receipt retention and account deletion; no credentials or peer identities enter own DTOs', async () => {
    await cap(1);
    const a = await actor(), b = await actor();
    await pool.query('UPDATE platform_admission_policy SET max_tickets=1 WHERE singleton=true');
    const own = (await enqueue(a.token)).own!;
    await expect(enqueue(b.token)).rejects.toMatchObject({ status: 429 });
    expect(JSON.stringify(own)).not.toMatch(new RegExp(a.id + '|' + b.id + '|' + a.token));
    expect(Date.parse(own.expiresAt!) - Date.parse(own.observedAt)).toBeLessThanOrEqual(900000);
    await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()-interval '1 second'");
    await pool.query("UPDATE platform_admission_receipts SET created_at=clock_timestamp()-interval '8 days'");
    expect((await enqueue(b.token)).own).toMatchObject({ state: 'WAITING', position: 1 });
    expect((await pool.query('SELECT 1 FROM platform_admission_receipts WHERE account_id=$1', [a.id])).rowCount).toBe(0);
    await identity.delete(b.token, randomUUID());
    expect((await pool.query('SELECT 1 FROM platform_admission_entries')).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM platform_admission_receipts')).rowCount).toBe(0);
    expect((await store.capacity()).occupancy).toBe(0);
});
it('limits each TTL janitor transaction to 100 tickets and 100 old receipts', async () => {
    const a = await actor();
    const ids = (await pool.query<{
        id: string;
    }>("INSERT INTO identity_accounts(id,created_at) SELECT gen_random_uuid(),clock_timestamp() FROM generate_series(1,101) RETURNING id")).rows.map(row => row.id);
    await pool.query("INSERT INTO platform_admission_entries(account_id,id,phase,version,expires_at) SELECT id,gen_random_uuid(),'WAITING',1,clock_timestamp()-interval '1 second' FROM unnest($1::uuid[]) id", [ids]);
    await pool.query("INSERT INTO platform_admission_receipts(account_id,request_id,action,fingerprint,created_at) SELECT $1,gen_random_uuid(),'enqueue',repeat('a',64),clock_timestamp()-interval '8 days' FROM generate_series(1,101)", [a.id]);
    expect((await store.capacity()).queued).toBe(1);
    expect((await pool.query('SELECT 1 FROM platform_admission_receipts')).rowCount).toBe(1);
    expect((await store.capacity()).queued).toBe(0);
    expect((await pool.query('SELECT 1 FROM platform_admission_receipts')).rowCount).toBe(0);
});
it('bounds real policy lock waits and statement execution without ending the shared DB pool', async () => {
    const lock = await pool.connect();
    try {
        await lock.query('BEGIN');
        await lock.query('SELECT 1 FROM platform_admission_policy FOR UPDATE');
        const started = Date.now();
        await expect(store.capacity()).rejects.toMatchObject({ status: 503 });
        expect(Date.now() - started).toBeLessThan(4000);
    }
    finally {
        await lock.query('ROLLBACK');
        lock.release();
    }
    let delayed = false;
    const slow = intercepted(async (db, text, args) => { const result = await actual(db, text, args); if (!delayed && text === 'SELECT clock_timestamp() AS at') {
        delayed = true;
        await db.query('SELECT pg_sleep(10)');
    } return result; });
    try {
        const started = Date.now();
        await expect(slow.capacity()).rejects.toMatchObject({ status: 503 });
        expect(Date.now() - started).toBeLessThan(5000);
        expect((await store.capacity()).occupancy).toBe(0);
        expect((await pool.query('SELECT 1 AS alive')).rows[0].alive).toBe(1);
    }
    finally {
        slow.close();
    }
});
it('does not pin a queue row before the identity-owned deletion can finish',async()=>{
    await cap(1);const a=await actor();await enqueue(a.token);let began!:()=>void,release!:()=>void;const reached=new Promise<void>(resolve=>{began=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});let paused=false;
    const allocator=intercepted(async(db,text,args)=>{const result=await actual(db,text,args);if(text.startsWith('SELECT * FROM platform_admission_entries WHERE phase=')&&!paused){paused=true;began();await gate;}return result;});
    const offered=allocator.offer(randomUUID());await reached;const deletion=identity.delete(a.token,randomUUID());
    try{const finished=await Promise.race([deletion.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),300))]);expect(finished).toBe(true);}finally{release();await Promise.allSettled([offered,deletion]);allocator.close();}
    expect(await offered).toBeNull();expect((await store.capacity()).occupancy).toBe(0);expect((await pool.query('SELECT 1 FROM platform_admission_receipts WHERE account_id=$1',[a.id])).rowCount).toBe(0);
});
