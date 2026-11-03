import Link from 'next/link';
import InvitationPanel from './InvitationPanel';
import './invitations.css';
export const dynamic = 'force-dynamic';
export default function InvitationsPage() {
  const value = process.env.PUBLIC_SOCKET_ORIGIN ?? 'http://127.0.0.1:4300', origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) throw new Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');
  return <main className="invitations-page"><header><Link href="/social">Your circle</Link><span className="tag">VIRTUAL LIFE PLATFORM</span></header><h1>Invitations</h1><InvitationPanel socketOrigin={origin.origin}/></main>;
}
