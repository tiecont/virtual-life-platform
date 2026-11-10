'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';
import { ApiErrorSchema, MeSchema, SocialSettingsSchema, FriendsPageSchema, SocialRequestsPageSchema, BlocksPageSchema, FriendRequestResultSchema, type Me, type SocialSettings, type FriendsPage as Friends, type SocialRequestsPage as Requests, type BlocksPage as Blocks } from '@virtual-city/contracts';
class SocialRequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function api(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch('/v1' + path, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const result = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    const code = result.success ? result.data.error.code : 'INTERNAL_ERROR';
    const message = code === 'UNAUTHENTICATED' ? 'Your session ended. Open identity to continue.' : code === 'RATE_LIMITED' ? 'Too many requests. Please wait before trying again.' : code === 'NOT_AVAILABLE' ? 'This request is unavailable. Check the code or try again later.' : code === 'FORBIDDEN' ? 'This action is unavailable with the current session. Refresh and try again.' : code === 'INVALID_REQUEST' ? 'Please check the supplied fields.' : 'The city could not confirm this change. Refresh and try again.';
    throw new SocialRequestError(response.status, message);
  }
  return response.json();
}
export default function SocialPanel({ socketOrigin }: { socketOrigin: string }) {
  const [me, setMe] = useState<Me | null>(null); const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [friends, setFriends] = useState<Friends | null>(null); const [requests, setRequests] = useState<Requests | null>(null); const [blocks, setBlocks] = useState<Blocks | null>(null);
  const [contact, setContact] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [live, setLive] = useState(false);
  const pending = useRef(new Map<string,string>()); const mounted = useRef(true); const fetchSequence = useRef(0);
  const [policyDraft, setPolicyDraft] = useState<'code'|'none'|null>(null);
  const reload = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    try {
      const identity = MeSchema.parse(await api('/me'));
      const [preferences, graph, inbox, blocked] = await Promise.all([api('/social/me'),api('/friends'),api('/friends/requests'),api('/blocks')]);
      if (!mounted.current || sequence !== fetchSequence.current) return false;
      setMe(identity); setSettings(SocialSettingsSchema.parse(preferences)); setFriends(FriendsPageSchema.parse(graph)); setRequests(SocialRequestsPageSchema.parse(inbox)); setBlocks(BlocksPageSchema.parse(blocked)); return true;
    } catch (error) {
      if (mounted.current && sequence === fetchSequence.current) {
        setMessage(error instanceof SocialRequestError ? error.message : 'The city is unavailable. Refresh to check the latest state.');
        if (error instanceof SocialRequestError && error.status === 401) { setMe(null); setSettings(null); setFriends(null); setRequests(null); setBlocks(null); pending.current.clear(); }
      }
      return false;
    } finally { if (mounted.current && sequence === fetchSequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void reload(); const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('virtual-city-identity');
    if (bus) bus.onmessage = () => { void reload().then(ok => { if (ok && mounted.current) setMessage('Identity refreshed.'); }); };
    return () => { mounted.current = false; bus?.close(); };
  }, [reload]);
  const csrf = me?.csrfToken; const accountId = me?.profile.id;
  useEffect(() => {
    if (!csrf || !accountId) return;
    const socket = io(socketOrigin, { reconnection: true, reconnectionAttempts: 3, transports: ['websocket'], withCredentials: true, auth: { schemaVersion: 1, csrfToken: csrf } });
    socket.on('connect', () => setLive(true)); socket.on('disconnect', () => setLive(false)); socket.on('connect_error', () => setLive(false));
    socket.on('friendship.changed', () => { void reload(); });
    socket.on('session.revoked', () => { setLive(false); void reload(); });
    return () => { socket.close(); setLive(false); };
  }, [csrf, accountId, socketOrigin, reload]);
  async function mutate(path: string, method: string, body: unknown = {}) {
    if (!me) throw new SocialRequestError(401, 'Open identity to continue.');
    const signature = path + method + JSON.stringify(body);
    if (!pending.current.has(signature)) pending.current.set(signature, crypto.randomUUID());
    const result = await api(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': pending.current.get(signature)! }, body: JSON.stringify(body) });
    pending.current.delete(signature); return result;
  }
  async function perform(work: () => Promise<string>, refresh = true) {
    if (busy) return; fetchSequence.current++; setBusy(true); setMessage('');
    try { const success = await work(); const refreshed = refresh ? await reload() : true; setMessage(refreshed ? success : 'Change confirmed. Refresh to see the latest state.'); }
    catch (error) { setMessage(error instanceof SocialRequestError ? error.message : 'The change could not be confirmed. Please refresh.'); }
    finally { setBusy(false); }
  }
  function send(event: FormEvent) { event.preventDefault(); void perform(async () => { const result = FriendRequestResultSchema.parse(await mutate('/friends/requests','POST',{ contactCode: contact })); setContact(''); return result.state === 'ACCEPTED' ? 'Friend request processed.' : 'Friend request sent.'; }); }
  function respond(id: string, action: 'accept'|'decline'|'cancel') { void perform(async () => { const result = FriendRequestResultSchema.parse(await mutate('/friends/requests/'+id+'/respond','POST',{action})); return result.state === 'ACCEPTED' ? 'Friend request processed.' : result.state === 'EXPIRED' ? 'That request expired.' : 'Request closed.'; }); }
  function block(targetId: string, blocked: boolean) { void perform(async () => { await mutate('/blocks','POST',{targetId,blocked}); return blocked ? 'Contact blocked. Their requests and shared activity are no longer available.' : 'Contact unblocked. Friendship is not restored automatically.'; }); }
  if (loading) return <p role="status">Loading your circle…</p>;
  return <div className="identity-panel social-panel"><p role="status" aria-live="polite">{message || (me ? `Welcome, ${me.profile.displayName}.` : 'Open identity to create a guest or sign in.')}</p>
    {!me ? <a href="/identity">Open identity →</a> : <><p className="muted live-state">{live ? 'Live updates connected.' : 'Live updates unavailable. Refresh to check changes.'}</p><button disabled={busy} onClick={() => { void reload(); }}>Refresh circle</button>
      {settings && <section className="status-card"><h2>Your contact code</h2><p className="muted">Select and copy this code. Share it only with someone you want to hear from.</p><label htmlFor="own-code">Your contact code</label><input id="own-code" value={settings.contactCode} readOnly className="contact-code"/>
        <label className="checkbox"><input type="checkbox" checked={(policyDraft ?? settings.requestPolicy) === 'code'} disabled={busy} onChange={event => { const requestPolicy = event.target.checked ? 'code' : 'none'; setPolicyDraft(requestPolicy); void perform(async () => { setSettings(SocialSettingsSchema.parse(await mutate('/social/me','PATCH',{requestPolicy}))); return 'Request settings saved.'; }).finally(() => setPolicyDraft(null)); }}/>Allow new friend requests using my code</label>
        <p className="muted">Replacing the code or turning off new requests closes pending incoming requests.</p><button disabled={busy} onClick={() => void perform(async () => { await mutate('/social/contact-code/rotate','POST'); return 'Contact code replaced.'; })}>Replace contact code</button>
      </section>}
      <form className="status-card" onSubmit={send}><h2>Invite a friend</h2><label htmlFor="friend-code">Contact code from a friend</label><input id="friend-code" value={contact} onChange={e=>setContact(e.target.value)} placeholder="VL-…" autoComplete="off" required maxLength={40} disabled={busy}/><button disabled={busy}>Send friend request</button></form>
      <section className="status-card" aria-labelledby="requests-title"><h2 id="requests-title">Pending requests</h2>{!requests?.items.length && <p className="muted">No pending requests.</p>}{requests?.items.map(row => <article className="social-row" key={row.id}><h3>{row.direction === 'incoming' ? row.sender?.displayName ?? 'Incoming request' : `Request ending ${row.codeHint}`}</h3><p className="muted">Expires {new Date(row.expiresAt).toLocaleString()}</p>{row.direction === 'incoming' ? <><button disabled={busy} onClick={()=>respond(row.id,'accept')}>Accept</button><button disabled={busy} onClick={()=>respond(row.id,'decline')}>Decline</button>{row.sender && <button className="secondary" disabled={busy} onClick={()=>block(row.sender!.id,true)}>Block contact</button>}</> : <button disabled={busy} onClick={()=>respond(row.id,'cancel')}>Cancel request</button>}</article>)}
        {requests?.nextCursor && <button disabled={busy} onClick={() => void perform(async () => { const sequence=fetchSequence.current; const next=SocialRequestsPageSchema.parse(await api('/friends/requests?cursor='+requests.nextCursor)); if(sequence!==fetchSequence.current) return 'Your circle changed. Refresh to load more.'; setRequests({ ...next,items:[...requests.items,...next.items] }); return 'More requests loaded.'; }, false)}>Load more requests</button>}
      </section>
      <section className="status-card" aria-labelledby="friends-title"><h2 id="friends-title">Friends</h2><p className="muted">World activity is not available yet. Private visits will not be listed.</p>{!friends?.items.length && <p className="empty-friends">No friends yet.</p>}{friends?.items.map(row=><article className="social-row" key={row.profile.id}><h3>{row.profile.displayName}</h3><p className="muted">{row.activity ? `Shared activity: ${row.activity.worldSlug}` : 'No shared activity'}</p><button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{await mutate('/friends/'+row.profile.id,'DELETE');return 'Friendship removed.';})}>Remove friend</button><button className="danger" disabled={busy} onClick={()=>block(row.profile.id,true)}>Block contact</button></article>)}
        {friends?.nextCursor && <button disabled={busy} onClick={() => void perform(async () => { const sequence=fetchSequence.current; const next=FriendsPageSchema.parse(await api('/friends?cursor='+friends.nextCursor)); if(sequence!==fetchSequence.current) return 'Your circle changed. Refresh to load more.'; setFriends({ ...next,items:[...friends.items,...next.items] }); return 'More friends loaded.'; }, false)}>Load more friends</button>}
      </section>
      <section className="status-card" aria-labelledby="blocks-title"><h2 id="blocks-title">Your block list</h2>{!blocks?.items.length && <p className="muted">No blocked contacts.</p>}{blocks?.items.map(row=><article className="social-row" key={row.targetId}><h3>{row.label ?? 'Blocked contact'}</h3><button className="secondary" disabled={busy} onClick={()=>block(row.targetId,false)}>Unblock contact</button></article>)}</section>
    </>}
  </div>;
}
