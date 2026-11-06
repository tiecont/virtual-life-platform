import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AdmissionCommandSchema, AdmissionOwnStateSchema, AdmissionCapacitySchema, AdmissionQueueViewSchema, type AdmissionOwnState } from '@virtual-city/contracts';
import type { IdentityService, IdentityContext } from '../identity/service';
import { DomainError } from '../common/errors';
type Owner = {
    epoch: string;
    assert: () => Promise<void>;
};
type Policy = {
    version: number;
    hard: number;
    target: number;
    pending_hard: number | null;
    paused: boolean;
    offer_ttl_ms: number;
    grace_ttl_ms: number;
    ticket_ttl_ms: number;
    max_tickets: number;
    owner_epoch: string | null;
};
type Entry = {
    account_id: string;
    id: string;
    phase: 'WAITING' | 'RESERVED' | 'ACTIVE' | 'RECONNECT_GRACE';
    version: number;
    expires_at: Date | null;
    owner_epoch: string | null;
    queue_order: string;
};
type Context = {
    db: PoolClient;
    actor?: IdentityContext;
    policy: Policy;
    at: Date;
    deadline?: Date;
};
const uuid = z.uuid().transform(value => value.toLowerCase()), version = z.number().int().min(1).max(2147483646);
const transport = z.strictObject({
    schemaVersion: z.literal(1), requestId: uuid, action: z.enum(['disconnect', 'reconnect']), id: uuid, expectedVersion: version
});
const unavailable = () => new DomainError('WORLD_UNAVAILABLE', 503, 'Admission unavailable'), conflict = () => new DomainError('IDEMPOTENCY_CONFLICT', 409, 'Admission changed; refresh before retrying'), limited = () => new DomainError('RATE_LIMITED', 429, 'Please wait before another admission request');
// Unwired service port: the single room owner supplies its stable runtime epoch.
// Actor commands lock identity first, then the singleton policy; allocation never
// takes an identity lock in the inverse order.
export class AdmissionStore {
    private closed = false;
    private pending = 0;
    private checkouts = 0;
    private leases = new Set<(destroy?: boolean) => void>();
    private readonly owner: Owner;
    constructor(private pool: Pick<Pool, 'connect'>, private identity: IdentityService, owner: Owner) {
        this.owner = Object.freeze({ epoch: uuid.parse(owner.epoch), assert: () => owner.assert() });
    }
    // Keep the checkout latch until the underlying promise settles, even after timeout.
    private connect() {
        if (this.closed || this.checkouts >= 64)
            throw unavailable();
        this.checkouts++;
        return new Promise<{
            db: PoolClient;
            release: (destroy?: boolean) => void;
            isOpen: () => boolean;
        }>((resolve, reject) => {
            let expired = false;
            const timer = setTimeout(() => {
                expired = true;
                reject(unavailable());
            }, 2000);
            Promise.resolve().then(() => this.pool.connect()).then(db => {
                clearTimeout(timer);
                this.checkouts--;
                if (expired || this.closed) {
                    db.release(true);
                    reject(unavailable());
                    return;
                }
                let done = false;
                const release = (destroy = false) => {
                    if (done)
                        return;
                    done = true;
                    this.leases.delete(release);
                    db.removeListener('error', onError);
                    db.release(destroy);
                };
                const onError = () => release(true);
                db.on('error', onError);
                this.leases.add(release);
                resolve({
                    db, release, isOpen: () => !done
                });
            }, error => {
                clearTimeout(timer);
                this.checkouts--;
                reject(error);
            });
        });
    }
    private async clock(db: PoolClient) {
        return (await db.query<{
            at: Date;
        }>('SELECT clock_timestamp() AS at')).rows[0].at;
    }
    private async tx<T>(credential: string | undefined, work: (context: Context) => Promise<T>, recover = false): Promise<T> {
        if (this.closed)
            throw unavailable();
        if (this.pending >= 64)
            throw limited();
        this.pending++;
        let lease: Awaited<ReturnType<AdmissionStore['connect']>> | undefined, timer: ReturnType<typeof setTimeout> | undefined, reusable = false, expired = false;
        try {
            await this.owner.assert();
            lease = await this.connect();
            const db = lease.db;
            const run = async () => {
                await db.query('BEGIN');
                await db.query("SET LOCAL statement_timeout='2000ms'");
                await db.query("SET LOCAL lock_timeout='1000ms'");
                let actor: IdentityContext | undefined;
                if (credential !== undefined) {
                    actor = await this.identity.contextInTransaction(db, credential);
                    await this.identity.lockAccounts(db, [actor.accountId]);
                    actor = await this.identity.contextInTransaction(db, credential);
                }
                const policy = (await db.query<Policy>('SELECT * FROM platform_admission_policy WHERE singleton=true FOR UPDATE')).rows[0];
                if (!policy || !recover && policy.owner_epoch !== this.owner.epoch)
                    throw unavailable();
                const context: Context = {
                    db, actor, policy, at: await this.clock(db)
                };
                if (!recover)
                    await this.expire(context);
                const value = await work(context);
                if (credential !== undefined)
                    await this.identity.contextInTransaction(db, credential);
                await this.owner.assert();
                const final = await this.clock(db);
                if (context.deadline && final >= context.deadline)
                    throw conflict();
                if (expired || this.closed || !lease?.isOpen())
                    throw unavailable();
                await db.query('COMMIT');
                return value;
            };
            const result = await Promise.race([run(), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        expired = true;
                        lease?.release(true);
                        reject(unavailable());
                    }, 6000);
                })]);
            await this.owner.assert();
            if (!lease.isOpen())
                throw unavailable();
            reusable = true;
            return result;
        }
        catch (error) {
            try {
                if (lease && !expired)
                    await lease.db.query('ROLLBACK');
            }
            catch {
                // A lost COMMIT acknowledgement is reconciled from durable receipt/current state.
            }
            if (error instanceof DomainError || error instanceof z.ZodError || error && typeof error === 'object' && 'status' in error)
                throw error;
            throw unavailable();
        }
        finally {
            clearTimeout(timer);
            lease?.release(!reusable);
            this.pending--;
        }
    }
    private async counts(db: PoolClient) {
        return (await db.query<{
            active: number;
            grace: number;
            reserved: number;
            queued: number;
        }>("SELECT count(*) FILTER(WHERE phase='ACTIVE')::int AS active,count(*) FILTER(WHERE phase='RECONNECT_GRACE')::int AS grace,count(*) FILTER(WHERE phase='RESERVED')::int AS reserved,count(*) FILTER(WHERE phase='WAITING')::int AS queued FROM platform_admission_entries")).rows[0];
    }
    private async settle(context: Context) {
        const c = await this.counts(context.db), occupied = c.active + c.grace + c.reserved;
        if (context.policy.pending_hard !== null && occupied <= context.policy.pending_hard) {
            await context.db.query('UPDATE platform_admission_policy SET hard=pending_hard,pending_hard=NULL WHERE singleton=true');
            context.policy.hard = context.policy.pending_hard;
            context.policy.pending_hard = null;
        }
    }
    // Bounded opportunistic janitor; expired rows beyond this batch remain counted
    // conservatively and cannot be claimed. ACTIVE never expires by wall clock.
    private async expire(context: Context) {
        await context.db.query("DELETE FROM platform_admission_entries WHERE account_id IN(SELECT account_id FROM platform_admission_entries WHERE phase<>'ACTIVE' AND expires_at<=clock_timestamp() ORDER BY expires_at,queue_order LIMIT 100)");
        await context.db.query("DELETE FROM platform_admission_receipts WHERE (account_id,request_id) IN(SELECT account_id,request_id FROM platform_admission_receipts WHERE created_at<=clock_timestamp()-interval '7 days' ORDER BY created_at,account_id,request_id LIMIT 100)");
        await this.settle(context);
        context.at = await this.clock(context.db);
    }
    private async row(db: PoolClient, account: string) {
        return (await db.query<Entry>('SELECT * FROM platform_admission_entries WHERE account_id=$1', [account])).rows[0];
    }
    private async view(context: Context, account: string): Promise<AdmissionOwnState | null> {
        const entry = await this.row(context.db, account), at = await this.clock(context.db);
        if (!entry || entry.expires_at && entry.expires_at <= at || entry.phase !== 'WAITING' && entry.owner_epoch !== this.owner.epoch)
            return null;
        const position = entry.phase === 'WAITING' ? (await context.db.query<{
            n: number;
        }>("SELECT count(*)::int AS n FROM platform_admission_entries WHERE phase='WAITING' AND queue_order<=$1 AND expires_at>clock_timestamp()", [entry.queue_order])).rows[0].n : undefined;
        if (entry.phase === 'WAITING' && !position)
            return null;
        return AdmissionOwnStateSchema.parse({
            schemaVersion: 1, policyVersion: context.policy.version, version: entry.version, id: entry.id, state: entry.phase, observedAt: at.toISOString(), expiresAt: entry.expires_at?.toISOString() ?? null, ...position ? { position } : {}
        });
    }
    // Receipts prove application, never replay an obsolete grant snapshot.
    private async prior(context: Context, account: string, request: string, fingerprint: string) {
        const row = (await context.db.query<{
            fingerprint: string;
        }>('SELECT fingerprint FROM platform_admission_receipts WHERE account_id=$1 AND request_id=$2', [account, request])).rows[0];
        if (row && row.fingerprint !== fingerprint)
            throw conflict();
        return Boolean(row);
    }
    private async remember(context: Context, account: string, request: string, action: string, fingerprint: string) {
        await context.db.query('INSERT INTO platform_admission_receipts(account_id,request_id,action,fingerprint) VALUES($1,$2,$3,$4)', [account, request, action, fingerprint]);
    }
    async recover() {
        return this.tx(undefined, async (context) => {
            if (context.policy.owner_epoch === this.owner.epoch)
                return true;
            await context.db.query("DELETE FROM platform_admission_entries WHERE account_id IN(SELECT account_id FROM platform_admission_entries WHERE phase<>'WAITING' AND owner_epoch IS DISTINCT FROM $1 ORDER BY queue_order LIMIT 100)", [this.owner.epoch]);
            const remaining = (await context.db.query("SELECT 1 FROM platform_admission_entries WHERE phase<>'WAITING' AND owner_epoch IS DISTINCT FROM $1 LIMIT 1", [this.owner.epoch])).rowCount;
            if (remaining)
                return false;
            await context.db.query('UPDATE platform_admission_policy SET owner_epoch=$1 WHERE singleton=true', [this.owner.epoch]);
            await this.settle(context);
            return true;
        }, true);
    }
    async own(credential: string) {
        return this.tx(credential, context => this.view(context, context.actor!.accountId));
    }
    async queueView(credential: string) {
        return this.tx(credential, async context => {
            const own = await this.view(context, context.actor!.accountId);
            const counts = await this.counts(context.db), occupied = counts.active + counts.grace + counts.reserved, p = context.policy;
            const availability = occupied > p.target ? 'DRAINING_LIMIT' : p.paused ? 'PAUSED' : p.target === 0 ? 'CLOSED' : occupied >= p.target ? 'FULL' : 'OPEN';
            return AdmissionQueueViewSchema.parse({schemaVersion:1,viewerAccountId:context.actor!.accountId,observedAt:own?.observedAt ?? context.at.toISOString(),availability,own,etaSeconds:null});
        });
    }
    async capacity() {
        return this.tx(undefined, async (context) => {
            const c = await this.counts(context.db), occupancy = c.active + c.grace + c.reserved, p = context.policy, mode = occupancy > p.target ? 'DRAINING_LIMIT' : p.paused ? 'PAUSED' : p.target === 0 ? 'CLOSED' : occupancy >= p.target ? 'FULL' : 'OPEN';
            return AdmissionCapacitySchema.parse({
                schemaVersion: 1, policyVersion: p.version, hard: p.hard, target: p.target, pendingHard: p.pending_hard, paused: p.paused, active: c.active, reconnectGrace: c.grace, reserved: c.reserved, occupancy, queued: c.queued, mode
            });
        });
    }
    async command(credential: string, input: unknown) {
        return this.mutate(credential, AdmissionCommandSchema.parse(input));
    }
    async disconnect(credential: string, id: string, expectedVersion: number, requestId: string) {
        return this.mutate(credential, transport.parse({
            schemaVersion: 1, action: 'disconnect', id, expectedVersion, requestId
        }));
    }
    async reconnect(credential: string, id: string, expectedVersion: number, requestId: string) {
        return this.mutate(credential, transport.parse({
            schemaVersion: 1, action: 'reconnect', id, expectedVersion, requestId
        }));
    }
    private async mutate(credential: string, command: ReturnType<typeof AdmissionCommandSchema.parse> | ReturnType<typeof transport.parse>) {
        return this.tx(credential, async (context) => {
            const account = context.actor!.accountId, fingerprint = this.identity.fingerprint(['admission:v1', command]);
            if (await this.prior(context, account, command.requestId, fingerprint))
                return {
                    schemaVersion: 1 as const, requestId: command.requestId, own: await this.view(context, account)
                };
            if ((await context.db.query<{
                n: number;
            }>("SELECT count(*)::int AS n FROM platform_admission_receipts WHERE account_id=$1 AND action<>'offer' AND created_at>clock_timestamp()-interval '1 minute'", [account])).rows[0].n >= 30)
                throw limited();
            await context.db.query("DELETE FROM platform_admission_entries WHERE account_id=$1 AND phase<>'ACTIVE' AND expires_at<=clock_timestamp()", [account]);
            const entry = await this.row(context.db, account);
            if (command.action === 'enqueue') {
                if (!entry) {
                    if ((await this.counts(context.db)).queued >= context.policy.max_tickets)
                        throw limited();
                    await context.db.query("INSERT INTO platform_admission_entries(account_id,id,phase,version,expires_at) VALUES($1,$2,'WAITING',1,clock_timestamp()+$3*interval '1 millisecond')", [account, randomUUID(), context.policy.ticket_ttl_ms]);
                }
            }
            else {
                const id = command.action === 'claim' ? command.offerId : command.id;
                if (!entry || entry.id !== id || entry.version !== command.expectedVersion || entry.owner_epoch !== this.owner.epoch && entry.phase !== 'WAITING')
                    throw conflict();
                if (command.action === 'leave') {
                    await context.db.query('DELETE FROM platform_admission_entries WHERE account_id=$1', [account]);
                    await this.settle(context);
                }
                else if (command.action === 'claim') {
                    if (entry.phase !== 'RESERVED' || !entry.expires_at || entry.expires_at <= await this.clock(context.db))
                        throw conflict();
                    context.deadline = entry.expires_at;
                    await context.db.query("UPDATE platform_admission_entries SET phase='ACTIVE',expires_at=NULL,version=version+1,changed_at=clock_timestamp() WHERE account_id=$1", [account]);
                }
                else if (command.action === 'disconnect') {
                    if (entry.phase !== 'ACTIVE')
                        throw conflict();
                    await context.db.query("UPDATE platform_admission_entries SET phase='RECONNECT_GRACE',expires_at=clock_timestamp()+$2*interval '1 millisecond',version=version+1,changed_at=clock_timestamp() WHERE account_id=$1", [account, context.policy.grace_ttl_ms]);
                }
                else {
                    if (entry.phase !== 'RECONNECT_GRACE' || !entry.expires_at || entry.expires_at <= await this.clock(context.db))
                        throw conflict();
                    context.deadline = entry.expires_at;
                    await context.db.query("UPDATE platform_admission_entries SET phase='ACTIVE',expires_at=NULL,version=version+1,changed_at=clock_timestamp() WHERE account_id=$1", [account]);
                }
            }
            await this.remember(context, account, command.requestId, command.action, fingerprint);
            return {
                schemaVersion: 1 as const, requestId: command.requestId, own: await this.view(context, account)
            };
        });
    }
    async offer(requestId: string) {
        requestId = uuid.parse(requestId);
        return this.tx(undefined, async (context) => {
            const fingerprint = this.identity.fingerprint(['admission-offer:v1', this.owner.epoch]), previous = (await context.db.query<{
                account_id: string;
                fingerprint: string;
            }>("SELECT account_id,fingerprint FROM platform_admission_receipts WHERE request_id=$1 AND action='offer'", [requestId])).rows[0];
            if (previous) {
                if (previous.fingerprint !== fingerprint)
                    throw conflict();
                const own = await this.view(context, previous.account_id);
                return own ? { accountId: previous.account_id, own } : null;
            }
            const counts = await this.counts(context.db);
            if (context.policy.paused || counts.active + counts.grace + counts.reserved >= context.policy.target)
                return null;
            for (let i = 0; i < 100; i++) {
                const entry = (await context.db.query<Entry>("SELECT * FROM platform_admission_entries WHERE phase='WAITING' AND expires_at>clock_timestamp() ORDER BY queue_order LIMIT 1")).rows[0];
                if (!entry)
                    return null;
                if (!await this.identity.admissionAvailable(context.db, entry.account_id)) {
                    await context.db.query('DELETE FROM platform_admission_entries WHERE account_id=$1', [entry.account_id]);
                    continue;
                }
                // FK custody precedes the entry write, matching account deletion order.
                await this.remember(context, entry.account_id, requestId, 'offer', fingerprint);
                const updated = await context.db.query("UPDATE platform_admission_entries SET id=$2,phase='RESERVED',owner_epoch=$3,expires_at=clock_timestamp()+$4*interval '1 millisecond',version=version+1,changed_at=clock_timestamp() WHERE account_id=$1", [entry.account_id, randomUUID(), this.owner.epoch, context.policy.offer_ttl_ms]);
                if (updated.rowCount !== 1) throw unavailable();
                const own = await this.view(context, entry.account_id);
                return own ? { accountId: entry.account_id, own } : null;
            }
            return null;
        });
    }
    close() {
        this.closed = true;
        for (const release of this.leases)
            release(true);
    }
}
