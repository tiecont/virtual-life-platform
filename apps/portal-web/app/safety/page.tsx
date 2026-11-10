import Link from 'next/link';
import SafetyPanel from '../../features/safety/modules/safety/presentation/SafetyPanel';
import '../../features/safety/modules/safety/presentation/safety.css';
export default function SafetyPage() {
  return <main className="safety-page"><header><Link href="/identity">Identity and privacy</Link><Link href="/worlds/sdk-sandbox">Cafe</Link></header><section><h1>Your safety decisions</h1><SafetyPanel/></section></main>;
}
