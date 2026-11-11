import {createHash, timingSafeEqual} from 'node:crypto';
import type {NativeRewardPolicy} from '../../../../../shared/config/native-rewards';

// Amounts and recipient accounts never come from the proposal. The worker
// chooses the configured completion marker and the committed receipt's actor.
export function validNativeCompletion(policy: NativeRewardPolicy, actual: unknown, hash: Buffer): boolean {
  const {ruleset, rulesetVersion} = policy;
  const kind = policy.completionKind ?? 'game.completed.v1';
  const expected = kind === 'pet-arena.completed.v1'
    ? {kind, outcome: 'won', ruleset, rulesetVersion}
    : {kind, ruleset, rulesetVersion};
  return typeof actual === 'object' && actual !== null && !Array.isArray(actual) &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => Reflect.get(actual, key) === value) &&
    hash.length === 32 && timingSafeEqual(hash, createHash('sha256').update(JSON.stringify(expected)).digest());
}
