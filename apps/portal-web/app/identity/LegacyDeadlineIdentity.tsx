'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LegacyIdentityViewSchema, type LegacyIdentityView } from '@virtual-city/contracts';
type Command = { key: string; revision: number };
class AssociationFailure extends Error {}
export default function LegacyDeadlineIdentity({ csrf }: { csrf: string }) {
  const [view, setView] = useState<LegacyIdentityView | null>(null), [message, setMessage] = useState('Reading association…');
  const [linking, setLinking] = useState(false), [withdrawing, setWithdrawing] = useState(false);
  const mounted = useRef(false), generation = useRef(0), commands = useRef<{ link?: Command; unlink?: Command }>({});
  const refresh = useCallback(async () => {
    const serial = ++generation.current;
    try {
      const response = await fetch('/v1/me/legacy/deadline', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw Error('Association could not be read. Refresh to try again.');
      const next = LegacyIdentityViewSchema.parse(await response.json());
      if (mounted.current && serial === generation.current) { setView(next); setMessage(''); }
    } catch { if (mounted.current && serial === generation.current) { setView(null); setMessage('Association could not be read. Refresh to try again.'); } }
  }, []);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; generation.current++; }; }, [refresh]);
  async function change(operation: 'link' | 'unlink') {
    if (!view || (operation === 'link' ? linking || withdrawing : withdrawing)) return;
    const command = commands.current[operation] ?? { key: crypto.randomUUID(), revision: view.revision };
    commands.current[operation] = command;
    if (operation === 'unlink') commands.current.link = undefined;
    const serial = ++generation.current;
    if (operation === 'link') setLinking(true); else setWithdrawing(true);
    setMessage(operation === 'link' ? 'Confirming association…' : 'Withdrawing association…');
    try {
      const response = await fetch('/v1/me/legacy/deadline', { method: operation === 'link' ? 'POST' : 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': command.key }, body: JSON.stringify({ schemaVersion: 1, expectedRevision: command.revision }) });
      if (!response.ok) {
        if (response.status === 409 || response.status === 401 || response.status === 403 || response.status === 404) commands.current[operation] = undefined;
        throw new AssociationFailure(response.status === 409 ? 'Association changed. Refresh before choosing again.' : response.status === 401 ? 'A current city session and an existing Deadline guest cookie are required to associate. Withdrawal only needs your city session.' : response.status === 429 ? 'Too many requests. Wait before retrying.' : 'The change is unconfirmed. Retry the same action or withdraw independently.');
      }
      const next = LegacyIdentityViewSchema.parse(await response.json());
      if (mounted.current && serial === generation.current) { commands.current[operation] = undefined; setView(next); setMessage(operation === 'unlink' ? 'Association withdrawn.' : next.linked ? 'Association recorded.' : 'Association is withdrawn.'); }
    } catch (error) { if (mounted.current && serial === generation.current) setMessage(error instanceof AssociationFailure ? error.message : 'The change is unconfirmed. Retry the same action or withdraw independently.'); }
    finally { if (mounted.current) { if (operation === 'link') setLinking(false); else setWithdrawing(false); } }
  }
  return <section className="status-card" aria-labelledby="deadline-identity-heading">
    <h2 id="deadline-identity-heading">Existing Deadline guest</h2>
    <p>Optionally associate the existing Deadline guest cookie in this browser with this city identity. This records private consent; it does not sign you in, renew a session or transfer history. Your city name and avatar stay yours.</p>
    <p aria-live="polite">{message || (view?.linked ? 'Association recorded. This does not verify that the Deadline session is still active.' : view?.available ? 'No active association.' : 'Association is not enabled in this installation.')}</p>
    <div className="actions"><button onClick={() => void refresh()} disabled={linking || withdrawing}>Refresh association</button>
      <button onClick={() => void change('link')} disabled={!view?.available || linking || withdrawing}>{linking ? 'Confirming association…' : view?.linked ? 'Confirm association again' : 'Associate existing Deadline guest'}</button>
      <button onClick={() => void change('unlink')} disabled={!view || withdrawing}>{withdrawing ? 'Withdrawing association…' : 'Withdraw Deadline association'}</button></div>
    <p className="muted">Withdrawal also stops a pending association. It does not delete your independent Deadline guest or its history. A different guest cannot replace an existing association automatically.</p>
  </section>;
}
