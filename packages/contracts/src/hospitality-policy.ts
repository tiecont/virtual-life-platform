import { z } from 'zod';
import { WorldSlugSchema, WorldVersionSchema } from './world-primitives';
const label = z.string().trim().min(1).max(80).refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
export const OrderWorkflowStrategySchema = z.strictObject({ key: WorldSlugSchema, version: WorldVersionSchema, kind: z.literal('timed-courses'), courses: z.array(z.strictObject({ key: WorldSlugSchema, label, prepareSeconds: z.number().int().min(1).max(300) })).min(1).max(5).refine(courses => new Set(courses.map(course => course.key)).size === courses.length) });
export const MenuPolicySchema = z.strictObject({ items: z.array(z.strictObject({ key: WorldSlugSchema, label, workflowKey: WorldSlugSchema })).min(1).max(50), workflows: z.array(OrderWorkflowStrategySchema).min(1).max(50) }).superRefine((menu, ctx) => {
  if (new Set(menu.items.map(item => item.key)).size !== menu.items.length || new Set(menu.workflows.map(workflow => workflow.key)).size !== menu.workflows.length || menu.items.some(item => !menu.workflows.some(workflow => workflow.key === item.workflowKey))) ctx.addIssue({ code: 'custom', message: 'Menu keys and workflows must be unique and resolved' });
});
export const HospitalityPolicySchema = z.strictObject({ version: WorldVersionSchema, itemKeys: z.array(WorldSlugSchema).min(1).max(50).refine(items => new Set(items).size === items.length), maxActivePerStaff: z.number().int().min(1).max(4), maxQueue: z.number().int().min(1).max(100), staffing: z.strictObject({ kind: z.literal('voluntary'), maxStaff: z.number().int().min(1).max(32) }).optional(), menu: MenuPolicySchema.optional() }).superRefine((policy, ctx) => {
  if (policy.menu && (policy.menu.items.length !== policy.itemKeys.length || policy.menu.items.some(item => !policy.itemKeys.includes(item.key)))) ctx.addIssue({ code: 'custom', path: ['menu'], message: 'Menu must match the trusted item allowlist' });
});
export type HospitalityPolicy = z.infer<typeof HospitalityPolicySchema>;
export type MenuPolicy = z.infer<typeof MenuPolicySchema>;
export type OrderWorkflowStrategy = z.infer<typeof OrderWorkflowStrategySchema>;
