'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {OperatorPrelaunchCampaignViewSchema, OperatorPrelaunchQuerySchema, type OperatorPrelaunchCampaignView} from '@aetheria/contracts';

type Props = {
  campaignId: string;
  onCampaignIdChange: (campaignId: string) => void;
  request: (action: string, body?: unknown, signal?: AbortSignal) => Promise<unknown>;
};

export default function CampaignSummary({campaignId, onCampaignIdChange, request}: Props) {
  const [summary, setSummary] = useState<OperatorPrelaunchCampaignView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const query = OperatorPrelaunchQuerySchema.safeParse({campaignId});
    setSummary(null);
    if (!query.success) {
      setMessage('Enter a valid campaign ID.');
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const data = await request('prelaunch-summary?campaignId=' + encodeURIComponent(query.data.campaignId), undefined, controller.signal);
      if (!controller.signal.aborted) setSummary(OperatorPrelaunchCampaignViewSchema.parse(data));
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Campaign summary unavailable.');
    } finally {
      inFlight.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <>
    <h1 tabIndex={-1}>Prelaunch registration</h1>
    <form onSubmit={load} className="aetheria-card">
      <label>Campaign ID<input name="campaignId" className="aetheria-field" required maxLength={36} disabled={busy} value={campaignId}
        onChange={event => {onCampaignIdChange(event.currentTarget.value); setSummary(null); setMessage('');}}/></label>
      <button className="aetheria-button" disabled={busy}>{busy ? 'Loading…' : 'Load campaign'}</button>
      <p role="status">{message}</p>
    </form>
    {summary && <>
      <section className="aetheria-card">
        <h2>{summary.slug}</h2><p>{summary.state}</p>
        <dl className="metrics">
          <div><dt>Lifetime admissions</dt><dd>{summary.confirmed} / {summary.capacity}</dd></div>
          <div><dt>Remaining places</dt><dd>{summary.remaining}</dd></div>
          <div><dt>Currently confirmed</dt><dd>{summary.currentConfirmed}</dd></div>
          <div><dt>Pending confirmation</dt><dd>{summary.pending}</dd></div>
          <div><dt>Withdrawn</dt><dd>{summary.withdrawn}</dd></div>
          <div><dt>Suppressed registrations</dt><dd>{summary.suppressed}</dd></div>
        </dl>
      </section>
      <section className="aetheria-card"><h2>Mail delivery</h2><dl className="metrics">
        <div><dt>Pending or sending</dt><dd>{summary.outbox.pending}</dd></div>
        <div><dt>Sent</dt><dd>{summary.outbox.sent}</dd></div>
        <div><dt>Failed</dt><dd>{summary.outbox.failed}</dd></div>
        <div><dt>Suppressed messages</dt><dd>{summary.outbox.suppressed}</dd></div>
      </dl></section>
    </>}
  </>;
}
