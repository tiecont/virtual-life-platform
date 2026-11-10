'use client';
import { useEffect, useRef, useState } from 'react';
import { FocusTimer } from '@virtual-city/focus-ui';
import { ApiErrorSchema, FocusResultSchema, type FocusResult, type Me, type TravelSource } from '@virtual-city/contracts';
import './focus.css';
type Pending = { key: string; path: string; body: unknown };
export default function FocusPanel({ me, source }: { me: Me; source: TravelSource | null }) {
  const [observation, setObservation] = useState<FocusResult | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(true), [message, setMessage] = useState(''), [retryable, setRetryable] = useState(false);
  const pending = useRef<Pending | null>(null), refresh = useRef<() => Promise<void>>(async () => {}), run = useRef<(request: Pending) => Promise<void>>(async () => {}), current = useRef<FocusResult | null>(null);
  useEffect(() => {
    const lifetime = new AbortController(); let sequence = 0, writing = false; let bus: BroadcastChannel | null = null;
    setObservation(null); setUncertain(true); setBusy(false); setMessage(''); setRetryable(false); pending.current = null; current.current = null;
    async function request(path: string, options: RequestInit = {}) {
      const response = await fetch('/v1/' + path, { ...options, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) { const error = ApiErrorSchema.safeParse(await response.json().catch(() => null)); throw new Error(error.success ? error.data.error.code : 'INTERNAL_ERROR'); }
      return FocusResultSchema.parse(await response.json());
    }
    function accept(next: FocusResult) { current.current = next; setObservation(next); setUncertain(false); }
    function clearIdentity() { current.current = null; pending.current = null; setObservation(null); setRetryable(false); setUncertain(true); setMessage('Your session ended.'); }
    refresh.current = async () => {
      if (writing || lifetime.signal.aborted) return; const ticket = ++sequence;
      try { const next = await request('focus'); if (!lifetime.signal.aborted && ticket === sequence) { accept(next); if (!pending.current) setMessage(''); } }
      catch (error) { if (!lifetime.signal.aborted && ticket === sequence) { if (error instanceof Error && error.message === 'UNAUTHENTICATED') clearIdentity(); else { setUncertain(true); setMessage('Timer could not be confirmed.'); } } }
    };
    run.current = async mutation => {
      if (writing || lifetime.signal.aborted) return; writing = true; const ticket = ++sequence; setBusy(true); setMessage('Confirming timer...');
      try {
        const next = await request(mutation.path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': mutation.key }, body: JSON.stringify(mutation.body) });
        if (lifetime.signal.aborted || ticket !== sequence) return;
        accept(next); pending.current = null; setRetryable(false); setMessage('Timer confirmed.'); bus?.postMessage({ accountId: me.profile.id });
      } catch (error) {
        if (lifetime.signal.aborted || ticket !== sequence) return;
        if (error instanceof Error && error.message === 'UNAUTHENTICATED') { clearIdentity(); return; }
        setUncertain(true);
        if (error instanceof Error && ['NOT_IN_ROOM', 'FORBIDDEN', 'NOT_AVAILABLE', 'IDEMPOTENCY_CONFLICT', 'INVALID_REQUEST', 'UNAUTHENTICATED'].includes(error.message)) { pending.current = null; setRetryable(false); setMessage(error.message === 'UNAUTHENTICATED' ? 'Your session ended.' : 'Timer request was declined. Refresh to confirm your timer.'); }
        else { setRetryable(true); setMessage('Timer response was interrupted. Retry to confirm the same request.'); }
      } finally { if (!lifetime.signal.aborted && ticket === sequence) { writing = false; setBusy(false); } }
    };
    const visible = () => { if (document.visibilityState === 'visible') void refresh.current(); };
    const offline = () => { setUncertain(true); setMessage('Offline. Timer unconfirmed.'); };
    const online = () => { void refresh.current(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', online); window.addEventListener('online', online); window.addEventListener('offline', offline);
    bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('virtual-city-focus'); if (bus) bus.onmessage = event => { if (event.data?.accountId === me.profile.id) void refresh.current(); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh.current(); }, 30000); void refresh.current();
    return () => { lifetime.abort(); sequence++; clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', online); window.removeEventListener('online', online); window.removeEventListener('offline', offline); bus?.close(); pending.current = null; current.current = null; };
  }, [me.profile.id, me.csrfToken]);
  function submit(path: string, body: unknown) { if (busy || pending.current) return; const request = { key: crypto.randomUUID(), path, body }; pending.current = request; void run.current(request); }
  return <FocusTimer observation={observation} canStart={!!source} busy={busy} uncertain={uncertain} message={message} retryable={retryable}
    onStart={durationSeconds => { if (source) submit('focus', { schemaVersion: 1, source, durationSeconds }); }}
    onCommand={action => { const session = current.current?.session; if (session) submit('focus/' + session.id + '/' + action, { schemaVersion: 1 }); }}
    onRefresh={() => { void refresh.current(); }} onRetry={() => { if (pending.current) void run.current(pending.current); }}/>;
}
