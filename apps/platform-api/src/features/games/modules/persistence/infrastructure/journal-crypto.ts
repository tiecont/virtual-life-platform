import {createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,randomBytes} from 'node:crypto';
import {GameIdSchema,GameModeSchema,GameRulesetVersionSchema,GameVersionSchema,type GameMode} from '@virtual-city/contracts';
export type JournalBinding=Readonly<{matchId:string;generation:string;roomEpoch:string;mode:GameMode;rulesetVersion:string;version:number}>;
const unavailable=()=>new Error('Game journal encryption unavailable');
// Dedicated root/key custody; never reuse player, native, operator or safety
// keys. AAD binds every ciphertext to its exact match generation and revision.
export class GameJournalCrypto{
 #encryption:Buffer;#fingerprint:Buffer;#closed=false;readonly keyId:string;
 constructor(key:string,keyId:string){
  if(!/^[a-f0-9]{64}$/i.test(key)||!/^game-[a-z0-9-]{1,27}$/.test(keyId))throw unavailable();this.keyId=keyId;
  const root=Buffer.from(key,'hex'),derive=(label:string)=>Buffer.from(hkdfSync('sha256',root,'virtual-city/game-journal/v1',label,32));this.#encryption=derive('state-aes-gcm');this.#fingerprint=derive('command-fingerprint');root.fill(0);
 }
 private aad(binding:JournalBinding){if(this.#closed)throw unavailable();for(const id of [binding.matchId,binding.generation,binding.roomEpoch])if(GameIdSchema.parse(id)!==id)throw unavailable();GameModeSchema.parse(binding.mode);GameRulesetVersionSchema.parse(binding.rulesetVersion);GameVersionSchema.parse(binding.version);return Buffer.from(JSON.stringify(['game-journal-v1',this.keyId,binding.matchId,binding.generation,binding.roomEpoch,binding.mode,binding.rulesetVersion,binding.version]));}
 seal(value:string,binding:JournalBinding){try{if(Buffer.byteLength(value)>524288)throw unavailable();const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#encryption,nonce,{authTagLength:16});cipher.setAAD(this.aad(binding));const bytes=Buffer.concat([nonce,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);return 'gj1.'+bytes.toString('base64url');}catch{throw unavailable();}}
 open(sealed:string,binding:JournalBinding){try{if(typeof sealed!=='string'||sealed.length>700000||!/^gj1\.[A-Za-z0-9_-]+$/.test(sealed))throw unavailable();const encoded=sealed.slice(4),bytes=Buffer.from(encoded,'base64url');if(bytes.length<28||bytes.toString('base64url')!==encoded)throw unavailable();const decipher=createDecipheriv('aes-256-gcm',this.#encryption,bytes.subarray(0,12),{authTagLength:16});decipher.setAAD(this.aad(binding));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');}catch{throw unavailable();}}
 fingerprint(canonical:string){if(this.#closed||Buffer.byteLength(canonical)>32768)throw unavailable();return createHmac('sha256',this.#fingerprint).update(canonical).digest('hex');}
 seed(matchId:string,rulesetVersion:string){if(this.#closed)throw unavailable();GameIdSchema.parse(matchId);GameRulesetVersionSchema.parse(rulesetVersion);const seed=randomBytes(32).toString('hex'),commitment=createHash('sha256').update(JSON.stringify(['game-seed-v1',seed,matchId,rulesetVersion])).digest('hex');return {seed,commitment};}
 close(){this.#closed=true;this.#encryption.fill(0);this.#fingerprint.fill(0);}
}
