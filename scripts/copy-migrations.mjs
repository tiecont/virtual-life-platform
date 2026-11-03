import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/db/migrations', { recursive: true });
await cp('src/db/migrations', 'dist/db/migrations', { recursive: true });
await mkdir('dist/safety', { recursive: true });
await cp('../../config/safety-policy.json', 'dist/safety/default-policy.json');
