import type {FastifyRequest} from 'fastify';
const credentials=new WeakMap<FastifyRequest,string>();
// Server-only request port. Never mutate Cookie or Authorization into a browser
// credential and never serialize this grant reference on the request object.
export function installNativeRequestCredential(request:FastifyRequest,reference:string){if(!reference.startsWith('ni1.'))throw Error('Invalid internal native credential');credentials.set(request,reference);}
export function nativeRequestCredential(request:FastifyRequest){return credentials.get(request);}
