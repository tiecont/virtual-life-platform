'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';
import { ApiErrorSchema, FriendsPageSchema, InvitationChangedSchema, InvitationReceiptSchema, InvitationSettingsSchema, InvitationsPageSchema, MeSchema, WorldCatalogSchema, type FriendsPage, type InvitationSettings, type InvitationsPage, type Me, type WorldCard } from '@virtual-city/contracts';
class InvitationError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch('/v1' + path, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) { const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null)), code = parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR'; throw new InvitationError(response.status, code === 'UNAUTHENTICATED' ? 'Your session ended. Open identity to continue.' : code === 'RATE_LIMITED' ? 'Please wait before sending another invitation.' : code === 'NOT_AVAILABLE' || code === 'FORBIDDEN' ? 'This invitation is unavailable.' : code === 'WORLD_VERSION_MISMATCH' ? 'The destination changed. Refresh before sending.' : 'The change could not be confirmed. Retry or refresh.'); }
  return response.json() as Promise<unknown>;
}
export default function InvitationPanel({ socketOrigin }: { socketOrigin: string }) {
  const [me, setMe] = useState<Me | null>(null), [settings, setSettings] = useState<InvitationSettings | null>(null), [friends, setFriends] = useState<FriendsPage | null>(null), [inbox, setInbox] = useState<InvitationsPage | null>(null), [worlds, setWorlds] = useState<WorldCard[]>([]);
  const [recipient, setRecipient] = useState(''), [destination, setDestination] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [live, setLive] = useState(false), [preferenceDraft, setPreferenceDraft] = useState<boolean | null>(null);
  const mounted = useRef(true), sequence = useRef(0), pending = useRef(new Map<string, string>()), account = useRef<string | null>(null), mutation = useRef(false);
  const refresh = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const actor = MeSchema.parse(await api('/me'));
      const [preference, contacts, invitations, catalog] = await Promise.all([api('/me/invitations/settings'), api('/friends'), api('/invitations'), api('/worlds')]);
      if (!mounted.current || ticket !== sequence.current) return false;
      if (account.current !== actor.profile.id) { pending.current.clear(); setRecipient(''); setDestination(''); account.current = actor.profile.id; }
      setMe(actor); setSettings(InvitationSettingsSchema.parse(preference)); setFriends(FriendsPageSchema.parse(contacts)); setInbox(InvitationsPageSchema.parse(invitations)); setWorlds(WorldCatalogSchema.parse(catalog).worlds.filter(world => world.availability === 'available' && world.accessHint === 'session-required' && world.slug !== 'dating')); return true;
    } catch (error) {
      if (mounted.current && ticket === sequence.current) {
        setMessage(error instanceof InvitationError ? error.message : 'Invitations are unavailable. Refresh to try again.');
        // Clear private projections whenever freshness cannot be established.
        setInbox(null); setFriends(null); setWorlds([]);
        if (error instanceof InvitationError && error.status === 401) { setMe(null); setSettings(null); account.current = null; pending.current.clear(); }
      } return false;
    } finally { if (mounted.current && ticket === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh(); const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('virtual-city-identity');
    if (bus) bus.onmessage = () => { setInbox(null); setFriends(null); pending.current.clear(); void refresh(); };
    return () => { mounted.current = false; sequence.current++; bus?.close(); };
  }, [refresh]);
  const csrf = me?.csrfToken, accountId = me?.profile.id;
  useEffect(() => {
    if (!csrf || !accountId) return;
    const socket = io(socketOrigin, { reconnection: true, reconnectionAttempts: 3, transports: ['websocket'], withCredentials: true, auth: { schemaVersion: 1, csrfToken: csrf } });
    socket.on('connect', () => { setLive(true); void refresh(); });
    socket.on('disconnect', () => { setLive(false); setInbox(null); }); socket.on('connect_error', () => { setLive(false); setInbox(null); });
    for (const event of ['invitation.received', 'invitation.responded']) socket.on(event, raw => { if (InvitationChangedSchema.safeParse(raw).success) void refresh(); });
    socket.on('friendship.changed', () => { setInbox(null); void refresh(); }); socket.on('session.revoked', () => { setInbox(null); setFriends(null); setLive(false); void refresh(); });
    return () => { socket.close(); setLive(false); };
  }, [csrf, accountId, socketOrigin, refresh]);
  useEffect(() => {
    const deadlines = inbox?.items.filter(row => row.state === 'PENDING').map(row => Date.parse(row.expiresAt)) ?? [];
    if (!deadlines.length) return;
    const timer = setTimeout(() => { void refresh(); }, Math.max(250, Math.min(...deadlines) - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [inbox, refresh]);
  async function mutate(path: string, method: string, body: unknown) {
    if (!me) throw new InvitationError(401, 'Open identity to continue.');
    const signature = path + method + JSON.stringify(body); if (!pending.current.has(signature)) pending.current.set(signature, crypto.randomUUID());
    const key = pending.current.get(signature)!;
    const result = await api(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': key }, body: JSON.stringify(body) }); if (pending.current.get(signature) === key) pending.current.delete(signature); return result;
  }
  async function perform(work: () => Promise<string>, reload = true) {
    if (mutation.current) return; mutation.current = true; sequence.current++; setBusy(true); setMessage('');
    const actor = account.current;
    try { const text = await work(), fresh = reload ? await refresh() : true; if (mounted.current && actor === account.current) setMessage(fresh ? text : 'Change confirmed. Refresh for the latest invitations.'); }
    catch (error) { if (mounted.current && actor === account.current) setMessage(error instanceof InvitationError ? error.message : 'The change could not be confirmed. Retry or refresh.'); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  function send(event: FormEvent) {
    event.preventDefault(); const world = worlds.find(item => item.slug === destination); if (!world || !recipient) return;
    void perform(async () => { const receipt = InvitationReceiptSchema.parse(await mutate('/invitations', 'POST', { schemaVersion: 1, recipientId: recipient, destination: { worldSlug: world.slug, worldVersion: world.version, sceneVersion: world.sceneRef.version } })); return receipt.state === 'PENDING' ? 'Invitation sent.' : `Invitation ${receipt.state.toLowerCase()}.`; });
  }
  function respond(id: string, action: 'accept' | 'decline' | 'cancel') { void perform(async () => { const receipt = InvitationReceiptSchema.parse(await mutate('/invitations/' + id + '/respond', 'POST', { schemaVersion: 1, action })); return receipt.state === 'ACCEPTED' ? 'Invitation accepted. Your room has not changed.' : `Invitation ${receipt.state.toLowerCase()}.`; }); }
  if (loading) return <p role="status">Loading invitations...</p>;
  return <div className="identity-panel invitation-panel"><p role="status" aria-live="polite">{message || (me ? '' : 'Open identity to create a guest or sign in.')}</p>{!me ? <a href="/identity">Open identity</a> : <>
    <div className="invitation-toolbar"><span className="muted">{live ? 'Live updates connected.' : 'Live updates unavailable.'}</span><button disabled={busy} onClick={() => void refresh()}>Refresh invitations</button></div>
    <section aria-labelledby="invitation-settings"><h2 id="invitation-settings">Receiving invitations</h2><label className="checkbox"><input type="checkbox" checked={preferenceDraft ?? settings?.allowInvitations ?? false} disabled={busy || !settings} onChange={event => { const value = event.target.checked; setPreferenceDraft(value); void perform(async () => { await mutate('/me/invitations/settings', 'PATCH', { schemaVersion: 1, allowInvitations: value }); return 'Invitation settings saved.'; }).finally(() => setPreferenceDraft(null)); }}/>Allow invitations from friends</label></section>
    <form onSubmit={send} aria-labelledby="send-invitation"><h2 id="send-invitation">Send an invitation</h2><label htmlFor="invitation-recipient">Friend</label><select id="invitation-recipient" value={recipient} disabled={busy} required onChange={event => setRecipient(event.target.value)}><option value="">Choose a friend</option>{friends?.items.map(row => <option key={row.profile.id} value={row.profile.id}>{row.profile.displayName}</option>)}</select>
      {friends?.nextCursor && <button type="button" disabled={busy} onClick={() => void perform(async () => { const ticket = sequence.current; const next = FriendsPageSchema.parse(await api('/friends?cursor=' + friends.nextCursor)); if (ticket !== sequence.current) return 'Your contacts changed. Refresh to load more.'; setFriends({ ...next, items: [...friends.items, ...next.items] }); return 'More friends loaded.'; }, false)}>Load more friends</button>}
      <label htmlFor="invitation-destination">Destination</label><select id="invitation-destination" value={destination} disabled={busy} required onChange={event => setDestination(event.target.value)}><option value="">Choose a destination</option>{worlds.map(world => <option key={world.slug} value={world.slug}>{world.title}</option>)}</select><button disabled={busy || !worlds.length || !friends?.items.length}>Send invitation</button>
    </form>
    <section aria-labelledby="invitation-list"><h2 id="invitation-list">Your invitations</h2>{!inbox?.items.length && <p className="muted">No invitations to show.</p>}{inbox?.items.map(row => <article className="invitation-row" key={row.id}><h3>{row.direction === 'incoming' ? 'From' : 'To'} {row.contact.displayName}</h3><p>{worlds.find(world => world.slug === row.destination.worldSlug)?.title ?? row.destination.worldSlug}</p><p className="muted">{row.state} · Expires <time dateTime={row.expiresAt}>{new Date(row.expiresAt).toLocaleTimeString()}</time></p>{row.state === 'PENDING' && (row.direction === 'incoming' ? <><button disabled={busy} onClick={() => respond(row.id, 'accept')}>Accept invitation</button><button className="secondary" disabled={busy} onClick={() => respond(row.id, 'decline')}>Decline invitation</button></> : <button className="secondary" disabled={busy} onClick={() => respond(row.id, 'cancel')}>Cancel invitation</button>)}</article>)}
      {inbox?.nextCursor && <button disabled={busy} onClick={() => void perform(async () => { const ticket = sequence.current; const next = InvitationsPageSchema.parse(await api('/invitations?cursor=' + inbox.nextCursor)); if (ticket !== sequence.current) return 'Your invitations changed. Refresh to load more.'; setInbox({ ...next, items: [...inbox.items, ...next.items] }); return 'More invitations loaded.'; }, false)}>Load more invitations</button>}
    </section>
  </>}</div>;
}
