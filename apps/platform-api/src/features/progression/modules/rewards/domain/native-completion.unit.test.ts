import {createHash} from 'node:crypto';
import {describe, it, expect} from 'vitest';
import {validNativeCompletion} from './native-completion';
import type {NativeRewardPolicy} from '../../../../../shared/config/native-rewards';

const policy: NativeRewardPolicy = {schemaVersion: 1, world: 'native:pet', ruleset: 'pet-arena-pve', rulesetVersion: 1, contentHash: 'ab'.repeat(32), rewardKey: 'pet-training-win', completionKind: 'pet-arena.completed.v1'};
const proposal = {kind: 'pet-arena.completed.v1', outcome: 'won', ruleset: policy.ruleset, rulesetVersion: 1};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest();
describe('native Pet Arena completion policy', () => {
  it('accepts only the exact winning terminal marker and intact hash', () => {
    expect(validNativeCompletion(policy, proposal, hash(proposal))).toBe(true);
    for (const value of [null, [], {...proposal, outcome: 'lost'}, {...proposal, account: 'forged'}, {...proposal, amount: 9000}, {...proposal, rulesetVersion: 2}, {...proposal, kind: 'game.completed.v1'}]) {
      expect(validNativeCompletion(policy, value, hash(value))).toBe(false);
    }
    expect(validNativeCompletion(policy, proposal, Buffer.alloc(31))).toBe(false);
    expect(validNativeCompletion(policy, proposal, Buffer.alloc(32))).toBe(false);
  });
  it('retains the explicit synthetic completion policy without accepting Pet outcomes', () => {
    const fixture = {...policy, ruleset: 'headless-counter', completionKind: undefined};
    const completion = {kind: 'game.completed.v1', ruleset: fixture.ruleset, rulesetVersion: 1};
    expect(validNativeCompletion(fixture, completion, hash(completion))).toBe(true);
    expect(validNativeCompletion(fixture, proposal, hash(proposal))).toBe(false);
  });
});
