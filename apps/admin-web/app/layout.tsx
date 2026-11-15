import type {ReactNode} from 'react';
import {headers} from 'next/headers';
import './base.css';
export default async function Layout({children}:{children:ReactNode}){
 const locale=(await headers()).get('x-aetheria-locale')==='en'?'en':'vi';
 return <html lang={locale}><body>{children}</body></html>;
}
