'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MeSchema, OwnSanctionsSchema, ReportStatusSchema, AppealReceiptSchema, type Me } from '@virtual-city/contracts';
type Own = ReturnType<typeof OwnSanctionsSchema.parse>;
class Failure extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function request(path: string, signal: AbortSignal, options: RequestInit = {}) {
  const response = await fetch('/v1' + path, { ...options, credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) {
    const message: Record<number, string> = { 401: 'Your session has ended. Sign in to view your decisions.', 403: 'Your session changed. Refresh before trying again.', 404: 'This appeal is unavailable or its deadline has passed.', 409: 'An appeal was already received or this request conflicts with an earlier submission.', 422: 'Please check your appeal text.', 429: 'Please wait before trying again.', 503: 'Private appeal intake is temporarily unavailable.' };
    throw new Failure(response.status, message[response.status] ?? 'Your request was not confirmed. Retry the unchanged appeal.');
  }
  return response.json() as Promise<unknown>;
}
const names = { warn: 'Warning', mute: 'Chat restriction', 'room-eject': 'Room restriction', 'world-ban': 'World restriction', 'platform-ban': 'World access suspended' };
export default function SafetyPanel() {
  const [me, setMe] = useState<Me | null>(null), [data, setData] = useState<Own | null>(null), [available, setAvailable] = useState(false);
  const [message, setMessage] = useState('Loading your decisions...'), [busy, setBusy] = useState(false), [notes, setNotes] = useState<Record<string, string>>({});
  const lifetime = useRef<AbortController | null>(null), keys = useRef(new Map<string, string>()), active = useRef(false), owner = useRef<string | null>(null);
  const revision = useRef(0), pending = useRef<AbortController | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const parent = new AbortController(); lifetime.current = parent; active.current = false;
    refresh.current = async () => {
      if (active.current || parent.signal.aborted) return; active.current = true; setBusy(true);
      const controller = new AbortController(); pending.current = controller; const run = ++revision.current;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const identity = MeSchema.parse(await request('/me', controller.signal));
        if (owner.current !== identity.profile.id) { keys.current.clear(); setNotes({}); setData(null); owner.current = identity.profile.id; }
        const own = OwnSanctionsSchema.parse(await request('/me/sanctions', controller.signal));
        const status = ReportStatusSchema.parse(await request('/safety/status', controller.signal));
        if (!controller.signal.aborted && revision.current === run && !parent.signal.aborted) { setMe(identity); setData(own); setAvailable(status.reportsAvailable); setMessage(''); }
      } catch (error) {
        if (revision.current === run && !parent.signal.aborted) {
          setMessage(controller.signal.aborted ? 'The request timed out. Refresh to retry.' : error instanceof Error ? error.message : 'Unable to load your decisions.');
          // Never leave another account's private state on screen after a failed refresh.
          setData(null); setMe(null); setNotes({}); keys.current.clear(); owner.current = null;
        }
      } finally { clearTimeout(timeout); if (revision.current === run && !parent.signal.aborted) { active.current = false; pending.current = null; setBusy(false); } }
    };
    void refresh.current();
    const channel = new BroadcastChannel('virtual-city-identity'); channel.onmessage = () => { revision.current++; pending.current?.abort(); active.current = false; setData(null); setMe(null); setNotes({}); keys.current.clear(); owner.current = null; void refresh.current(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh.current(); }; document.addEventListener('visibilitychange', visible);
    return () => { revision.current++; pending.current?.abort(); parent.abort(); lifetime.current = null; channel.close(); document.removeEventListener('visibilitychange', visible); };
  }, []);
  async function appeal(event: FormEvent, id: string) {
    event.preventDefault(); if (!me || active.current || !lifetime.current || lifetime.current.signal.aborted) return;
    active.current = true; setBusy(true); setMessage('');
    const body = { note: notes[id]?.trim() ?? '' }, signature = id + ':' + JSON.stringify(body);
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    const identity = me.profile.id, controller = new AbortController(), parent = lifetime.current;
    const run = ++revision.current; pending.current = controller;
    const abort = () => controller.abort(); parent.signal.addEventListener('abort', abort, { once: true }); const timeout = setTimeout(abort, 10000);
    try {
      const receipt = AppealReceiptSchema.parse(await request(`/me/sanctions/${id}/appeal`, controller.signal, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': keys.current.get(signature)! }, body: JSON.stringify(body) }));
      if (owner.current !== identity || parent.signal.aborted || revision.current !== run) return;
      keys.current.delete(signature); setNotes(current => ({ ...current, [id]: '' }));
      setData(current => current ? { ...current, appeals: [...current.appeals.filter(value => value.sanctionId !== id), { ...receipt, sanctionId: id, reviewedAt: null }] } : current);
      setMessage('Appeal received. Receipt: ' + receipt.receiptId);
    } catch (error) {
      if (owner.current !== identity || parent.signal.aborted || revision.current !== run) return;
      setMessage(error instanceof Failure ? error.message : 'Your appeal was not confirmed. Retry the unchanged appeal.');
      if (error instanceof Failure && error.status === 401) { setMe(null); setData(null); setNotes({}); keys.current.clear(); owner.current = null; }
    } finally { clearTimeout(timeout); parent.signal.removeEventListener('abort', abort); if (!parent.signal.aborted && revision.current === run) { active.current = false; pending.current = null; setBusy(false); } }
  }
  return <div className="safety-panel" aria-busy={busy}><p role="status" aria-live="polite">{message}</p><button type="button" disabled={busy} onClick={() => { void refresh.current(); }}>Refresh decisions</button>
    {!me && !busy && <p><Link href="/identity">Sign in</Link></p>}
    {data && <>{!data.items.length && <p>No safety restrictions recorded for this identity.</p>}{data.truncated && <p>Showing the latest 100 decisions.</p>}
      {data.items.map(item => {
        const receipt = data.appeals.find(value => value.sanctionId === item.id);
        return <article className="safety-decision" key={item.id} aria-labelledby={'decision-' + item.id}><h2 id={'decision-' + item.id}>{names[item.kind]}</h2><dl><dt>Status</dt><dd>{item.state}</dd><dt>Category</dt><dd>{item.category.replaceAll('-', ' ')}</dd><dt>Scope</dt><dd>{item.worldSlug ?? 'All worlds'}{item.roomId ? ' / reported room' : ''}</dd><dt>Effective</dt><dd><time dateTime={item.effectiveAt}>{new Date(item.effectiveAt).toLocaleString()}</time></dd><dt>Ends</dt><dd><time dateTime={item.expiresAt}>{new Date(item.expiresAt).toLocaleString()}</time></dd></dl>
          {receipt ? <p>{receipt.status === 'received' ? 'Appeal received.' : receipt.status === 'upheld' ? 'Appeal reviewed: restriction upheld.' : 'Appeal reviewed: restriction revoked.'} Receipt: <span className="safety-receipt">{receipt.receiptId}</span></p> : <><p>Appeal deadline: <time dateTime={item.appealUntil}>{new Date(item.appealUntil).toLocaleString()}</time></p>{available && Date.parse(item.appealUntil) > Date.now() ? <form onSubmit={event => { void appeal(event, item.id); }}><label htmlFor={'appeal-' + item.id}>Your appeal</label><textarea id={'appeal-' + item.id} value={notes[item.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} required minLength={10} maxLength={1000} disabled={busy}/><button disabled={busy} type="submit">Send private appeal</button></form> : <p>Appeal intake is currently unavailable.</p>}</>}
        </article>;
      })}</>}
  </div>;
}
