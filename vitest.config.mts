import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['apps/**/*.unit.test.ts', 'packages/**/*.test.ts'], environment: 'node' } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  { test: { name: 'worker', include: [
    'apps/platform-api/src/config/worker.unit.test.ts', 'apps/platform-api/src/operations/runtime-lifecycle.unit.test.ts',
    'tests/integration/durable-worker.test.ts', 'tests/integration/hospitality.test.ts', 'tests/integration/focus.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  { test: { name: 'runtime-faults', include: [
    'apps/platform-api/src/operations/runtime-lifecycle.unit.test.ts',
    'tests/integration/runtime-drain.test.ts', 'tests/integration/runtime-main.test.ts', 'tests/integration/room-owner.test.ts',
    'tests/integration/readiness.test.ts', 'tests/integration/hospitality.test.ts',
    'packages/world-sdk/test/room-sync.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  // Focused replay/concurrency suite; every integration file also stays in the complete gate.
  { test: { name: 'protocol', include: [
    'packages/contracts/test/protocol.test.ts',
    'tests/integration/rooms.test.ts', 'tests/integration/room-owner.test.ts',
    'tests/integration/room-network-races.test.ts', 'tests/integration/travel.test.ts',
    'tests/integration/hospitality.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  // These same files remain in the normal integration gate;the focused lane does not replace it.
  { test: { name: 'security', include: [
    'tests/integration/security-network.test.ts','tests/integration/identity.test.ts','tests/integration/identity-socket.test.ts',
    'tests/integration/rooms.test.ts','tests/integration/social.test.ts','tests/integration/reports.test.ts',
    'tests/integration/sanctions.test.ts','tests/integration/travel.test.ts','tests/integration/dating-adversarial.test.ts',
    'tests/integration/release-policy.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
] } });
