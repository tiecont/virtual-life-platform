import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  blender: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' },
} });
if (!values.blender || !values.source || !values.output) {
  throw new Error('Required: --blender PATH --source candidate.blend --output NEW_DIRECTORY');
}
const result = spawnSync(values.blender, [
  '--background', '--threads', '4', '--python-exit-code', '1', '--python',
  fileURLToPath(new URL('./icarus_wing_articulation.py', import.meta.url)),
  '--', '--source', values.source, '--output', values.output,
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) throw new Error(`Blender terminated with ${result.signal}`);
process.exitCode = result.status ?? 1;
