import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/shared/database/migrations', { recursive: true });
await cp('src/shared/database/migrations', 'dist/shared/database/migrations', { recursive: true });
await mkdir('dist/features/safety/modules/moderation/application', { recursive: true });
await cp('../../config/safety-policy.json', 'dist/features/safety/modules/moderation/application/default-policy.json');
await mkdir('dist/features/events/modules/media/infrastructure', { recursive: true });
await cp('../../config/lounge-media-clearance.json', 'dist/features/events/modules/media/infrastructure/default-media-clearance.json');
