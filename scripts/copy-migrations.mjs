import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/db/migrations', { recursive: true });
await cp('src/db/migrations', 'dist/db/migrations', { recursive: true });
await mkdir('dist/safety', { recursive: true });
await cp('../../config/safety-policy.json', 'dist/safety/default-policy.json');
await mkdir('dist/events', { recursive: true });
await cp('../../config/lounge-media-clearance.json', 'dist/events/default-media-clearance.json');
