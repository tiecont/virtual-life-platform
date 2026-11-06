import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['apps/**/*.unit.test.ts', 'packages/**/*.test.ts'], environment: 'node' } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  { test: { name: 'admin', include: ['apps/admin-web/server/system-observations.unit.test.ts','apps/admin-web/server/observations.unit.test.ts','apps/platform-api/src/identity/operator-crypto.unit.test.ts','apps/admin-web/server/proxy.unit.test.ts','tests/integration/operator-identity.test.ts','tests/integration/operator-account-controls.test.ts','tests/integration/privacy-requests.test.ts','tests/integration/operator-events.test.ts','tests/integration/operator-runtime.test.ts','tests/integration/admin-proxy.test.ts'], environment:'node', testTimeout:15000,hookTimeout:15000,fileParallelism:false } },
  { test: { name: 'observability', include: ['apps/platform-api/src/operations/telemetry.unit.test.ts','apps/platform-api/src/operations/observation.unit.test.ts','tests/integration/telemetry.test.ts'], environment:'node',testTimeout:15000,hookTimeout:15000,fileParallelism:false } },
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
    'packages/contracts/test/compatibility.test.ts', 'packages/world-sdk/test/client-compatibility.test.ts', 'packages/world-sdk/test/room-sync.test.ts',
    'tests/integration/client-compatibility.test.ts',
    'tests/integration/rooms.test.ts', 'tests/integration/room-owner.test.ts',
    'tests/integration/room-network-races.test.ts', 'tests/integration/travel.test.ts',
    'tests/integration/hospitality.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
  // These same files remain in the normal integration gate;the focused lane does not replace it.
  { test: { name: 'security', include: [
    'tests/integration/operator-identity.test.ts','tests/integration/operator-account-controls.test.ts','tests/integration/privacy-requests.test.ts','tests/integration/operator-events.test.ts','tests/integration/operator-runtime.test.ts',
    'tests/integration/security-network.test.ts','tests/integration/identity.test.ts','tests/integration/identity-socket.test.ts',
    'tests/integration/rooms.test.ts','tests/integration/social.test.ts','tests/integration/reports.test.ts',
    'tests/integration/sanctions.test.ts','tests/integration/travel.test.ts','tests/integration/dating-adversarial.test.ts',
    'tests/integration/release-policy.test.ts',
  ], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
] } });
