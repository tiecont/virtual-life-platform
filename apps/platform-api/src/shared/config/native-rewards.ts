import {readFile} from 'node:fs/promises';
import {z} from 'zod';

const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const policy = z.strictObject({
  schemaVersion: z.literal(1),
  world: z.string().regex(/^native:[a-z0-9][a-z0-9._-]{0,63}$/),
  ruleset: key,
  rulesetVersion: z.number().int().min(1).max(2147483647),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  rewardKey: key,
  completionKind: z.enum(['game.completed.v1', 'pet-arena.completed.v1']).optional(),
}).refine(value => (value.ruleset === 'pet-arena-pve') === (value.completionKind === 'pet-arena.completed.v1'), {
  message: 'Pet Arena requires its explicit terminal outcome policy',
});
export type NativeRewardPolicy = z.infer<typeof policy>;

export async function loadNativeRewardPolicy(file?: string): Promise<NativeRewardPolicy | undefined> {
  if (!file) return undefined;
  try {
    const bytes = await readFile(file);
    if (bytes.length > 4096) throw Error('Policy bounds');
    return policy.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw Error('Native reward policy unavailable');
  }
}
