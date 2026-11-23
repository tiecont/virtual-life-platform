import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import '@aetheria/ui/tokens.css';
import '@aetheria/ui/components.css';
import './styles.css';
export const metadata:Metadata={title:'Aetheria: SoulBound · Operations',description:'Private operator console',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function OperatorLayout({children}:{children:ReactNode}){return <div className="operator-shell" lang="en">{children}</div>;}
