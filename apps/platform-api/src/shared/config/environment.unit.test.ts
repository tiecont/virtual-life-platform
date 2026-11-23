import {describe,expect,it} from 'vitest';
import {readConfig} from './environment';

const base={
  NODE_ENV:'test',
  DATABASE_URL:'postgresql://local:local@127.0.0.1:5432/virtual_city_test',
  SESSION_SECRET:'synthetic-player-session-secret-000000000001',
};

describe('prelaunch environment gate',()=>{
  it('keeps registration off without requiring mail key material',()=>{
    expect(readConfig(base).PRELAUNCH_REGISTRATION_ENABLED).toBe('0');
  });
  it('requires a distinct key only when local intake is enabled',()=>{
    expect(()=>readConfig({...base,PRELAUNCH_REGISTRATION_ENABLED:'1'})).toThrow('PRELAUNCH_EMAIL_KEY');
    expect(()=>readConfig({...base,PRELAUNCH_REGISTRATION_ENABLED:'1',PRELAUNCH_EMAIL_KEY:base.SESSION_SECRET})).toThrow('PRELAUNCH_EMAIL_KEY');
    expect(readConfig({...base,PRELAUNCH_REGISTRATION_ENABLED:'1',PRELAUNCH_EMAIL_KEY:'71'.repeat(32)}).PRELAUNCH_EMAIL_KEY_ID).toBe('prelaunch-local-v1');
  });
  it('rejects production activation until release qualification exists',()=>{
    expect(()=>readConfig({...base,NODE_ENV:'production',WEB_ORIGIN:'https://example.com',PRELAUNCH_REGISTRATION_ENABLED:'1',PRELAUNCH_EMAIL_KEY:'72'.repeat(32)})).toThrow('PRELAUNCH_REGISTRATION_ENABLED');
  });
});
