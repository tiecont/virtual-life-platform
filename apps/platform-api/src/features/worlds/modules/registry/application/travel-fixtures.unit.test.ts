import { it, expect } from 'vitest';
import { readConfig } from '../../../../../shared/config/environment';
import { createTravelFixtures } from './travel-fixtures';
it('requires explicit local fixture opt-in and rejects it in production, with synthetic stateless definitions only', () => {
  const env = { DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1/virtual_city_test', SESSION_SECRET: 'synthetic-fixture-test-secret-00000001' };
  expect(readConfig(env).LOCAL_TRAVEL_FIXTURES).toBe('0'); expect(readConfig({ ...env, NODE_ENV: 'test', LOCAL_TRAVEL_FIXTURES: '1' }).LOCAL_TRAVEL_FIXTURES).toBe('1');
  expect(() => readConfig({ ...env, NODE_ENV: 'production', WEB_ORIGIN: 'https://example.invalid', LOCAL_TRAVEL_FIXTURES: '1' })).toThrow('LOCAL_TRAVEL_FIXTURES');
  const fixtures = createTravelFixtures(); expect(fixtures).toHaveLength(3); expect(fixtures.every(world => world.definition.kind === 'sandbox' && world.definition.title.startsWith('Synthetic ') && world.supportsTravel)).toBe(true); expect(fixtures.map(world => world.definition.slug)).toEqual(['travel-deadline-fixture', 'travel-maid-fixture', 'travel-portal-fixture']);
});
