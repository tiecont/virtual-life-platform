import {createCipheriv,createDecipheriv,createHmac,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';

export type NativeCredentialBinding=Readonly<{deviceId:string;accountId:string;sessionId:string;expiresAt:number}>;
const unavailable=()=>new Error('Native credential unavailable');

// Only the internal64hex identity credential is sealed. Native wire access,
// refresh and ticket secrets are separate opaque values stored by hash.
export class NativeCredentialsCrypto{
 #encryption:Buffer;
 #bootstrap:Buffer;
 #request:Buffer;
 #grant:Buffer;
 constructor(key:string){
  if(!/^[a-f0-9]{64}$/i.test(key))throw Error('Native credential configuration unavailable');
  const root=Buffer.from(key,'hex'),derive=(purpose:string)=>Buffer.from(hkdfSync('sha256',root,'virtual-city/native-auth/v1',purpose,32));
  this.#encryption=derive('core-at-rest');this.#bootstrap=derive('bootstrap-refresh');this.#request=derive('identity-request-namespace');this.#grant=derive('internal-identity-grant');root.fill(0);
 }
 private aad(binding:NativeCredentialBinding){return Buffer.from(JSON.stringify(['native-core-v1',binding.deviceId,binding.accountId,binding.sessionId,binding.expiresAt]));}
 sealCore(credential:string,binding:NativeCredentialBinding):string{
  try{
   if(!/^[a-f0-9]{64}$/.test(credential))throw unavailable();
   const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#encryption,nonce,{authTagLength:16});cipher.setAAD(this.aad(binding));
   const encrypted=Buffer.concat([cipher.update(credential,'utf8'),cipher.final()]);return'nc1.'+Buffer.concat([nonce,encrypted,cipher.getAuthTag()]).toString('base64url');
  }catch{throw unavailable();}
 }
 openCore(sealed:string,binding:NativeCredentialBinding):string{
  try{
   const encoded=/^nc1\.([A-Za-z0-9_-]{123})$/.exec(sealed)?.[1];if(!encoded)throw unavailable();const bytes=Buffer.from(encoded,'base64url');
   if(bytes.length!==92||bytes.toString('base64url')!==encoded)throw unavailable();
   const decipher=createDecipheriv('aes-256-gcm',this.#encryption,bytes.subarray(0,12),{authTagLength:16});decipher.setAAD(this.aad(binding));decipher.setAuthTag(bytes.subarray(-16));
   const credential=Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');if(!/^[a-f0-9]{64}$/.test(credential))throw unavailable();return credential;
  }catch{throw unavailable();}
 }
 namespaceRequest(operation:'guest'|'login'|'upgrade',requestId:string):string{
  const bytes=createHmac('sha256',this.#request).update(operation+':'+requestId.toLowerCase()).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 }
 bootstrapRefresh(deviceId:string,sessionId:string,requestId:string):string{return createHmac('sha256',this.#bootstrap).update(JSON.stringify([deviceId.toLowerCase(),sessionId.toLowerCase(),requestId.toLowerCase()])).digest('hex');}
 grantCredential(grantId:string):string{return'ni1.'+grantId+'.'+createHmac('sha256',this.#grant).update('identity-grant-v1:'+grantId).digest('hex');}
 readGrantCredential(reference:string):string{
  const parsed=/^ni1\.([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.([a-f0-9]{64})$/.exec(reference);if(!parsed)throw unavailable();
  const expected=this.grantCredential(parsed[1]).split('.')[2];if(!timingSafeEqual(Buffer.from(parsed[2],'hex'),Buffer.from(expected,'hex')))throw unavailable();return parsed[1];
 }
}
