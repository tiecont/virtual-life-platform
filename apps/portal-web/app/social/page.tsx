import Link from 'next/link';
import SocialPanel from './SocialPanel';
export const dynamic = 'force-dynamic';
export default function SocialPage() {
  const value = process.env.PUBLIC_SOCKET_ORIGIN ?? 'http://127.0.0.1:4300'; const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) throw new Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');
  return <main><header><Link href="/identity">← Your identity</Link><span className="tag">VIRTUAL LIFE PLATFORM</span></header><section className="identity-section"><p className="eyebrow">Connect by choice</p><h1>Your circle.</h1><p className="intro">Share a contact code with someone you know. A friendship begins only when both people choose it.</p><SocialPanel socketOrigin={origin.origin}/></section></main>;
}
