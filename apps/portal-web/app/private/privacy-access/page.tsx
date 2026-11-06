import Link from 'next/link';
import PrivacyAccess from './privacy-access';
export const dynamic='force-dynamic';
export default function PrivacyAccessPage(){return <main><header><Link href="/identity">← Your identity</Link></header><section className="identity-section"><h1>Privacy access</h1><p>Request an export or deletion while your registered account is suspended. A private operator review and your password protect the final action.</p><PrivacyAccess/></section></main>;}
