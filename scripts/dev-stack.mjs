import { spawn } from 'node:child_process';
const children = [
  spawn('pnpm', ['--filter', '@virtual-city/platform-api', 'dev'], { stdio: 'inherit', env: process.env }),
  spawn('pnpm', ['--filter', '@virtual-city/portal-web', 'dev'], { stdio: 'inherit', env: process.env }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
children.forEach(child => {
  child.once('error', () => stop(1));
  child.once('exit', code => stop(code ?? 1));
});
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
