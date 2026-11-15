import {Site} from '../../features/prelaunch/modules/site/presentation/site';
import {copy} from '../../features/prelaunch/modules/site/presentation/copy';
import {siteLocale} from '../../server/public-site';
type Props={searchParams:Promise<{lang?:string|string[]}>};
async function locale(props:Props){const value=(await props.searchParams).lang;return siteLocale(typeof value==='string'?value:null);}
export async function generateMetadata(props:Props){return {description:copy[await locale(props)].worldText};}
export default async function Page(props:Props){return <Site locale={await locale(props)}/>;}
