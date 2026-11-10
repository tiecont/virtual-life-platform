import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import '@virtual-city/ui/tokens.css';
import '@virtual-city/ui/components.css';
import './styles.css';
export const metadata:Metadata={title:'Virtual Life · Operations',description:'Private operator console',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>;}
