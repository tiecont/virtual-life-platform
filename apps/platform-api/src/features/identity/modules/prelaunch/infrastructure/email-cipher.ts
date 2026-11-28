import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';

export class PrelaunchEmailCipher {
  private readonly key:Buffer;

  constructor(key:string,readonly keyId:string){
    if(!/^[a-f0-9]{64}$/i.test(key))throw Error('Invalid prelaunch email key');
    if(!/^[a-z0-9-]{1,32}$/.test(keyId))throw Error('Invalid prelaunch email key ID');
    this.key=Buffer.from(key,'hex');
  }

  normalize(value:string){return value.normalize('NFKC').trim().toLowerCase();}

  lookup(email:string){
    return createHmac('sha256',this.key).update('prelaunch:lookup:v1:'+this.normalize(email)).digest('hex');
  }

  seal(email:string){
    const normalized=this.normalize(email);
    if(normalized.length<3||normalized.length>254)throw Error('Invalid normalized email');
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from('prelaunch:email:'+this.keyId));
    const encrypted=Buffer.concat([cipher.update(normalized,'utf8'),cipher.final()]);
    return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
  }

  open(sealed:string){
    const values=sealed.split('.');
    if(values.length!==4||values[0]!=='v1')throw Error('Invalid sealed email');
    const iv=Buffer.from(values[1],'base64url'),tag=Buffer.from(values[2],'base64url'),encrypted=Buffer.from(values[3],'base64url');
    if(iv.toString('base64url')!==values[1]||tag.toString('base64url')!==values[2]||encrypted.toString('base64url')!==values[3]){
      throw Error('Invalid sealed email encoding');
    }
    if(iv.length!==12||tag.length!==16||encrypted.length<3||encrypted.length>1024)throw Error('Invalid sealed email');
    const decipher=createDecipheriv('aes-256-gcm',this.key,iv);
    decipher.setAAD(Buffer.from('prelaunch:email:'+this.keyId));
    decipher.setAuthTag(tag);
    const email=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
    if(email!==this.normalize(email))throw Error('Invalid sealed email value');
    return email;
  }
}
