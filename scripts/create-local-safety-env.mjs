import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile('.env.safety', `SAFETY_EVIDENCE_KEY=${randomBytes(32).toString('hex')}\nSAFETY_EVIDENCE_KEY_ID=local-v1\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored local safety key file. Keep it stable; never commit or use it in production.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Local safety key file already exists; leaving it unchanged.' : 'Could not create the local safety key file.');
  process.exitCode = 1;
}
