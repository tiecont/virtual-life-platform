import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import { MeSchema, SocialSettingsSchema, FriendRequestResultSchema, FriendsPageSchema, SocialRequestsPageSchema, BlocksPageSchema, type Me, type SocialSettings, type SharedActivity } from '@virtual-city/contracts';
let pool: Pool; let admin: Pool; let app: Awaited<ReturnType<typeof createApp>>; let url: string; let serial = 1; let offset = 0;
const origin = 'http://127.0.0.1:3300'; const now = () => Date.now() + offset;
const schema = 'social_test_' + randomUUID().replaceAll('-', '');
// Controlled policy-projection fixture only. No room runtime/online count is simulated or shipped.
const activity = new Map<string, SharedActivity>();
const config = () => readConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, SESSION_SECRET: 'social-test-only-session-secret-00000001' });
const cookie = (r: { headers: Record<string, unknown> }) => String(Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'][0] : r.headers['set-cookie']).split(';')[0];
type User = { cookie: string; me: Me; settings: SocialSettings };
beforeAll(async () => {
  const connection = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  admin = new Pool({ connectionString: connection.toString() }); await admin.query(`CREATE SCHEMA "${schema}"`);
  connection.searchParams.set('options', '-c search_path=' + schema); pool = new Pool({ connectionString: connection.toString() }); await migrate(pool);
  app = await createApp(config(), pool, false, { now, socialPresence: { visibleActivity: async (_viewer, target) => activity.get(target) ?? null } }); await app.app.listen(0, '127.0.0.1'); url = await app.app.getUrl();
});
afterAll(async () => { await app?.app.close(); await pool?.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
async function guest(displayName = 'Social Test Visitor'): Promise<User> {
  const response = await app.http.inject({ method: 'POST', url: '/v1/session/guest', headers: { origin }, remoteAddress: '127.9.0.' + serial++, payload: { requestId: randomUUID(), displayName, avatarKey: 'mint' } }); expect(response.statusCode).toBe(201);
  const user = { cookie: cookie(response), me: MeSchema.parse(response.json()) };
  const settings = await app.http.inject({ url: '/v1/social/me', headers: { cookie: user.cookie } }); expect(settings.statusCode).toBe(200);
  return { ...user, settings: SocialSettingsSchema.parse(settings.json()) };
}
const headers = (user: User, key = randomUUID()) => ({ origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': key });
const send = (from: User, to: User, key = randomUUID()) => app.http.inject({ method: 'POST', url: '/v1/friends/requests', headers: headers(from, key), payload: { contactCode: to.settings.contactCode } });
const respond = (user: User, id: string, action: 'accept' | 'decline' | 'cancel', key = randomUUID()) => app.http.inject({ method: 'POST', url: '/v1/friends/requests/' + id + '/respond', headers: headers(user, key), payload: { action } });
const friends = async (user: User, query = '') => FriendsPageSchema.parse((await app.http.inject({ url: '/v1/friends' + query, headers: { cookie: user.cookie } })).json());
const requests = async (user: User, query = '') => SocialRequestsPageSchema.parse((await app.http.inject({ url: '/v1/friends/requests' + query, headers: { cookie: user.cookie } })).json());
const block = (actor: User, target: User, blocked = true, key = randomUUID()) => app.http.inject({ method: 'POST', url: '/v1/blocks', headers: headers(actor, key), payload: { targetId: target.me.profile.id, blocked } });
async function befriend(a: User, b: User) { const requestKey=randomUUID(); const acceptKey=randomUUID(); const request = await send(a, b,requestKey); expect(request.statusCode).toBe(200); const accepted = await respond(b, request.json().id, 'accept',acceptKey); expect(accepted.json().state).toBe('ACCEPTED'); return {requestId:request.json().id,requestKey,acceptKey}; }
describe('M04 actual PostgreSQL/HTTP social graph and privacy', () => {
  it('requires recipient consent and keeps pending target profile private', async () => {
    const a = await guest('Sender Visitor'); const b = await guest('Hidden Recipient'); const outsider = await guest();
    const key = randomUUID(); const created = await send(a, b, key); expect(created.statusCode).toBe(200); expect(created.body).not.toContain(b.me.profile.id); expect(created.body).not.toContain('Hidden Recipient');
    const row = FriendRequestResultSchema.parse(created.json()); expect(row.state).toBe('PENDING');
    const incoming = await requests(b); expect(incoming.items[0].sender?.id).toBe(a.me.profile.id);
    const outgoing = await requests(a); expect(outgoing.items[0].sender).toBe(null); expect(JSON.stringify(outgoing)).not.toContain('Hidden Recipient');
    expect((await friends(a)).items).toEqual([]); expect((await respond(a, row.id, 'accept')).statusCode).toBe(403); expect((await respond(outsider, row.id, 'accept')).statusCode).toBe(404);
    const acceptKey = randomUUID(); const accepted = await Promise.all([respond(b, row.id, 'accept', acceptKey), respond(b, row.id, 'accept', acceptKey)]);
    expect(accepted.every(r => r.statusCode === 200 && r.json().state === 'ACCEPTED')).toBe(true);
    expect((await friends(a)).items[0].profile.id).toBe(b.me.profile.id); expect((await friends(a)).items[0].activity).toBe(null);
    expect((await pool.query('SELECT count(*)::int AS n FROM social_friendships WHERE low_id=LEAST($1::uuid,$2::uuid) AND high_id=GREATEST($1::uuid,$2::uuid)', [a.me.profile.id, b.me.profile.id])).rows[0].n).toBe(1);
    expect((await send(a, b, key)).json()).toEqual(row); // original receipt is an outcome, not live graph authority
  });
  it('serializes reciprocal concurrent requests into one request and one graph edge', async () => {
    const a = await guest(); const b = await guest(); const results = await Promise.all([send(a, b), send(b, a)]); expect(results.every(r => r.statusCode === 200)).toBe(true);
    const records = (await pool.query('SELECT id,state FROM social_friend_requests WHERE pair_low=LEAST($1::uuid,$2::uuid) AND pair_high=GREATEST($1::uuid,$2::uuid)', [a.me.profile.id, b.me.profile.id])).rows;
    expect(records).toHaveLength(1); expect(records[0].state).toBe('ACCEPTED'); expect((await friends(a)).items).toHaveLength(1); expect((await friends(b)).items).toHaveLength(1);
  });
  it('PostgreSQL rejects duplicate pending pairs, invalid states and self friendship independently of HTTP', async () => {
    const a = await guest(); const b = await guest(); const pending = await send(a, b); expect(pending.statusCode).toBe(200);
    await expect(pool.query("INSERT INTO social_friend_requests(id,from_id,to_id,state,target_code_hint,created_at,expires_at) VALUES($1,$2,$3,'PENDING','fixture',now(),now()+interval '1 day')", [randomUUID(), b.me.profile.id, a.me.profile.id])).rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("UPDATE social_friend_requests SET state='FAKE' WHERE id=$1", [pending.json().id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('INSERT INTO social_friendships VALUES($1,$1,now())', [a.me.profile.id])).rejects.toMatchObject({ code: '23514' });
  });
  it('enforces idempotency scope and sender/recipient decline/cancel permissions', async () => {
    const a = await guest(); const b = await guest(); const c = await guest(); const key = randomUUID();
    const pending = await send(a, b, key); expect((await send(a, b)).json().id).toBe(pending.json().id); expect((await send(a, c, key)).statusCode).toBe(409);
    expect((await respond(b, pending.json().id, 'cancel')).statusCode).toBe(403); expect((await respond(b, pending.json().id, 'decline')).json().state).toBe('DECLINED');
    const next = await send(a, b); expect((await respond(a, next.json().id, 'cancel')).json().state).toBe('CANCELLED');
    expect((await friends(a)).items).toEqual([]);
  });
  it('unfriend and unblock never resurrect an old accepted request or friendship', async () => {
    const a = await guest(); const b = await guest(); const pending = await send(a, b); await respond(b, pending.json().id, 'accept');
    const remove = await app.http.inject({ method: 'DELETE', url: '/v1/friends/' + b.me.profile.id, headers: headers(a) }); expect(remove.statusCode).toBe(200);
    expect((await respond(b, pending.json().id, 'accept')).json().state).toBe('ACCEPTED'); expect((await friends(a)).items).toHaveLength(0);
    await block(a, b); expect(await app.social.canContact(a.me.profile.id, b.me.profile.id)).toBe(false); expect(await app.social.canContact(b.me.profile.id, a.me.profile.id)).toBe(false);
    await block(a, b, false); expect((await friends(a)).items).toHaveLength(0); expect((await send(a, b)).json().state).toBe('PENDING');
  });
  it('blocks override both directions immediately and do not disclose who blocked or current hidden profiles', async () => {
    const a = await guest('Block Owner'); const b = await guest('Known Friend'); const consent=await befriend(a, b);
    const key = randomUUID(); expect((await block(a, b, true, key)).statusCode).toBe(200); expect((await block(a, b, true, key)).statusCode).toBe(200);
    expect((await friends(a)).items).toHaveLength(0); expect((await friends(b)).items).toHaveLength(0);
    expect((await send(a, b)).statusCode).toBe(404); expect((await send(b, a)).statusCode).toBe(404);
    expect((await send(a,b,consent.requestKey)).statusCode).toBe(404); expect((await respond(b,consent.requestId,'accept',consent.acceptKey)).statusCode).toBe(404);
    const theirs = BlocksPageSchema.parse((await app.http.inject({ url: '/v1/blocks', headers: { cookie: b.cookie } })).json()); expect(theirs.items).toEqual([]);
    await app.http.inject({ method: 'PATCH', url: '/v1/me', headers: headers(b), payload: { displayName: 'New Hidden Name' } });
    const mine = BlocksPageSchema.parse((await app.http.inject({ url: '/v1/blocks', headers: { cookie: a.cookie } })).json()); expect(mine.items[0].label).toBe('Known Friend'); expect(JSON.stringify(mine)).not.toContain('New Hidden Name');
  });
  it('concurrent block and acceptance cannot leave an active friendship', async () => {
    const a = await guest(); const b = await guest(); const pending = await send(a, b);
    const results = await Promise.all([respond(b, pending.json().id, 'accept'), block(a, b)]); expect([200,404]).toContain(results[0].statusCode); expect(results[1].statusCode).toBe(200);
    expect((await friends(a)).items).toHaveLength(0); expect(await app.social.canContact(a.me.profile.id, b.me.profile.id)).toBe(false);
  });
  it('code rotation and disabling requests cancel pending offers without revealing a reason to the sender', async () => {
    const a = await guest(); const b = await guest(); await send(a, b);
    const rotate = await app.http.inject({ method: 'POST', url: '/v1/social/contact-code/rotate', headers: headers(b), payload: {} }); expect(rotate.statusCode).toBe(200); const changed = SocialSettingsSchema.parse(rotate.json()); expect(changed.contactCode).not.toBe(b.settings.contactCode);
    expect((await send(a, b)).statusCode).toBe(404); expect((await requests(a)).items).toHaveLength(0);
    b.settings = changed; expect((await send(a, b)).statusCode).toBe(200);
    expect((await app.http.inject({ method: 'PATCH', url: '/v1/social/me', headers: headers(b), payload: { requestPolicy: 'none' } })).statusCode).toBe(200);
    expect((await send(a, b)).statusCode).toBe(404); expect((await requests(b)).items).toHaveLength(0);
    expect((await app.http.inject({ url: '/v1/users/search?q=Hidden', headers: { cookie: a.cookie } })).statusCode).toBe(404);
  });
  it('filters all-world hidden activity, dating and unknown worlds through the server projection', async () => {
    const a = await guest(); const b = await guest(); const outsider = await guest(); await befriend(a, b);
    const worlds = ['deadline','maid','library','restaurant','lounge','dating','park','unknown-private-world'];
    for (const worldSlug of worlds) { activity.set(b.me.profile.id, { worldSlug }); expect((await friends(a)).items[0].activity).toBe(null); }
    const choices = { presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden', deadline: 'hidden' } };
    expect((await app.http.inject({ method: 'PATCH', url: '/v1/me/privacy', headers: headers(b), payload: choices })).statusCode).toBe(200);
    for (const worldSlug of ['dating','deadline','unknown-private-world']) { activity.set(b.me.profile.id, { worldSlug }); expect((await friends(a)).items[0].activity).toBe(null); }
    activity.set(b.me.profile.id, { worldSlug: 'maid' }); expect((await friends(a)).items[0].activity).toEqual({ worldSlug: 'maid' }); expect((await friends(outsider)).items).toEqual([]);
    expect((await app.http.inject({ url: '/v1/friends?actorId=' + a.me.profile.id, headers: { cookie: outsider.cookie } })).statusCode).toBe(422);
    await block(b, a); expect((await friends(a)).items).toEqual([]);
  });
  it('emits only minimal account-scoped refresh events over actual sockets', async () => {
    const a = await guest(); const b = await guest(); const outsider = await guest(); const sockets: Socket[] = [];
    async function connect(user: User) { const socket = io(url, { forceNew: true, reconnection: false, autoConnect: false, transports: ['websocket'], extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }); sockets.push(socket); await new Promise<void>((resolve,reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); return socket; }
    try {
      const receiver = await connect(b); const other = await connect(outsider); let leaks = 0; other.on('friendship.changed', () => leaks++);
      const changed = new Promise<unknown>(resolve => receiver.once('friendship.changed', resolve)); expect((await send(a, b)).statusCode).toBe(200); expect(await changed).toEqual({ schemaVersion: 1 });
      await other.timeout(2000).emitWithAck('session.check', { schemaVersion: 1, requestId: randomUUID() }); expect(leaks).toBe(0);
    } finally { sockets.forEach(s => s.close()); }
  });
  it('enforces persistent daily request limits even with a fresh HTTP/service instance and exposes a minimal abuse hook', async () => {
    const actor = await guest(); const targets: User[] = []; for (let i = 0; i < 21; i++) targets.push(await guest());
    const observed: unknown[] = []; const unsubscribe = app.social.onAbuse(event => observed.push(event));
    try {
      for (let i = 0; i < 20; i++) expect((await send(actor, targets[i])).statusCode).toBe(200);
      const denied = await send(actor, targets[20]); expect(denied.statusCode).toBe(429); expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0); expect(observed).toEqual([{ actorId: actor.me.profile.id, code: 'REQUEST_LIMITED' }]);
      const restarted = await createApp(config(), pool, false, { now });
      try { expect((await restarted.http.inject({ method: 'POST', url: '/v1/friends/requests', headers: headers(actor), payload: { contactCode: targets[20].settings.contactCode } })).statusCode).toBe(429); }
      finally { await restarted.app.close(); }
      const first = await requests(actor, '?limit=10'); expect(first.items).toHaveLength(10); expect(first.nextCursor).not.toBe(null);
      const second = await requests(actor, '?limit=10&cursor=' + first.nextCursor); expect(second.items).toHaveLength(10); expect(new Set([...first.items,...second.items].map(r=>r.id)).size).toBe(20);
    } finally { unsubscribe(); }
  });
  it('large graph concurrent accepts cannot exceed the configured 500-friend cap (fixture, not a load benchmark)', async () => {
    const actor = await guest(); const b = await guest(); const c = await guest();
    const ids = (await pool.query<{id:string}>("INSERT INTO identity_accounts(id,kind,created_at) SELECT gen_random_uuid(),'guest',now() FROM generate_series(1,499) RETURNING id")).rows.map(row=>row.id);
    await pool.query("INSERT INTO identity_profiles(account_id,display_name,avatar_key) SELECT id,'Synthetic graph fixture','fern' FROM identity_accounts WHERE id=ANY($1::uuid[])", [ids]);
    await pool.query('INSERT INTO social_friendships(low_id,high_id,created_at) SELECT LEAST($1::uuid,id),GREATEST($1::uuid,id),now() FROM identity_accounts WHERE id=ANY($2::uuid[])', [actor.me.profile.id, ids]);
    const one = await send(b, actor); const two = await send(c, actor); const outcomes = await Promise.all([respond(actor, one.json().id, 'accept'), respond(actor, two.json().id, 'accept')]);
    expect(outcomes.filter(r=>r.statusCode===200)).toHaveLength(1); expect((await pool.query('SELECT count(*)::int AS n FROM social_friendships WHERE low_id=$1 OR high_id=$1', [actor.me.profile.id])).rows[0].n).toBe(500);
    const page = await friends(actor, '?limit=50'); expect(page.items).toHaveLength(50); expect(page.nextCursor).not.toBe(null);
  });
  it('rejects anonymous/cross-origin/CSRF/forged-actor mutations and oversized pagination', async () => {
    const a = await guest(); const b = await guest();
    expect((await app.http.inject('/v1/social/me')).statusCode).toBe(401);
    expect((await app.http.inject({ method: 'POST', url: '/v1/friends/requests', headers: { ...headers(a), origin: 'https://attacker.example' }, payload: { contactCode: b.settings.contactCode } })).statusCode).toBe(403);
    expect((await app.http.inject({ method: 'POST', url: '/v1/friends/requests', headers: { ...headers(a), 'x-csrf-token': 'wrong' }, payload: { contactCode: b.settings.contactCode } })).statusCode).toBe(403);
    expect((await app.http.inject({ method: 'POST', url: '/v1/blocks', headers: headers(a), payload: { targetId: b.me.profile.id, blocked: true, actorId: b.me.profile.id } })).statusCode).toBe(422);
    expect((await app.http.inject({ url: '/v1/friends?limit=10000', headers: { cookie: a.cookie } })).statusCode).toBe(422);
  });
  it('self export omits others confidential blocks and account deletion cascades only related social records', async () => {
    const a = await guest(); const b = await guest(); const c = await guest(); await befriend(a,b); await block(c,a); await block(c,b);
    const exported = await app.http.inject({ url: '/v1/me/export', headers: { cookie: a.cookie } }); expect(exported.statusCode).toBe(200); expect(exported.json().domains.social.friends).toHaveLength(1); expect(exported.body).not.toContain(c.me.profile.id);
    expect((await app.http.inject({ method: 'DELETE', url: '/v1/me', headers: headers(a) })).statusCode).toBe(200);
    expect((await friends(b)).items).toEqual([]); const remaining = BlocksPageSchema.parse((await app.http.inject({ url: '/v1/blocks', headers: { cookie: c.cookie } })).json()); expect(remaining.items.map(r=>r.targetId)).toEqual([b.me.profile.id]);
    expect((await app.http.inject({ url: '/v1/me', headers: { cookie: c.cookie } })).statusCode).toBe(200);
  });
  it('registered upgrade preserves social consent, contact code and friendships while replacing the session', async () => {
    const a = await guest(); const b = await guest(); await befriend(a,b);
    const upgraded = await app.http.inject({ method: 'POST', url: '/v1/session/upgrade', headers: headers(a), payload: { loginName: 'social_' + randomUUID().replaceAll('-','').slice(0,16), password: 'social-upgrade-test-only-password' } });
    expect(upgraded.statusCode).toBe(200); const next = { ...a,cookie:cookie(upgraded),me:MeSchema.parse(upgraded.json()) }; expect(next.me.profile.id).toBe(a.me.profile.id);
    expect((await friends(next)).items[0].profile.id).toBe(b.me.profile.id);
    const settings = await app.http.inject({ url: '/v1/social/me', headers: { cookie: next.cookie } }); expect(settings.json().contactCode).toBe(a.settings.contactCode);
    expect((await app.http.inject({ url: '/v1/friends', headers: { cookie:a.cookie } })).statusCode).toBe(401);
  });
  it('expires requests authoritatively and purges bounded receipts/history', async () => {
    const a = await guest(); const b = await guest(); const pending = await send(a,b); offset += 7*86400000+1000;
    const result = await respond(b, pending.json().id, 'accept'); expect(result.statusCode).toBe(200); expect(result.json().state).toBe('EXPIRED'); expect((await friends(a)).items).toEqual([]);
    expect((await send(a,b)).json().state).toBe('PENDING'); offset += 40*86400000; await app.social.purgeExpired();
    expect((await pool.query('SELECT count(*)::int AS n FROM social_mutations')).rows[0].n).toBe(0); expect((await pool.query('SELECT count(*)::int AS n FROM social_friend_requests')).rows[0].n).toBe(0);
  });
});
