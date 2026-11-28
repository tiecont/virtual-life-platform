import { it, expect } from 'vitest';
import { readConfig } from '../src/shared/config/environment';
const local = { SESSION_SECRET: 'test-only-session-secret-not-production-0001', DATABASE_URL: 'postgresql://localhost/aetheria_soulbound_dev' };
it('validates explicit local defaults and rejects insecure or path-bearing production origins', () => {
  expect(readConfig(local).PORT).toBe(4300);
  expect(() => readConfig({ ...local, NODE_ENV: 'production' })).toThrow('WEB_ORIGIN');
  expect(() => readConfig({ ...local, WEB_ORIGIN: 'https://city.example/path' })).toThrow('WEB_ORIGIN');
  expect(() => readConfig({ ...local, WEB_ORIGIN: 'https://user:secret@city.example' })).toThrow('WEB_ORIGIN');
});
it('never includes credentials in configuration errors', () => {
  expect(() => readConfig({ SESSION_SECRET: 'test-only-session-secret-not-production-0001', DATABASE_URL: 'mysql://user:private@localhost/db' })).toThrow('Invalid environment fields: DATABASE_URL');
});
it('accepts only a bounded PostgreSQL identifier for an optional migration role',()=>{
  expect(readConfig({...local,DATABASE_MIGRATION_ROLE:'pg_database_owner'}).DATABASE_MIGRATION_ROLE).toBe('pg_database_owner');
  expect(readConfig({...local,DATABASE_MIGRATION_ROLE:''}).DATABASE_MIGRATION_ROLE).toBeUndefined();
  for(const value of ['owner; DROP DATABASE postgres','1owner','owner-name','owner"name'])expect(()=>readConfig({...local,DATABASE_MIGRATION_ROLE:value})).toThrow('DATABASE_MIGRATION_ROLE');
});

it('enables Wave 1 only on a local development or test listener',()=>{
  expect(readConfig(local).LOCAL_PET_ARENA_WAVE1).toBe('0');
  const enabled={...local,LOCAL_PET_ARENA_WAVE1:'1'};
  expect(readConfig(enabled).LOCAL_PET_ARENA_WAVE1).toBe('1');
  for(const changes of [
    {NODE_ENV:'production',WEB_ORIGIN:'https://city.example'},
    {HOST:'0.0.0.0'},
    {TRUSTED_PROXY_IP:'127.0.0.1'},
  ])expect(()=>readConfig({...enabled,...changes})).toThrow('LOCAL_PET_ARENA_WAVE1');
});
