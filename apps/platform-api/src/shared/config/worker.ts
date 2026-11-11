import {z} from 'zod';
const WorkerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  DURABLE_JOB_ROLE: z.literal('worker'),
  NATIVE_REWARD_POLICY_FILE: z.string().min(1).max(4096).optional(),
  PROGRESSION_POLICY_FILE: z.string().min(1).max(4096),
  SCHEMA_COMPATIBILITY_FILE: z.string().min(1).max(4096).optional(),
  WORKER_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(3000),
  WORKER_RETRY_LIMIT: z.coerce.number().int().min(1).max(30).default(30),
}).superRefine((env, ctx) => {if (env.NODE_ENV === 'production' && env.WORKER_INTERVAL_MS < 1000) ctx.addIssue({code: 'custom', path: ['WORKER_INTERVAL_MS'], message: 'Production interval below bound'});});
export function readWorkerConfig(env: Record<string, string | undefined> = process.env) {
  const result = WorkerEnv.safeParse(env); if (!result.success) throw Error('Invalid durable worker configuration'); return result.data;
}
export function readWorkerAction(args: string[]) {
  if (!args.length) return {kind: 'run'} as const;
  if (args.length === 1 && args[0] === '--once') return {kind: 'once'} as const;
  if (args.length === 1 && args[0] === '--dead-letters') return {kind: 'dead-letters'} as const;
  if (args.length === 5 && args[0] === '--retry' && z.uuid().safeParse(args[1]).success && /^[a-z][a-z0-9-]{0,63}$/.test(args[2]) && /^(?:[1-9]|[12][0-9]|30)$/.test(args[3]) && z.iso.datetime().safeParse(args[4]).success) return {kind: 'retry', eventId: args[1], consumer: args[2], attempts: Number(args[3]), nextAt: args[4]} as const;
  throw Error('Invalid durable worker action');
}
