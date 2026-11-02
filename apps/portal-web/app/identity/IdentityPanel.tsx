'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AvatarKeySchema, MeSchema, PrivacySchema, VisibilitySchema, type Me, type Privacy } from '@virtual-city/contracts';
class RequestFailure extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch('/v1' + path, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const messages: Record<number, string> = { 401: 'This session has ended. Create a new guest or sign in when available.', 403: 'The session changed or the request was rejected. Refresh and try again.', 409: 'This request changed. Please try again.', 422: 'Please check the supplied fields.', 429: 'Too many requests. Wait a minute before trying again.' };
    throw new RequestFailure(response.status, messages[response.status] ?? 'The city is unavailable. Your changes have not been confirmed. Try again.');
  }
  return response.json();
}
export default function IdentityPanel() {
  const [me, setMe] = useState<Me | null>(null); const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [name, setName] = useState(''); const [avatar, setAvatar] = useState<Me['profile']['avatarKey']>('fern');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const pendingKeys = useRef(new Map<string, string>()); const channel = useRef<BroadcastChannel | null>(null); const mounted = useRef(true);
  const setIdentity = useCallback((value: Me | null) => {
    setMe(value); if (value) { setName(value.profile.displayName); setAvatar(value.profile.avatarKey); }
  }, []);
  const restore = useCallback(async () => {
    try {
      const identity = MeSchema.parse(await request('/me'));
      const choices = PrivacySchema.parse(await request('/me/privacy'));
      if (mounted.current) { setIdentity(identity); setPrivacy(choices); }
    } catch (e) {
      if (mounted.current) { if (e instanceof RequestFailure && e.status === 401) { setIdentity(null); setPrivacy(null); } else setMessage(e instanceof Error ? e.message : 'Unable to restore identity.'); }
    } finally { if (mounted.current) setLoading(false); }
  }, [setIdentity]);
  useEffect(() => {
    mounted.current = true; void restore();
    const bus = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('virtual-city-identity') : null;
    channel.current = bus; if (bus) bus.onmessage = event => { void restore().then(() => { if (mounted.current && event.data?.type === 'session') setMessage('Session renewed in another tab.'); }); };
    const visible = () => { if (document.visibilityState === 'visible') void restore(); };
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; bus?.close(); document.removeEventListener('visibilitychange', visible); };
  }, [restore]);
  const key = (operation: string, body: unknown) => {
    const signature = operation + JSON.stringify(body);
    if (!pendingKeys.current.has(signature)) pendingKeys.current.set(signature, crypto.randomUUID());
    return { id: pendingKeys.current.get(signature)!, signature };
  };
  const mutate = async (path: string, method: string, body: unknown = {}) => {
    if (!me) throw new Error('Restore identity first.');
    const requestKey = key(path, body);
    const result = await request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': requestKey.id }, body: JSON.stringify(body) });
    pendingKeys.current.delete(requestKey.signature); return result;
  };
  const perform = async (work: () => Promise<void>, success: string, event = 'refresh') => {
    if (busy) return; setBusy(true); setMessage('');
    try { await work(); setMessage(success); channel.current?.postMessage({ type: event }); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to confirm the change.'); if (e instanceof RequestFailure && e.status === 401) { setIdentity(null); setPrivacy(null); } }
    finally { setBusy(false); }
  };
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      const body = { displayName: name, avatarKey: avatar };
      if (me) setIdentity(MeSchema.parse(await mutate('/me', 'PATCH', body)));
      else {
        const requestKey = key('guest', body);
        const identity = MeSchema.parse(await request('/session/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, requestId: requestKey.id }) }));
        pendingKeys.current.delete(requestKey.signature); setIdentity(identity); setPrivacy(PrivacySchema.parse(await request('/me/privacy')));
      }
    }, me ? 'Profile saved.' : 'Guest identity created. It will return when you reload this browser.');
  }
  if (loading) return <p role="status">Restoring browser identity…</p>;
  return <div className="identity-panel"><p role="status" aria-live="polite">{message || (me ? `Welcome, ${me.profile.displayName}.` : 'Create a guest to begin.')}</p>
    <form onSubmit={saveProfile} className="status-card"><h2>{me ? 'Your profile' : 'Create a guest'}</h2><p className="muted">This guest stays in this browser. Logging out or clearing site data can lose access.</p>
      <label htmlFor="display-name">Display name</label><input id="display-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={24} autoComplete="nickname" required disabled={busy}/>
      <label htmlFor="avatar-key">Avatar color</label><select id="avatar-key" value={avatar} onChange={e => setAvatar(AvatarKeySchema.parse(e.target.value))} disabled={busy}>{AvatarKeySchema.options.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <button disabled={busy} type="submit">{busy ? 'Confirming…' : me ? 'Save profile' : 'Create guest identity'}</button></form>
    {me && privacy && <><form className="status-card" onSubmit={e => { e.preventDefault(); void perform(async () => { setPrivacy(PrivacySchema.parse(await mutate('/me/privacy', 'PATCH', privacy))); }, 'Privacy choices saved.'); }}>
      <h2>Your privacy</h2><label htmlFor="presence">Who can see your presence?</label><select id="presence" value={privacy.presence} disabled={busy} onChange={e => setPrivacy({ ...privacy, presence: VisibilitySchema.parse(e.target.value) })}><option value="hidden">Nobody</option><option value="friends">Friends (when available)</option><option value="public">Everyone in an eligible world</option></select>
      <label className="checkbox"><input type="checkbox" checked={privacy.analyticsConsent} disabled={busy} onChange={e => setPrivacy({ ...privacy, analyticsConsent: e.target.checked })}/>Allow optional usage analytics</label><p className="muted">No external analytics service is connected. Restricted-world presence stays private.</p><button disabled={busy}>Save privacy</button></form>
      <section className="status-card actions"><h2>Session and data</h2><button disabled={busy} onClick={() => void perform(async () => { setIdentity(MeSchema.parse(await mutate('/session/rotate', 'POST'))); }, 'Session renewed. Your identity is unchanged.', 'session')}>Renew session</button>
        <button disabled={busy} onClick={() => void perform(async () => { const data = await request('/me/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'virtual-city-data.json'; link.click(); URL.revokeObjectURL(url); }, 'Your data export is ready.')}>Export my data</button>
        <button disabled={busy} onClick={() => void perform(async () => { await mutate('/session/logout', 'POST'); setIdentity(null); setPrivacy(null); }, 'Logged out. This guest can no longer be restored from this session.')}>Log out</button>
        <label className="checkbox"><input type="checkbox" checked={deleteConfirmed} disabled={busy} onChange={e => setDeleteConfirmed(e.target.checked)}/>I want to permanently delete this city identity and its data</label><button className="danger" disabled={busy || !deleteConfirmed} onClick={() => void perform(async () => { await mutate('/me', 'DELETE'); setIdentity(null); setPrivacy(null); setDeleteConfirmed(false); }, 'City identity deleted.')}>Delete my identity</button>
      </section></>}
  </div>;
}
