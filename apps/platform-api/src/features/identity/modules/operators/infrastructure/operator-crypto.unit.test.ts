import {it, expect} from 'vitest';
import {totp, matchTotp, sealTotp, openTotp} from './operator-crypto';
it('matches all RFC6238 SHA1 vectors, rejects replay/window drift and authenticates encrypted seeds',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [seconds,code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)expect(totp(secret,seconds*1000,8)).toBe(code);
 const now=1234567890000,counter=Math.floor(now/30000),code=totp(secret,now);
 expect(matchTotp(secret,code,now,counter-1)).toBe(counter);expect(matchTotp(secret,code,now,counter)).toBeNull();expect(matchTotp(secret,code,now+90000,-1)).toBeNull();
 const encrypted=sealTotp(secret,'a'.repeat(64),'operator');expect(encrypted).not.toContain(secret);expect(openTotp(encrypted,'a'.repeat(64),'operator')).toBe(secret);expect(()=>openTotp(encrypted,'b'.repeat(64),'operator')).toThrow();expect(()=>openTotp(encrypted,'a'.repeat(64),'other')).toThrow();
});
