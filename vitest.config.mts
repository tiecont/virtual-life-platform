import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['apps/**/*.unit.test.ts', 'packages/**/*.test.ts'], environment: 'node' } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  // These same files remain in the normal integration gate;the focused lane does not replace it.
  { test: { name: 'security', include: [
    'tests/integration/security-network.test.ts','tests/integration/identity.test.ts','tests/integration/identity-socket.test.ts',
    'tests/integration/rooms.test.ts','tests/integration/social.test.ts','tests/integration/reports.test.ts',
    'tests/integration/sanctions.test.ts','tests/integration/travel.test.ts','tests/integration/dating-adversarial.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
] } });
