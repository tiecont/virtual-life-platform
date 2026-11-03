import { it, expect } from 'vitest';
import { HospitalityPolicySchema, type OrderWorkflowStrategy } from '@virtual-city/contracts';
import { advanceService } from './workflow';
const workflow: OrderWorkflowStrategy = { key: 'dining-workflow', version: '1.0.0', kind: 'timed-courses', courses: [{ key: 'starter', label: 'Starter', prepareSeconds: 2 }, { key: 'main', label: 'Main', prepareSeconds: 3 }] };
it('sets a trusted preparation deadline,denies early readiness and serves successive courses without skipping', () => {
  expect(advanceService(workflow, 'ASSIGNED', 0, null, 'prepare', 1000)).toEqual({ phase: 'PREPARING', course: 0, readyAt: 3000 });
  expect(() => advanceService(workflow, 'PREPARING', 0, 3000, 'ready', 2999)).toThrow();
  expect(advanceService(workflow, 'PREPARING', 0, 3000, 'ready', 3000)).toEqual({ phase: 'READY', course: 0, readyAt: 3000 });
  expect(advanceService(workflow, 'READY', 0, 3000, 'serve', 3000)).toEqual({ phase: 'ASSIGNED', course: 1, readyAt: null });
  expect(advanceService(workflow, 'ASSIGNED', 1, null, 'prepare', 3000).readyAt).toBe(6000);
  expect(advanceService(workflow, 'READY', 1, 6000, 'serve', 6000)).toEqual({ phase: 'SERVED', course: 1, readyAt: null });
});
it('rejects absent steps,missing server deadline and illegal action order', () => {
  expect(() => advanceService(workflow, 'ASSIGNED', 2, null, 'prepare', 0)).toThrow();
  expect(() => advanceService(workflow, 'PREPARING', 0, null, 'ready', 10000)).toThrow();
  expect(() => advanceService(workflow, 'ASSIGNED', 0, null, 'serve', 10000)).toThrow();
  expect(() => advanceService(workflow, 'SERVED', 1, null, 'prepare', 10000)).toThrow();
});
it('trusted policies reject unresolved or mismatched menu keys,unbounded durations and unsupported workflow kinds', () => {
  const policy = { version: '1.0.0', itemKeys: ['dining'], maxActivePerStaff: 1, maxQueue: 10, menu: { items: [{ key: 'dining', label: 'Dining', workflowKey: workflow.key }], workflows: [workflow] } };
  expect(HospitalityPolicySchema.safeParse(policy).success).toBe(true);
  for (const changed of [{ ...policy, itemKeys: ['coffee'] }, { ...policy, menu: { ...policy.menu, workflows: [] } }, { ...policy, menu: { ...policy.menu, workflows: [workflow, workflow] } }, { ...policy, menu: { ...policy.menu, workflows: [{ ...workflow, kind: 'client-score' }] } }, { ...policy, menu: { ...policy.menu, workflows: [{ ...workflow, courses: [{ key: 'main', label: 'Main', prepareSeconds: 0 }] }] } }]) expect(HospitalityPolicySchema.safeParse(changed).success).toBe(false);
});
