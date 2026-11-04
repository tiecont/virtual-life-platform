import { isIP } from 'node:net';

function peer(address:string|undefined){return address?.startsWith('::ffff:')?address.slice(7):address??'unknown';}
// One explicitly configured proxy peer,never a caller-provided trust flag.
export function isTrustedProxy(address:string|undefined,trusted?:string){return !!trusted&&peer(address)===trusted;}
export function clientAddress(address:string|undefined,forwarded:string|string[]|undefined,trusted?:string){
 if(isTrustedProxy(address,trusted)&&typeof forwarded==='string'&&isIP(forwarded))return forwarded;
 return peer(address);
}
