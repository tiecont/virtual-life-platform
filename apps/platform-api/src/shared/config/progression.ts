import {readFile} from 'node:fs/promises';
import {ProgressionPolicySchema} from '@virtual-city/contracts';
// Trusted immutable release configuration, not a player/admin mutation endpoint.
export async function loadProgressionPolicy(file?: string) {
  if (!file) return undefined;
  try {const bytes = await readFile(file); if (bytes.length > 65536) throw Error('Policy bounds'); return ProgressionPolicySchema.parse(JSON.parse(bytes.toString('utf8')));}
  catch {throw Error('Progression policy unavailable');}
}
