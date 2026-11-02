import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (!args.length) throw new Error('Supply a test command');
function run(command, args, env = process.env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let output = '';
    if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve(output) : reject(new Error(`${command} exited ${code ?? signal}`)));
  });
}
const project = 'virtual-city-test-' + randomUUID().slice(0, 8);
const compose = ['compose', '-p', project, '-f', 'infra/compose/test.yml'];
const password = randomUUID(); // ephemeral only, never printed or persisted
const env = { ...process.env, CITY_TEST_DB_PASSWORD: password };
let started = false;
try {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    started = true;
    await run('docker', [...compose, 'up', '-d', '--wait'], env);
    const mapping = (await run('docker', [...compose, 'port', 'db', '5432'], env, true)).trim();
    const port = mapping.split(':').at(-1);
    url = `postgresql://virtual_city_test:${password}@127.0.0.1:${port}/virtual_city_test`;
  }
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !/^virtual_city_test(?:_|$)/.test(parsed.pathname.slice(1))) {
    throw new Error('Refusing non-local or non-test database');
  }
  await run(args[0], args.slice(1), { ...process.env, SESSION_SECRET: process.env.SESSION_SECRET ?? randomUUID() + randomUUID(), TEST_DATABASE_URL: url, DATABASE_URL: url, NODE_ENV: 'test' });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    try { await run('docker', [...compose, 'down', '--volumes'], env); }
    catch { console.error('Test database cleanup failed for ' + project); process.exitCode = 1; }
  }
}
