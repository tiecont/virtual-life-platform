import Link from 'next/link';
import IdentityPanel from './IdentityPanel';
export default function IdentityPage() {
  return <main><header><Link href="/">← Virtual City</Link><span className="tag">LOCAL PREVIEW</span></header><section className="identity-section"><p className="eyebrow">Your place in the city</p><h1>One identity.<br/>Your privacy.</h1><p className="intro">Choose a name and an original color avatar. Worlds and travel are still closed while the city is built.</p><IdentityPanel/></section></main>;
}
