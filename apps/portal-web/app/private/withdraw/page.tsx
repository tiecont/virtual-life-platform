import { notFound } from 'next/navigation';
import Link from 'next/link';
import { privateSession } from '../../../features/dating/modules/session/application/session';
import PrivateWithdraw from '../../../features/dating/modules/profile/presentation/PrivateWithdraw';
export const dynamic='force-dynamic';
export default async function PrivateWithdrawPage(){const session=await privateSession();if(!session)return notFound();return <main><header><Link href="/identity">← Your identity</Link></header><section className="identity-section"><h1>Private consent controls</h1><p>Withdraw private preview consent without entering the preview. The server checks your current signed-in account.</p><PrivateWithdraw key={session.me.profile.id+':'+session.me.csrfToken} me={session.me}/><PrivateWithdraw key={'connection:'+session.me.profile.id+':'+session.me.csrfToken} me={session.me} kind="continuation"/></section></main>;}
