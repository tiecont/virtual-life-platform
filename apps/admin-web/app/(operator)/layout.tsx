import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import '@virtual-city/ui/tokens.css';
import '@virtual-city/ui/components.css';
import './styles.css';
export const metadata:Metadata={title:'Aetheria: Soulbound · Operations',description:'Private operator console',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function OperatorLayout({children}:{children:ReactNode}){return <div className="operator-shell" lang="en">{children}</div>;}
