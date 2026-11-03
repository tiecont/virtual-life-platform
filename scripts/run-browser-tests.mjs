import { spawn } from 'node:child_process';

// Each device profile owns its API process and disposable DB. A combined loopback
// run otherwise consumes the real per-source handshake budget across unrelated tests.
const filters = process.argv.slice(2);
for (const project of ['desktop', 'mobile']) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/with-test-db.mjs', 'pnpm', 'exec', 'playwright', 'test', '--project', project, '--output', `test-results/${project}`, ...filters], {
      stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${project}` },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
