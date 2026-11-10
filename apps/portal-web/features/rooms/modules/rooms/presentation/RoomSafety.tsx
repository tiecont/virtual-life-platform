'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ReportReceiptSchema, ReportStatusSchema, type Me, type RoomSnapshot } from '@virtual-city/contracts';

const categories = [['harassment', 'Harassment'], ['hate', 'Hate or discrimination'], ['threats', 'Threats'], ['sexual-content', 'Sexual content'], ['child-safety', 'Child safety'], ['privacy', 'Privacy'], ['impersonation', 'Impersonation'], ['spam', 'Spam'], ['media-rights', 'Media rights'], ['staff-abuse', 'Staff abuse'], ['consent-violation', 'Consent violation'], ['self-harm', 'Self-harm concern']] as const;
class SafetyRequestError extends Error {}
export default function RoomSafety({ me, room, active }: { me: Me; room: RoomSnapshot; active: boolean }) {
  const formId = useId();
  const [available, setAvailable] = useState(false); const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [category, setCategory] = useState('harassment'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [receipt, setReceipt] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const success = useRef<HTMLParagraphElement>(null); const pending = useRef<AbortController | null>(null);
  const retryKey = useRef<string | null>(null); const alive = useRef(true); const blockKey = useRef<string | null>(null); const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    void fetch('/v1/safety/status', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) return; const status = ReportStatusSchema.parse(await response.json()); if (alive.current) setAvailable(status.reportsAvailable);
    }).catch(() => {});
    return () => { alive.current = false; controller.abort(); pending.current?.abort(); };
  }, []);
  useEffect(() => { if (target && !dialog.current?.open) dialog.current?.showModal(); }, [target]);
  useEffect(() => { if (receipt) success.current?.focus(); }, [receipt]);
  function open(id: string, name: string) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setTarget({ id, name }); setNote(''); setCategory('harassment'); setMessage(''); setReceipt(null); retryKey.current = null; blockKey.current = null; }
  function close() { if (busy) return; dialog.current?.close(); setTarget(null); setNote(''); setReceipt(null); setMessage(''); if (opener.current?.isConnected) opener.current.focus(); else document.getElementById('cafe-action-title')?.focus(); }
  async function submit() {
    if (!target || busy || !active) return; setBusy(true); setMessage('');
    const controller = new AbortController(); pending.current = controller; retryKey.current ??= crypto.randomUUID(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/v1/reports', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': retryKey.current }, body: JSON.stringify({ schemaVersion: 1, category, note, source: { kind: 'room', epoch: room.epoch, roomId: room.roomId, membershipId: room.membershipId, targetId: target.id } }) });
      if (!response.ok) { const body = await response.json(); throw new SafetyRequestError(body.error?.code === 'RATE_LIMITED' ? 'Report limit reached. Please try later.' : body.error?.code === 'NOT_AVAILABLE' ? 'This visitor can no longer be reported from this room.' : 'Your report was not confirmed. Try again.'); }
      const result = ReportReceiptSchema.parse(await response.json()); if (alive.current) { setReceipt(result.receiptId); setNote(''); }
    } catch (error) { if (alive.current) setMessage(error instanceof SafetyRequestError ? error.message : 'Your report was not confirmed. Try again.'); }
    finally { clearTimeout(timer); if (alive.current) setBusy(false); }
  }
  async function block() {
    if (!target || busy) return; setBusy(true); setMessage(''); const controller = new AbortController(); pending.current = controller; blockKey.current ??= crypto.randomUUID(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/v1/blocks', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': blockKey.current }, body: JSON.stringify({ targetId: target.id, blocked: true }) });
      if (!response.ok) throw new SafetyRequestError('The block was not confirmed. Try again.');
      if (alive.current) setMessage('Blocked. Your contact settings were updated.');
    } catch (error) { if (alive.current) setMessage(error instanceof SafetyRequestError ? error.message : 'The block was not confirmed. Try again.'); }
    finally { clearTimeout(timer); if (alive.current) setBusy(false); }
  }
  const peers = room.participants.filter(person => person.profile.id !== me.profile.id);
  return <div className="cafe-safety">
    {peers.map(person => <button key={person.profile.id} className="cafe-safety-open" disabled={!active} title={'Report or block ' + person.profile.displayName} onClick={() => open(person.profile.id, person.profile.displayName)}>Report or block {person.profile.displayName}</button>)}
    <dialog ref={dialog} className="cafe-safety-dialog" aria-labelledby="safety-title" onCancel={event => { if (event.target !== dialog.current) return; event.preventDefault(); close(); }} onClose={event => { if (event.target === dialog.current && !dialog.current.open && !busy) setTarget(null); }}>
      <h2 id="safety-title">{target ? 'Report or block ' + target.name : 'Visitor safety'}</h2>
      {receipt ? <><p ref={success} tabIndex={-1} className="cafe-safety-receipt">Report received. Receipt: <code>{receipt}</code></p><p>Your report is private. A review time is not guaranteed.</p></> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        {!available && <p>Confidential reporting is unavailable.</p>}
        <label htmlFor={formId + '-category'}>Reason</label><select id={formId + '-category'} disabled={!available || busy || !active} value={category} onChange={event => { setCategory(event.target.value); retryKey.current = null; }}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor={formId + '-note'}>Note (optional)</label><textarea id={formId + '-note'} disabled={!available || busy || !active} value={note} maxLength={1000} rows={4} onChange={event => { setNote(event.target.value); retryKey.current = null; }}/>
        <button type="submit" disabled={!available || busy || !active}>{busy ? 'Confirming...' : 'Send private report'}</button>
      </form>}
      {message && <p aria-live="polite" className="cafe-message">{message}</p>}
      <div className="cafe-safety-actions"><button disabled={busy} onClick={() => void block()}>Block visitor</button><button disabled={busy} onClick={close}>Close</button></div>
    </dialog>
  </div>;
}
