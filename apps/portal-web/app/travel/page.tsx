import Link from 'next/link';
import TravelPanel from './TravelPanel';
import './travel.css';
export const dynamic = 'force-dynamic';
export default function TravelPage() {
  const value = process.env.PUBLIC_SOCKET_ORIGIN ?? 'http://127.0.0.1:4300', origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) throw new Error('PUBLIC_SOCKET_ORIGIN must be a trusted HTTP origin');
  return <main className="travel-page"><header><Link href="/invitations">Invitations</Link><Link href="/worlds/sdk-sandbox">Local cafe</Link><span className="tag">VIRTUAL LIFE PLATFORM</span></header><h1>Travel</h1><TravelPanel socketOrigin={origin.origin}/></main>;
}
