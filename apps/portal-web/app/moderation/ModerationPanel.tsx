'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MeSchema, ModerationSessionSchema, CasePageSchema, CaseDetailSchema, CaseSanctionsSchema, CaseAppealsSchema, IncidentPageSchema, SanctionResultSchema, AppealDispositionSchema, IncidentResultSchema, SafetyCategorySchema, SafetySeveritySchema, SafetySanctionSchema, type Me } from '@virtual-city/contracts';
type Session = ReturnType<typeof ModerationSessionSchema.parse>;
type Summary = ReturnType<typeof CasePageSchema.parse>['items'][number];
type Detail = ReturnType<typeof CaseDetailSchema.parse>;
type CaseData = { selected: Summary; detail: Detail | null; sanctions: ReturnType<typeof CaseSanctionsSchema.parse> | null; appeals: ReturnType<typeof CaseAppealsSchema.parse> | null };
type Desk = { session: Session; me: Me; page: ReturnType<typeof CasePageSchema.parse> | null; controls: ReturnType<typeof IncidentPageSchema.parse> };
type Filters = { id: string; world: string; category: string; severity: string };
class Failure extends Error { constructor(readonly status: number) { super(status === 401 ? 'Your session ended. Sign in to continue.' : status === 404 || status === 403 ? 'This action is unavailable with your current role or assignment.' : status === 409 ? 'This request conflicts with an earlier action. Refresh the case.' : status === 422 ? 'Check the fields and policy limits.' : status === 429 ? 'Please wait before trying again.' : 'The request was not confirmed. Retry the unchanged action.'); } }
async function request(path: string, signal: AbortSignal, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch('/v1' + path, { ...options, credentials: 'same-origin', cache: 'no-store', signal }); if (!response.ok) throw new Failure(response.status); return response.json();
}
const blankFilters: Filters = { id: '', world: '', category: '', severity: '' };
function search(filters: Filters, cursor?: string) {
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim()); if (cursor) query.set('cursor', cursor); return '/moderation/cases?' + query;
}
async function caseData(signal: AbortSignal, selected: Summary, session: Session): Promise<CaseData> {
  if (selected.assignedTo !== session.accountId || !session.reportsAvailable) return { selected, detail: null, sanctions: null, appeals: null };
  const base = '/moderation/cases/' + selected.id;
  const detail = CaseDetailSchema.parse(await request(base, signal));
  const sanctions = CaseSanctionsSchema.parse(await request(base + '/sanctions', signal));
  const appeals = CaseAppealsSchema.parse(await request(base + '/appeals', signal));
  return { selected, detail, sanctions, appeals };
}
export default function ModerationPanel() {
  const [desk, setDesk] = useState<Desk | null>(null), [current, setCurrent] = useState<CaseData | null>(null);
  const [filters, setFilters] = useState<Filters>(blankFilters), [busy, setBusy] = useState(true), [message, setMessage] = useState('Checking staff access...');
  const [assignee, setAssignee] = useState(''), [assignmentReason, setAssignmentReason] = useState('triage');
  const [kind, setKind] = useState('mute'), [duration, setDuration] = useState(60), [reason, setReason] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({}), [decisions, setDecisions] = useState<Record<string, string>>({});
  const [controlWorld, setControlWorld] = useState(''), [surface, setSurface] = useState('chat'), [controlReason, setControlReason] = useState('incident'), [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const mounted = useRef(false), active = useRef(false), generation = useRef(0), pending = useRef<AbortController | null>(null), keys = useRef(new Map<string, string>()), loadRef = useRef<() => void>(() => {});
  function clear() { setDesk(null); setCurrent(null); setReason(''); setReviewReasons({}); setAssignee(''); keys.current.clear(); }
  async function run<T>(work: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void, success = '') {
    if (active.current || !mounted.current) return; active.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(), operation = ++generation.current; pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try { const value = await work(controller.signal); if (mounted.current && generation.current === operation && !controller.signal.aborted) { apply(value); setMessage(success); } }
    catch (error) {
      if (mounted.current && generation.current === operation) {
        setMessage(error instanceof Failure ? error.message : 'The request was not confirmed. Retry the unchanged action.');
        if (error instanceof Failure && [401, 403, 404].includes(error.status)) clear();
      }
    } finally { clearTimeout(timeout); if (generation.current === operation) { active.current = false; pending.current = null; if (mounted.current) setBusy(false); } }
  }
  async function load(signal: AbortSignal, query = blankFilters, cursor?: string): Promise<Desk> {
    const me = MeSchema.parse(await request('/me', signal)); const session = ModerationSessionSchema.parse(await request('/moderation/session', signal));
    if (me.profile.id !== session.accountId) throw new Failure(401);
    const page = session.reportsAvailable ? CasePageSchema.parse(await request(search(query, cursor), signal)) : null;
    const controls = IncidentPageSchema.parse(await request('/moderation/controls', signal)); return { me, session, page, controls };
  }
  function applyDesk(value: Desk) { setDesk(value); setControlWorld(value.session.scopes.find(scope => scope.role === 'safety-admin')?.worldSlug ?? ''); }
  loadRef.current = () => { void run(signal => load(signal), value => { applyDesk(value); setCurrent(null); setFilters(blankFilters); }); };
  useEffect(() => {
    mounted.current = true; loadRef.current(); const channel = new BroadcastChannel('virtual-city-identity');
    channel.onmessage = () => { generation.current++; pending.current?.abort(); active.current = false; clear(); loadRef.current(); };
    const hidden = () => { if (document.visibilityState === 'hidden') { generation.current++; pending.current?.abort(); active.current = false; setBusy(false); clear(); } else loadRef.current(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { mounted.current = false; generation.current++; pending.current?.abort(); active.current = false; channel.close(); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  function open(selected: Summary) { if (desk) void run(signal => caseData(signal, selected, desk.session), value => { setCurrent(value); setAssignee(value.selected.assignedTo ?? ''); setReason(''); setReviewReasons({}); }); }
  async function mutate(path: string, body: unknown, signal: AbortSignal) {
    if (!desk) throw new Failure(401); const signature = desk.me.profile.id + ':' + path + JSON.stringify(body); if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    const result = await request(path, signal, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': desk.me.csrfToken, 'idempotency-key': keys.current.get(signature)! }, body: JSON.stringify(body) }); keys.current.delete(signature); return result;
  }
  function act(path: string, body: unknown, parse: (value: unknown) => unknown) {
    void run(async signal => {
      parse(await mutate(path, body, signal));
      try {
        const updated = await load(signal, filters); let updatedCase: CaseData | null = null;
        if (current) { const page = CasePageSchema.parse(await request('/moderation/cases?id=' + current.selected.id, signal)); if (page.items[0]) updatedCase = await caseData(signal, page.items[0], updated.session); }
        return { updated, updatedCase };
      } catch { return { updated: null, updatedCase: null }; }
    }, value => { if (value.updated) applyDesk(value.updated); setCurrent(value.updatedCase); setReason(''); setReviewReasons({}); setRecoveryConfirmed(false); }, 'Action confirmed. Refresh for the latest case and control state.');
  }
  function find(event: FormEvent, cursor?: string) { event.preventDefault(); void run(signal => load(signal, filters, cursor), value => { applyDesk(value); setCurrent(null); }); }
  const admin = desk?.session.scopes.some(scope => scope.worldSlug === current?.selected.worldSlug && scope.role === 'safety-admin');
  const hasControls = desk?.session.scopes.some(scope => scope.role === 'safety-admin');
  const control = desk?.controls.items.find(item => item.worldSlug === controlWorld && item.surface === surface);
  return <div className="moderation-desk" aria-busy={busy}><p role="status" aria-live="polite">{message}</p><button type="button" disabled={busy} onClick={() => loadRef.current()}>Refresh desk</button>
    {desk && <><div className="moderation-identity">{desk.me.profile.displayName}<span>{desk.session.scopes.map(scope => scope.worldSlug + ': ' + scope.role).join(' / ')}</span></div>
      {!desk.session.reportsAvailable && <p>Confidential case review is unavailable.</p>}
      {desk.page && <><form className="moderation-filters" onSubmit={find}><label>Case ID<input value={filters.id} onChange={event => setFilters({ ...filters, id: event.target.value })} disabled={busy} pattern="[a-fA-F0-9-]{36}"/></label><label>World<select value={filters.world} onChange={event => setFilters({ ...filters, world: event.target.value })} disabled={busy}><option value="">All permitted worlds</option>{desk.session.scopes.map(scope => <option key={scope.worldSlug} value={scope.worldSlug}>{scope.worldSlug}</option>)}</select></label><label>Category<select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })} disabled={busy}><option value="">All categories</option>{SafetyCategorySchema.options.map(value => <option key={value}>{value}</option>)}</select></label><label>Severity<select value={filters.severity} onChange={event => setFilters({ ...filters, severity: event.target.value })} disabled={busy}><option value="">All severities</option>{SafetySeveritySchema.options.map(value => <option key={value}>{value}</option>)}</select></label><button disabled={busy}>Search cases</button></form>
        <div className="moderation-workspace"><section className="moderation-queue" aria-label="Case queue"><h2>Cases</h2>{!desk.page.items.length && <p>No matching cases.</p>}<ul>{desk.page.items.map(item => <li key={item.id}><button type="button" disabled={busy} aria-pressed={current?.selected.id === item.id} onClick={() => open(item)}><strong>{item.category}</strong><span>{item.worldSlug} / {item.severity}</span><small>{item.id}</small><span>{item.assignedTo === desk.session.accountId ? 'Assigned to you' : item.assignedTo ? 'Assigned' : 'Unassigned'}</span></button></li>)}</ul>{desk.page.nextCursor && <button disabled={busy} type="button" onClick={event => find(event, desk.page!.nextCursor!)}>Next cases</button>}</section>
          <section className="moderation-case" aria-label="Case review"><h2>Case review</h2>{!current ? <p>No case selected.</p> : <><p className="moderation-id">{current.selected.id}</p><p>{current.selected.worldSlug} / {current.selected.category} / {current.selected.severity}</p>
            {admin && <form onSubmit={event => { event.preventDefault(); act('/moderation/cases/' + current.selected.id + '/assignment', { assigneeId: assignee, reason: assignmentReason }, value => value); }}><h3>Assignment</h3><label htmlFor="case-assignee">Assignee account ID</label><input id="case-assignee" value={assignee} onChange={event => setAssignee(event.target.value)} pattern="[a-fA-F0-9-]{36}" required disabled={busy}/><button type="button" disabled={busy} onClick={() => setAssignee(desk.me.profile.id)}>Use my account</button><label htmlFor="assignment-reason">Assignment reason</label><select id="assignment-reason" value={assignmentReason} onChange={event => setAssignmentReason(event.target.value)} disabled={busy}><option value="triage">Triage</option><option value="coverage">Coverage</option><option value="independent-review">Independent review</option></select><button disabled={busy}>Assign case</button></form>}
            {current.detail ? <><h3>Confidential evidence</h3><p className="moderation-notice">Reporter allegation, not a finding</p>{current.detail.evidence ? <><p className="moderation-note">{current.detail.evidence.note || 'No reporter note.'}</p>{current.detail.evidence.source.kind === 'messages' && current.detail.evidence.source.messages.map(item => <blockquote key={item.messageId}><span>{item.sender.displayName}</span><p>{item.content.kind === 'emote' ? item.content.id : item.content.text}</p></blockquote>)}</> : <p>Evidence expired or unavailable.</p>}
              <form onSubmit={event => { event.preventDefault(); act('/moderation/cases/' + current.selected.id + '/sanctions', { kind, durationMinutes: duration, privateReason: reason }, SanctionResultSchema.parse); }}><h3>Temporary restriction</h3><label htmlFor="sanction-kind">Restriction</label><select id="sanction-kind" value={kind} onChange={event => setKind(event.target.value)} disabled={busy}>{SafetySanctionSchema.options.map(value => <option key={value}>{value}</option>)}</select><label htmlFor="sanction-duration">Duration (minutes)</label><input id="sanction-duration" type="number" min={1} max={43200} value={duration} onChange={event => setDuration(Number(event.target.value))} required disabled={busy}/><label htmlFor="sanction-reason">Private decision reason</label><textarea id="sanction-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={20} maxLength={1000} required disabled={busy}/><button disabled={busy || !current.detail.evidence}>Issue restriction</button></form>
              <h3>Restrictions</h3>{!current.sanctions?.items.length && <p>No restrictions recorded.</p>}{current.sanctions?.truncated && <p>Showing the latest 100 restrictions.</p>}{current.sanctions?.items.map(item => <article className="moderation-entry" key={item.id}><strong>{item.kind} / {item.state}</strong><p>Ends {new Date(item.expiresAt).toLocaleString()}</p>{item.state === 'active' && <button disabled={busy || reason.trim().length < 20} type="button" onClick={() => act('/moderation/sanctions/' + item.id + '/revoke', { privateReason: reason }, SanctionResultSchema.parse)}>Revoke restriction</button>}</article>)}
              <h3>Independent appeals</h3>{!current.appeals?.items.length && <p>No appeals available for your review.</p>}{current.appeals?.items.map(item => <article className="moderation-entry" key={item.receiptId}><strong>{item.sanction.kind} / {item.status}</strong><p>Original reason</p><p className="moderation-note">{item.issuanceReason ?? 'Original reason expired or unavailable.'}</p><p>Appeal</p><p className="moderation-note">{item.note ?? 'Appeal note expired or unavailable.'}</p>{item.status === 'received' && <form onSubmit={event => { event.preventDefault(); act('/moderation/appeals/' + item.receiptId + '/review', { decision: decisions[item.receiptId] ?? 'uphold', privateReason: reviewReasons[item.receiptId] ?? '' }, AppealDispositionSchema.parse); }}><label htmlFor={'decision-' + item.receiptId}>Review decision</label><select id={'decision-' + item.receiptId} value={decisions[item.receiptId] ?? 'uphold'} onChange={event => setDecisions({ ...decisions, [item.receiptId]: event.target.value })} disabled={busy}><option value="uphold">Uphold</option><option value="revoke">Revoke</option></select><label htmlFor={'review-reason-' + item.receiptId}>Private review reason</label><textarea id={'review-reason-' + item.receiptId} value={reviewReasons[item.receiptId] ?? ''} onChange={event => setReviewReasons({ ...reviewReasons, [item.receiptId]: event.target.value })} minLength={20} maxLength={1000} required disabled={busy}/><button disabled={busy || !item.note}>Confirm appeal review</button></form>}</article>)}{current.appeals?.nextCursor && <button type="button" disabled={busy} onClick={() => { const cursor = current.appeals!.nextCursor!; void run(signal => request('/moderation/cases/' + current.selected.id + '/appeals?cursor=' + cursor, signal).then(CaseAppealsSchema.parse), appeals => setCurrent({ ...current, appeals })); }}>Next appeals</button>}
            </> : <p>Confidential evidence requires a current case assignment.</p>}</>}
          </section></div></>}
      {hasControls && <section className="moderation-controls"><h2>Incident controls</h2><form onSubmit={event => { event.preventDefault(); act('/moderation/controls/' + controlWorld, { surface, closed: true, reason: controlReason }, IncidentResultSchema.parse); }}><label htmlFor="control-world">Control world</label><select id="control-world" value={controlWorld} onChange={event => setControlWorld(event.target.value)} disabled={busy}>{desk.session.scopes.filter(scope => scope.role === 'safety-admin').map(scope => <option key={scope.worldSlug}>{scope.worldSlug}</option>)}</select><label htmlFor="control-surface">Surface</label><select id="control-surface" value={surface} onChange={event => setSurface(event.target.value)} disabled={busy}><option value="chat">Chat</option><option value="world">World admission</option></select><label htmlFor="control-reason">Closure reason</label><select id="control-reason" value={controlReason} onChange={event => setControlReason(event.target.value)} disabled={busy}><option value="incident">Incident</option><option value="coverage-loss">Coverage loss</option></select><p>Emergency state: {control?.closed ? 'Closed' : 'No emergency closure'}</p><button disabled={busy || control?.closed}>Close selected surface</button></form><label className="moderation-check"><input type="checkbox" checked={recoveryConfirmed} onChange={event => setRecoveryConfirmed(event.target.checked)} disabled={busy}/>Independent recovery review completed</label><button type="button" disabled={busy || !control?.closed || !recoveryConfirmed} onClick={() => act('/moderation/controls/' + controlWorld, { surface, closed: false, reason: 'reviewed-recovery' }, IncidentResultSchema.parse)}>Clear emergency closure</button></section>}
    </>}
  </div>;
}
