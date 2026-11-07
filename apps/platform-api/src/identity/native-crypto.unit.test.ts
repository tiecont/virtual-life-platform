import {it,expect} from 'vitest';
import {NativeCredentialsCrypto} from './native-crypto';

const binding={deviceId:'00000000-0000-4000-8000-000000000001',accountId:'00000000-0000-4000-8000-000000000002',sessionId:'00000000-0000-4000-8000-000000000003',expiresAt:1900000000000};
const key='1'.repeat(64),credential='a'.repeat(64);
it('encrypts a core credential with fresh nonces and authenticates all device/session binding fields',()=>{
 const crypto=new NativeCredentialsCrypto(key),a=crypto.sealCore(credential,binding),b=crypto.sealCore(credential,binding);expect(a).not.toBe(b);expect(a).not.toContain(credential);expect(crypto.openCore(a,binding)).toBe(credential);
 for(const changed of [{deviceId:binding.accountId},{accountId:binding.deviceId},{sessionId:binding.deviceId},{expiresAt:binding.expiresAt+1}])expect(()=>crypto.openCore(a,{...binding,...changed})).toThrow('Native credential unavailable');
 expect(()=>new NativeCredentialsCrypto('2'.repeat(64)).openCore(a,binding)).toThrow('Native credential unavailable');
});
it('rejects tampered,noncanonical,truncated and malformed ciphertext without revealing the credential',()=>{
 const crypto=new NativeCredentialsCrypto(key),sealed=crypto.sealCore(credential,binding),bytes=Buffer.from(sealed.slice(4),'base64url');bytes[bytes.length-1]^=1;
 for(const input of ['nc1.'+bytes.toString('base64url'),sealed+'=',sealed.slice(0,-5),'na1.'+'b'.repeat(64),'nc1.'+'x'.repeat(4096)])expect(()=>crypto.openCore(input,binding)).toThrow('Native credential unavailable');
 expect(()=>crypto.sealCore('not-an-identity-credential',binding)).toThrow('Native credential unavailable');
});
it('separates native bootstrap request namespaces and refresh reconstruction by key,operation and family',()=>{
 const crypto=new NativeCredentialsCrypto(key),id=binding.deviceId,guest=crypto.namespaceRequest('guest',id);expect(guest).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);expect(guest).not.toBe(id);expect(crypto.namespaceRequest('guest',id)).toBe(guest);expect(crypto.namespaceRequest('login',id)).not.toBe(guest);expect(new NativeCredentialsCrypto('2'.repeat(64)).namespaceRequest('guest',id)).not.toBe(guest);
 const secret=crypto.bootstrapRefresh(binding.deviceId,binding.sessionId,id);expect(secret).toMatch(/^[a-f0-9]{64}$/);expect(secret).not.toBe(key);expect(crypto.bootstrapRefresh(binding.deviceId,binding.sessionId,id)).toBe(secret);expect(crypto.bootstrapRefresh(binding.accountId,binding.sessionId,id)).not.toBe(secret);expect(crypto.bootstrapRefresh(binding.deviceId,binding.accountId,id)).not.toBe(secret);
});
it('authenticates the server-only grant reference without embedding the underlying credential',()=>{const crypto=new NativeCredentialsCrypto(key),reference=crypto.grantCredential(binding.deviceId);expect(reference).not.toContain(credential);expect(crypto.readGrantCredential(reference)).toBe(binding.deviceId);expect(()=>crypto.readGrantCredential(reference.slice(0,-1)+(reference.endsWith('a')?'b':'a'))).toThrow('Native credential unavailable');expect(()=>new NativeCredentialsCrypto('2'.repeat(64)).readGrantCredential(reference)).toThrow('Native credential unavailable');expect(()=>crypto.readGrantCredential('na1.'+'a'.repeat(64))).toThrow('Native credential unavailable');});
