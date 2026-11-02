import { Pool } from 'pg';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/config';

async function main() {
  const config = readConfig(); const address = new URL(config.DATABASE_URL);
  if (config.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || !/^virtual_city_test(?:_|$)/.test(address.pathname.slice(1))) throw new Error('Local test runtime only');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });
  const runtime = await createApp(config, pool);
  await runtime.worlds.registry.setEnabled('sdk-sandbox', true);
  await runtime.app.listen(Number(process.env.ROOM_TEST_PORT ?? 0), '127.0.0.1');
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'sample' || !('id' in message)) return;
    process.send?.({ type: 'sample', id: message.id, cpu: process.cpuUsage(), memory: process.memoryUsage(), diagnostics: runtime.diagnostics() });
  });
  process.send?.({ type: 'ready', url: await runtime.app.getUrl() });
  process.once('SIGTERM', () => { void runtime.app.close().then(() => pool.end()).then(() => { process.disconnect?.(); }); });
}
void main().catch(() => { console.error('Local room test runtime failed'); process.exitCode = 1; process.disconnect?.(); });
