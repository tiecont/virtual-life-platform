import {notFound} from 'next/navigation';
import {Product} from '../../../features/prelaunch/modules/product/presentation/product';
import catalog from '../../../features/prelaunch/modules/product/domain/catalog.json';
import {pages,routes} from '../../../features/prelaunch/modules/product/domain/content';
import {siteLocale} from '../../../server/public-site';
type Props={params:Promise<{section:string[]}>;searchParams:Promise<{lang?:string|string[]}>};
async function resolve(props:Props){const path=(await props.params).section.join('/'),query=(await props.searchParams).lang,locale=siteLocale(typeof query==='string'?query:null),pet=path.startsWith('pets/')?catalog.pets.find(p=>p.id===path.slice(5)):undefined;
 if(!pages[path]&&!['pets','skills','faq','preregister/verify'].includes(path)&&!pet)notFound();return {path,locale,pet};}
export async function generateMetadata(props:Props){const {path,locale,pet}=await resolve(props),route=routes.find(r=>r[0]===path),title=pet?.name??pages[path]?.title[locale==='vi'?0:1]??route?.[locale==='vi'?1:2]??'Aetheria: Soulbound';return {title:title+' · Aetheria: Soulbound',description:locale==='vi'?'Khám phá thế giới, Pet và hành trình Aetheria: Soulbound đang phát triển.':'Explore the world, Pets and journey of Aetheria: Soulbound, in development.'};}
export default async function Page(props:Props){const value=await resolve(props);return <Product path={value.path} locale={value.locale}/>;}
