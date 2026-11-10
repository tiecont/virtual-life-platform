import { it, expect } from 'vitest';
import { nextOrderPhase } from './lifecycle';
const phases = ['PENDING', 'ASSIGNED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'] as const;
const actions = ['claim', 'prepare', 'ready', 'serve', 'complete', 'cancel', 'requeue'] as const;
const legal: Record<string, string> = { 'PENDING:claim': 'ASSIGNED', 'PENDING:cancel': 'CANCELLED', 'ASSIGNED:prepare': 'PREPARING', 'PREPARING:ready': 'READY', 'READY:serve': 'SERVED', 'SERVED:complete': 'COMPLETED', 'ASSIGNED:requeue': 'PENDING', 'PREPARING:requeue': 'PENDING', 'READY:requeue': 'PENDING' };
for (const phase of phases) for (const action of actions) it(`${phase}/${action} obeys explicit lifecycle and terminal guards`, () => {
  const expected = legal[phase + ':' + action]; if (expected) expect(nextOrderPhase(phase, action)).toBe(expected); else expect(() => nextOrderPhase(phase, action)).toThrow();
});
