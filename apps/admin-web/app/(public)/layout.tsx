import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {notFound} from 'next/navigation';
import {publicSitePreview} from '../../server/public-site';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Aetheria: Soulbound',robots:{index:false,follow:false}};
export default function PublicLayout({children}:{children:ReactNode}){
 if(!publicSitePreview(process.env))notFound();
 return children;
}
