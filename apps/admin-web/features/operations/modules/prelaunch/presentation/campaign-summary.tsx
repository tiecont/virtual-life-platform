'use client';

import {useState, type FormEvent} from 'react';
import {OperatorPrelaunchQuerySchema, OperatorPrelaunchSummarySchema, type OperatorPrelaunchSummary} from '@aetheria/contracts';

type Props = {request: (action: string) => Promise<unknown>};

export default function CampaignSummary({request}: Props) {
  const [summary, setSummary] = useState<OperatorPrelaunchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = OperatorPrelaunchQuerySchema.safeParse({campaignId: new FormData(event.currentTarget).get('campaignId')});
    setSummary(null);
    if (!query.success) {
      setMessage('Enter a valid campaign ID.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const data = await request('prelaunch-summary?campaignId=' + encodeURIComponent(query.data.campaignId));
      setSummary(OperatorPrelaunchSummarySchema.parse(data));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Campaign summary unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1 tabIndex={-1}>Prelaunch registration</h1>
    <form onSubmit={load} className="aetheria-card">
      <label>Campaign ID<input name="campaignId" className="aetheria-field" required maxLength={36} disabled={busy}
        onChange={() => {setSummary(null); setMessage('');}}/></label>
      <button className="aetheria-button" disabled={busy}>{busy ? 'Loading…' : 'Load campaign'}</button>
      <p role="status">{message}</p>
    </form>
    {summary && <>
      <section className="aetheria-card">
        <h2>{summary.slug}</h2><p>{summary.state}</p>
        <dl className="metrics">
          <div><dt>Lifetime admissions</dt><dd>{summary.confirmed} / {summary.capacity}</dd></div>
          <div><dt>Remaining places</dt><dd>{summary.remaining}</dd></div>
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
