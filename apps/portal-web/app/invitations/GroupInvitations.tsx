'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiErrorSchema, InvitationGroupSchema, type InvitationGroup, type FriendsPage, type InvitationsPage, type Me, type WorldCard } from '@virtual-city/contracts';
export default function GroupInvitations({ me, friends, worlds, revision }: { me: Me; friends: FriendsPage | null; worlds: WorldCard[]; revision: InvitationsPage | null }) {
  const [recipients, setRecipients] = useState<string[]>([]), [destination, setDestination] = useState(''), [group, setGroup] = useState<InvitationGroup | null>(null), [groupId, setGroupId] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>()), mounted = useRef(true), sending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!revision) { setGroup(null); return; }
    if (!groupId) return;
    const controller = new AbortController();
    void fetch('/v1/invitation-groups/' + groupId, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(); const parsed = InvitationGroupSchema.parse(await response.json()); if (!controller.signal.aborted) setGroup(parsed);
    }).catch(() => { if (!controller.signal.aborted) { setGroup(null); setMessage('Group responses are unavailable. Refresh invitations to check again.'); } });
    return () => controller.abort();
  }, [groupId, revision]);
  useEffect(() => {
    if (!group || group.pendingCount === 0) return;
    const timer = setTimeout(() => { if (mounted.current) { setGroup(null); setMessage('This group invitation window ended. Refresh invitations for the final responses.'); } }, Math.max(250, Date.parse(group.expiresAt) - Date.now() + 100)); return () => clearTimeout(timer);
  }, [group]);
  async function send(event: FormEvent) {
    event.preventDefault(); const world = worlds.find(world => world.slug === destination); if (!world || recipients.length < 2 || recipients.length > 4 || sending.current) return;
    sending.current = true; setBusy(true); setMessage('');
    const input = { schemaVersion: 1, recipientIds: recipients, destination: { worldSlug: world.slug, worldVersion: world.version, sceneVersion: world.sceneRef.version } }, signature = JSON.stringify(input);
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    try {
      const response = await fetch('/v1/invitation-groups', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken, 'idempotency-key': keys.current.get(signature)! }, body: signature });
      if (!response.ok) { const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null)); if (mounted.current) setMessage(parsed.success && parsed.data.error.code === 'RATE_LIMITED' ? 'Please wait before sending more group invitations.' : 'This group invitation is unavailable. Refresh to check current options.'); return; }
      const result = InvitationGroupSchema.parse(await response.json()); keys.current.delete(signature);
      if (mounted.current) { setGroupId(result.id); setGroup(result); setMessage('Group invitations processed. Each friend responds separately.'); }
    } catch { if (mounted.current) setMessage('The group could not be confirmed. Retry with the same choices.'); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-labelledby="group-invitations-title"><h2 id="group-invitations-title">Invite a group</h2><p className="muted">Choose two to four friends. Each person decides separately. Places are checked when they travel; the group may split across available rooms.</p>
    <form onSubmit={send}><fieldset disabled={busy}><legend>Friends to invite</legend>{!friends?.items.length && <p className="muted">Add friends in your circle first.</p>}{friends?.items.map(row => <label className="checkbox" key={row.profile.id}><input type="checkbox" checked={recipients.includes(row.profile.id)} disabled={!recipients.includes(row.profile.id) && recipients.length >= 4} onChange={event => setRecipients(current => event.target.checked ? [...current, row.profile.id] : current.filter(id => id !== row.profile.id))}/>{row.profile.displayName}</label>)}</fieldset>
      <label htmlFor="group-destination">Group destination</label><select id="group-destination" value={destination} disabled={busy} required onChange={event => setDestination(event.target.value)}><option value="">Choose a destination</option>{worlds.map(world => <option key={world.slug} value={world.slug}>{world.title}</option>)}</select><button disabled={busy || recipients.length < 2 || !worlds.some(world => world.slug === destination)}>Send group invitations</button>
    </form><p aria-live="polite">{message}</p>{group && <div aria-label="Group responses"><p>{group.acceptedCount} accepted · {group.pendingCount} pending · {group.items.length - group.acceptedCount - group.pendingCount} closed or unavailable</p><ol>{group.items.map(item => <li key={item.position}>Invitation {item.position + 1}: {item.status.toLowerCase().replaceAll('_', ' ')}</li>)}</ol></div>}
  </section>;
}
