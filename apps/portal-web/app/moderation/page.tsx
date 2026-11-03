import Link from 'next/link';
import ModerationPanel from './ModerationPanel';
import './moderation.css';
export default function ModerationPage() {
  return <main className="moderation-page"><header><Link href="/identity">Identity and privacy</Link><Link href="/safety">Your safety decisions</Link></header><h1>Moderation desk</h1><ModerationPanel/></main>;
}
