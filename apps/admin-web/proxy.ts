import {NextResponse,type NextRequest} from 'next/server';
export function proxy(request:NextRequest){
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64'),development=process.env.NODE_ENV==='development';
 const policy="default-src 'self'; script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic'"+(development?" 'unsafe-eval'":'')+"; style-src 'self' "+(development?"'unsafe-inline'":"'nonce-"+nonce+"'")+"; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'";
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('content-security-policy',policy);
 const response=NextResponse.next({request:{headers}});response.headers.set('content-security-policy',policy);response.headers.set('cache-control','private, no-store');return response;
}
export const config={matcher:['/((?!api|_next/static|_next/image|favicon.ico).*)']};
