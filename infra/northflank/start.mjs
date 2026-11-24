import {spawn} from 'node:child_process';

const profile = process.argv[2];
const children = new Set();
let stopping = false;

function stop(status) {
  if (stopping) return;
  stopping = true;
  process.exitCode = status;
  for (const child of children) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 8000);
  deadline.unref();
}

function launch(name, file, args, options) {
  const child = spawn(file, args, {stdio: 'inherit', ...options});
  children.add(child);
  return new Promise(resolve => {
    child.once('error', () => console.error(`${name} could not start`));
    child.once('close', code => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
}

function service(name, file, args, options) {
  void launch(name, file, args, options).then(code => {
    if (stopping) return;
    console.error(`${name} exited (${code})`);
    stop(1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (profile === 'frontend') {
  const {TUNNEL_TOKEN, ...environment} = process.env;
  service('portal', process.execPath, ['start-runtime.mjs'], {
    cwd: '/app/portal/apps/portal-web',
    env: {...environment, HOSTNAME: '0.0.0.0', PORT: '3300'},
  });
  service('admin', process.execPath, ['start-runtime.mjs'], {
    cwd: '/app/admin/apps/admin-web',
    env: {...environment, HOSTNAME: '0.0.0.0', PORT: '3400'},
  });
  if (TUNNEL_TOKEN) service('tunnel', '/usr/local/bin/cloudflared', ['tunnel', '--no-autoupdate', 'run'], {
    env: {TUNNEL_TOKEN},
  });
} else if (profile === 'backend' || profile === 'migrate') {
  const api = {cwd: '/app/api', env: {...process.env, HOST: '0.0.0.0', PORT: '4300'}};
  if (profile === 'migrate') {
    const result = await launch('migration', process.execPath, ['dist/shared/database/migrate.js'], api);
    if (!stopping) process.exitCode = result;
  } else {
    service('api', process.execPath, ['dist/main.js'], api);
    service('Rust runtime', '/usr/local/bin/aetheria-game-runtime', [], {
      env: {AETHERIA_RUNTIME_BIND: '0.0.0.0:4400', AETHERIA_GAMEPLAY_ENABLED: '0'},
    });
  }
} else {
  throw Error('Expected frontend, backend or migrate Northflank target');
}
