import {describe,expect,it} from 'vitest';
import {PrelaunchEmailCipher} from './email-cipher';

describe('prelaunch email protection',()=>{
  it('normalizes lookup separately from authenticated encryption and rejects tampering',()=>{
    const cipher=new PrelaunchEmailCipher('45'.repeat(32),'prelaunch-test');
    const sealed=cipher.seal(' Owner@Example.COM ');
    expect(sealed).not.toContain('owner@example.com');
    expect(cipher.open(sealed)).toBe('owner@example.com');
    expect(cipher.lookup('Owner@Example.com')).toBe(cipher.lookup('owner@example.com'));
    const parts=sealed.split('.');
    expect(()=>cipher.open(sealed+'=')).toThrow();
    const ciphertext=Buffer.from(parts[3],'base64url');
    ciphertext[0]^=1;
    parts[3]=ciphertext.toString('base64url');
    expect(()=>cipher.open(parts.join('.'))).toThrow();
  });
});
