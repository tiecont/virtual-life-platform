import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decode(secret:string){
 if(!/^[A-Z2-7]{32}$/.test(secret))throw Error('Invalid operator factor');
 const bytes=Buffer.alloc(20);let bits=0,value=0,index=0;
 for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes[index++]=(value>>>bits)&255;}}
 return bytes;
}
export function totp(secret:string,now:number,digits:6|8=6){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 const hmac=createHmac('sha1',decode(secret)).update(counter).digest(),offset=hmac[hmac.length-1]&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function matchTotp(secret:string,code:string,now:number,lastCounter:number){
 if(!/^[0-9]{6}$/.test(code))return null;
 const counter=Math.floor(now/30000);let accepted:number|null=null;
 for(const delta of [-1,0,1]){const step=counter+delta;if(step>=0&&timingSafeEqual(Buffer.from(totp(secret,step*30000)),Buffer.from(code))&&step>lastCounter)accepted=step;}
 return accepted;
}
function encryptionKey(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid operator key');return createHmac('sha256',Buffer.from(key,'hex')).update('operator:totp:v1').digest();}
export function sealTotp(secret:string,key:string,subject:string){decode(secret);const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(key),nonce);cipher.setAAD(Buffer.from('operator:'+subject));const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64');}
export function openTotp(value:string,key:string,subject:string){const bytes=Buffer.from(value,'base64');if(bytes.length!==60)throw Error('Invalid operator factor');const cipher=createDecipheriv('aes-256-gcm',encryptionKey(key),bytes.subarray(0,12));cipher.setAAD(Buffer.from('operator:'+subject));cipher.setAuthTag(bytes.subarray(12,28));const secret=Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');decode(secret);return secret;}
