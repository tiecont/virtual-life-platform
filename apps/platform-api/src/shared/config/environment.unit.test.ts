import {describe,expect,it} from 'vitest';
import {readConfig} from './environment';

const base={NODE_ENV:'test',DATABASE_URL:'postgresql://fixture@127.0.0.1/aetheria_soulbound_test',
  SESSION_SECRET:'environment-test-only-secret-0000000000001'};
const native={
  LOCAL_ARENA8_NATIVE:'1',
  LOCAL_ARENA8_NATIVE_BINARY:'artifacts/rust/target/debug/aetheria-game-runtime',
  LOCAL_ARENA8_NATIVE_DATABASE_URL:'postgresql://arena8_runtime:'+'ab'.repeat(24)+'@127.0.0.1/aetheria_soulbound',
  LOCAL_ARENA8_NATIVE_DB_ROLE:'arena8_runtime',
  LOCAL_ARENA8_NATIVE_CA_FILE:'/run/aetheria/pg-ca.pem',
  LOCAL_ARENA8_NATIVE_STORAGE_KEY:'cd'.repeat(32),
  LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:'https://127.0.0.1:4443',
};

describe('native Arena8 environment',()=>{
  it('stays disabled by default without requiring runtime credentials',()=>{
    const config=readConfig(base);
    expect(config.LOCAL_ARENA8_NATIVE).toBe('0');
    expect(config.LOCAL_ARENA8_NATIVE_STORAGE_KEY_ID).toBe('local-v1');
    expect(config.LOCAL_ARENA8_NATIVE_BINARY).toBeUndefined();
  });

  it('accepts an explicit loopback restricted runtime composition',()=>{
    const config=readConfig({...base,...native});
    expect(config.LOCAL_ARENA8_NATIVE).toBe('1');
    expect(config.LOCAL_ARENA8_NATIVE_DB_ROLE).toBe('arena8_runtime');
    expect(config.LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN).toBe('https://127.0.0.1:4443');
    expect(config.LOCAL_ARENA8_NATIVE_STORAGE_KEY).toBe('cd'.repeat(32));
  });

  it('rejects production, non-loopback and mismatched credentials',()=>{
    expect(()=>readConfig({...base,...native,NODE_ENV:'production'}))
      .toThrow(/LOCAL_ARENA8_NATIVE/);
    expect(()=>readConfig({...base,...native,HOST:'0.0.0.0'}))
      .toThrow(/LOCAL_ARENA8_NATIVE/);
    expect(()=>readConfig({...base,...native,LOCAL_ARENA8_NATIVE_DB_ROLE:'other_role'}))
      .toThrow(/LOCAL_ARENA8_NATIVE_DB_ROLE/);
    expect(()=>readConfig({...base,...native,
      LOCAL_ARENA8_NATIVE_DATABASE_URL:'postgresql://arena8_runtime:'+'ab'.repeat(24)+'@10.1.2.3/aetheria_soulbound'}))
      .toThrow(/LOCAL_ARENA8_NATIVE_DATABASE_URL/);
    expect(()=>readConfig({...base,...native,
      LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:'http://127.0.0.1:4443'}))
      .toThrow(/LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN/);
    expect(()=>readConfig({...base,...native,LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN:'https://127.0.0.1:4443/path'}))
      .toThrow(/LOCAL_ARENA8_NATIVE_HTTPS_ORIGIN/);
    expect(()=>readConfig({...base,...native,LOCAL_ARENA8_NATIVE_BINARY:''}))
      .toThrow(/LOCAL_ARENA8_NATIVE_BINARY/);
  });

  it('requires a storage key separate from other platform secrets',()=>{
    const storage='ef'.repeat(32);
    expect(()=>readConfig({...base,...native,
      SESSION_SECRET:storage,LOCAL_ARENA8_NATIVE_STORAGE_KEY:storage}))
      .toThrow(/LOCAL_ARENA8_NATIVE_STORAGE_KEY/);
  });
});
