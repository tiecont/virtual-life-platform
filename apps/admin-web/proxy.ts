import {NextResponse,type NextRequest} from 'next/server';
import {operatorPath,publicSitePreview,siteLocale} from './server/public-site';
export function proxy(request:NextRequest){
 const operator=operatorPath(request.nextUrl.pathname);
 if(!operator&&!publicSitePreview(process.env))return new NextResponse(null,{status:404,headers:{'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','content-security-policy':"default-src 'none'; frame-ancestors 'none'"}});
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64'),development=process.env.NODE_ENV==='development';
 const policy=(operator?"media-src 'none'; worker-src 'none'; ":"media-src 'self'; worker-src 'none'; ")+"default-src 'self'; script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic'"+(development?" 'unsafe-eval'":'')+"; style-src 'self' "+(development?"'unsafe-inline'":"'nonce-"+nonce+"'")+"; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'";
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('content-security-policy',policy);
 // Overwrite untrusted incoming locale hints, including RSC navigations.
 headers.set('x-aetheria-locale',operator?'en':siteLocale(request.nextUrl.searchParams.getAll('lang').length===1?request.nextUrl.searchParams.get('lang'):null));
 const response=NextResponse.next({request:{headers}});response.headers.set('content-security-policy',policy);response.headers.set('cache-control','private, no-store');response.headers.set('x-robots-tag','noindex, nofollow');return response;
}
export const config={matcher:['/((?!api/|_next/static/|_next/image|favicon.ico).*)']};
