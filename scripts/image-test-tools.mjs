import {execFile} from 'node:child_process';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function imageTestTools(directory) {
  await mkdir(directory, {recursive: true, mode: 0o700});
  assert.equal((await readdir(directory)).length, 0, 'Refusing to overwrite image evidence');
  const commands = [], exec = promisify(execFile);
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  async function run(stage, command, args, options = {}) {
    let code = 0, stdout = '', stderr = '';
    const startedAt = new Date().toISOString();
    try {
      const result = await exec(command, args, {env: {...process.env, ...options.env}, signal: options.ignoreCancellation ? undefined : controller.signal, timeout: options.timeout ?? 1200000, maxBuffer: 32 * 1024 * 1024});
      stdout = result.stdout; stderr = result.stderr;
    } catch (error) {
      code = typeof error.code === 'number' ? error.code : 1;
      stdout = String(error.stdout ?? ''); stderr = String(error.stderr ?? '');
    }
    const log = 'command-' + (commands.length + 1) + '.log';
    await writeFile(resolve(directory, log), stdout + stderr, {mode: 0o600, flag: 'wx'});
    commands.push({stage, command, argv: args, exitCode: code, startedAt, endedAt: new Date().toISOString(), log, sha256: sha256(stdout + stderr)});
    if (code !== 0 && !options.allowFailure) throw Error(command + ' failed during ' + stage + '; see private command log');
    return {code, stdout, stderr};
  }
  async function save(name, value) {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    await writeFile(resolve(directory, name), bytes, {mode: 0o600, flag: 'wx'});
    return {ref: resolve(directory, name), sha256: sha256(bytes), access: 'private', retention: 'Local until owner cleanup; not an off-host archive'};
  }
  return {run, save, commands, signal: controller.signal, dispose: () => {process.removeListener('SIGTERM', cancel); process.removeListener('SIGINT', cancel);}};
}
