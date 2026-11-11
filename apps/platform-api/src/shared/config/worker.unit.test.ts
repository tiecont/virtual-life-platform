import {expect, it} from 'vitest';
import {readWorkerConfig, readWorkerAction} from './worker';
it('requires an explicit worker role and policy without requiring session, room, media or encryption secrets', () => {
  const env = {DATABASE_URL: 'postgres://127.0.0.1/virtual_city_test', DURABLE_JOB_ROLE: 'worker', PROGRESSION_POLICY_FILE: 'synthetic-policy.json'};
  expect(readWorkerConfig(env)).toMatchObject({WORKER_INTERVAL_MS: 3000, WORKER_RETRY_LIMIT: 30});
  for (const delta of [{DURABLE_JOB_ROLE: undefined}, {DURABLE_JOB_ROLE: 'api'}, {PROGRESSION_POLICY_FILE: ''}, {DATABASE_URL: 'https://example.invalid'}, {WORKER_RETRY_LIMIT: '0'}, {WORKER_RETRY_LIMIT: '31'}, {WORKER_INTERVAL_MS: '0'}, {NODE_ENV: 'production', WORKER_INTERVAL_MS: '100'}]) expect(() => readWorkerConfig({...env, ...delta})).toThrow('Invalid durable worker configuration');
  expect(readWorkerConfig({...env, SESSION_SECRET: 'private-marker', OPERATOR_TELEMETRY_TOKEN: 'private-marker'})).not.toHaveProperty('SESSION_SECRET');
});
it('worker CLI accepts only bounded explicit actions and never interprets arbitrary flags or shell text', () => {
  expect(readWorkerAction([])).toEqual({kind: 'run'}); expect(readWorkerAction(['--once'])).toEqual({kind: 'once'});
  expect(readWorkerAction(['--dead-letters'])).toEqual({kind: 'dead-letters'});
  expect(readWorkerAction(['--retry', '00000000-0000-4000-8000-000000000001', 'progression-completion-v1', '30', '2026-11-06T12:00:00.000Z'])).toMatchObject({kind: 'retry', attempts: 30});
  for (const args of [['--url', 'https://private-marker.invalid'], ['--once; echo private-marker'], ['--retry', 'bad-id', 'x', '2'], ['--retry', '00000000-0000-4000-8000-000000000001', 'x', '31'], ['--dead-letters', '--once']]) expect(() => readWorkerAction(args)).toThrow('Invalid durable worker action');
});

it('supports an explicitly configured native-only worker and rejects an unconfigured worker', () => {
  const native = {...env, PROGRESSION_POLICY_FILE: undefined, NATIVE_REWARD_POLICY_FILE: 'native-policy.json'};
  expect(readWorkerConfig(native)).toMatchObject({NATIVE_REWARD_POLICY_FILE: 'native-policy.json'});
  expect(() => readWorkerConfig({...native, NATIVE_REWARD_POLICY_FILE: undefined})).toThrow('Invalid durable worker configuration');
});
