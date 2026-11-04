import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { DatingProfileDataSchema,type DatingProfileData } from '@virtual-city/contracts';
export type PrivateProfileBlob={key_id:string;iv:Buffer;tag:Buffer;ciphertext:Buffer};
export class DatingProfileCipher{
 private key:Buffer;
 constructor(key:string,private id:string){if(!/^[a-f0-9]{64}$/i.test(key)||!/^[-a-z0-9]{1,32}$/.test(id))throw Error('Invalid private profile key');this.key=Buffer.from(key,'hex');}
 private aad(account:string,revision:number){return Buffer.from('dating-profile:v1:'+this.id+':'+account+':'+revision);}
 seal(account:string,revision:number,data:DatingProfileData):PrivateProfileBlob{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(this.aad(account,revision));const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(DatingProfileDataSchema.parse(data)))),cipher.final()]);return {key_id:this.id,iv,tag:cipher.getAuthTag(),ciphertext};}
 open(account:string,revision:number,blob:PrivateProfileBlob){if(blob.key_id!==this.id)throw Error('Private profile key unavailable');const cipher=createDecipheriv('aes-256-gcm',this.key,blob.iv);cipher.setAAD(this.aad(account,revision));cipher.setAuthTag(blob.tag);return DatingProfileDataSchema.parse(JSON.parse(Buffer.concat([cipher.update(blob.ciphertext),cipher.final()]).toString('utf8')));}
}
