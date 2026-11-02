import { it, expect } from 'vitest';
import { readConfig } from '../src/config';
const local = { DATABASE_URL: 'postgresql://localhost/virtual_city_dev' };
it('validates explicit local defaults and rejects insecure or path-bearing production origins', () => {
  expect(readConfig(local).PORT).toBe(4300);
  expect(() => readConfig({ ...local, NODE_ENV: 'production' })).toThrow('WEB_ORIGIN');
  expect(() => readConfig({ ...local, WEB_ORIGIN: 'https://city.example/path' })).toThrow('WEB_ORIGIN');
  expect(() => readConfig({ ...local, WEB_ORIGIN: 'https://user:secret@city.example' })).toThrow('WEB_ORIGIN');
});
it('never includes credentials in configuration errors', () => {
  expect(() => readConfig({ DATABASE_URL: 'mysql://user:private@localhost/db' })).toThrow('Invalid environment fields: DATABASE_URL');
});
