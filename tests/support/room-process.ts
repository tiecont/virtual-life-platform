import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

export async function startRoomProcess(databaseUrl: string, secret: string, port = 0,world:'sdk-sandbox'|'restaurant'='sdk-sandbox') {
  const child = fork(fileURLToPath(new URL('./room-runtime.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, SESSION_SECRET: secret, ROOM_TEST_PORT: String(port),ROOM_TEST_WORLD:world,...world==='restaurant'?{LOCAL_RESTAURANT_WORLD:'1'}:{} },
  });
  const stop = async (signal: NodeJS.Signals = 'SIGTERM') => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill(signal); await exited;
  };
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Room runtime startup timed out')), 10000);
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Room runtime exited before ready')); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('message', (message: unknown) => {
        clearTimeout(timer);
        if (typeof message === 'object' && message && 'url' in message && typeof message.url === 'string') resolve(message.url);
        else reject(new Error('Invalid room runtime message'));
      });
    });
    return { child, url, stop };
  } catch (error) { await stop('SIGKILL'); throw error; }
}
