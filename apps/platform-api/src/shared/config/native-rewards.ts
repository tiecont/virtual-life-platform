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
