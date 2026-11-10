import Link from 'next/link';
import {AccountDeletionInfo} from '@virtual-city/game-client';
export const metadata={title:'Delete account · Virtual Life Platform'};
export default function AccountDeletionPage(){return <main><header><Link href="/">← Virtual Life Platform</Link></header><section className="identity-section"><h1>Account deletion</h1><AccountDeletionInfo activeAction={<p><Link href="/identity#account-deletion">Open signed-in account controls</Link></p>} suspendedAction={<p><Link href="/private/privacy-access">Open privacy access for a suspended account</Link></p>}/></section></main>;}
