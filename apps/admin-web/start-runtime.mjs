import {adminConfig} from './server/runtime-config.mjs';
if (!adminConfig(process.env)) {
  console.error('Admin runtime configuration unavailable');
  process.exitCode = 1;
} else await import('./server.js');
