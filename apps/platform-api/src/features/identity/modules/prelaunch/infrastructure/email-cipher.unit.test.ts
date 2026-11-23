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
    parts[3]=parts[3].slice(0,-1)+(parts[3].endsWith('a')?'b':'a');
    expect(()=>cipher.open(parts.join('.'))).toThrow();
  });
});
