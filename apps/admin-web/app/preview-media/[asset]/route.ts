import {publicSitePreview} from '../../../server/public-site';
import {readWorldConcept} from '../../../features/prelaunch/modules/site/infrastructure/preview-media';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{asset:string}>}){
 const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'};
 if(!publicSitePreview(process.env)||(await params).asset!=='world')return new Response(null,{status:404,headers});
 return new Response(new Uint8Array(await readWorldConcept()),{headers:{...headers,'content-type':'image/webp'}});
}
