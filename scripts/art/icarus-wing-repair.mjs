import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    blender: { type: 'string' },
    output: { type: 'string' },
    context: { type: 'string' },
    'skip-bake': { type: 'boolean', default: false },
  },
});

if (!values.blender || !values.output) {
  throw new Error('Required: --blender /path/to/blender --output /new/output/directory');
}

const args = [
  '--background', '--threads', '4', '--python-exit-code', '1',
  '--python', fileURLToPath(new URL('./icarus_wing_repair.py', import.meta.url)),
  '--', '--output', values.output,
];
if (values.context) args.push('--context', values.context);
if (values['skip-bake']) args.push('--skip-bake');

const result = spawnSync(values.blender, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.signal) throw new Error(`Blender terminated with ${result.signal}`);
process.exitCode = result.status ?? 1;
