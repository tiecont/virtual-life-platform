import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next*/**', '**/next-env.d.ts', '**/coverage/**', '**/playwright-report/**', '**/test-results/**', 'docs/agent/evidence/**', 'artifacts/**', 'apps/mobile/android/app/src/main/assets/**', 'apps/mobile/android/capacitor-cordova-android-plugins/**', 'apps/mobile/android/**/build/**', 'apps/mobile/android/.gradle/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', BroadcastChannel: 'readonly', document: 'readonly', window: 'readonly', crypto: 'readonly', Blob: 'readonly', Buffer: 'readonly' } } },
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
