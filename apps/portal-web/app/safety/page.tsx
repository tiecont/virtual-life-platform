import Link from 'next/link';
import SafetyPanel from './SafetyPanel';
import './safety.css';
export default function SafetyPage() {
  return <main className="safety-page"><header><Link href="/identity">Identity and privacy</Link><Link href="/worlds/sdk-sandbox">Cafe</Link></header><section><h1>Your safety decisions</h1><SafetyPanel/></section></main>;
}
