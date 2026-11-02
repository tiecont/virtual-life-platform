import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['apps/**/*.unit.test.ts', 'packages/**/*.test.ts'], environment: 'node' } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 15000, hookTimeout: 15000, fileParallelism: false } },
] } });
