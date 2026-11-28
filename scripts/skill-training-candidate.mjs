// Render the offline candidate to stdout for engine validation or Admin draft import.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';

const directory = new URL('../config/gameplay/', import.meta.url);
const base = await readFile(new URL('arena8-coop-v2.seed.json', directory));
const candidate = JSON.parse(await readFile(new URL('candidates/skill-training.json', directory), 'utf8'));
if (createHash('sha256').update(base).digest('hex') !== candidate.baseSha256) {
  throw new Error('Review the training policies against the changed seed before generating a candidate.');
}
const bundle = JSON.parse(base);
bundle.contentRevision = candidate.contentRevision;
for (const skill of bundle.skills) {
  const policy = skill.kind + '/' + skill.effect.kind;
  if (!Object.hasOwn(candidate.policies, policy)) throw new Error('Missing policy for ' + skill.id);
  const levels = candidate.policies[policy];
  if (skill.upgradeLevels && !isDeepStrictEqual(skill.upgradeLevels, levels)) {
    throw new Error('Candidate would change an existing training path for ' + skill.id);
  }
  skill.upgradeLevels = levels;
}
process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
