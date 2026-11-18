import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  blender: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' },
  'verify-existing': { type: 'boolean', default: false },
} });
if (!values.blender || !values.source || !values.output) {
  throw new Error('Required: --blender PATH --source wing-study.blend --output NEW_DIRECTORY');
}
const args = ['--background', '--threads', '4',
  '--python-exit-code', '1', '--python',
  fileURLToPath(new URL('./icarus_wing_assemble.py', import.meta.url)), '--',
  '--source', values.source, '--output', values.output];
if (values['verify-existing']) args.push('--verify-existing');
const result = spawnSync(values.blender, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) throw new Error(`Blender terminated with ${result.signal}`);
process.exitCode = result.status ?? 1;
