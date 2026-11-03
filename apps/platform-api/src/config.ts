import { z } from 'zod';
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(2592000),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4300),
  DATABASE_URL: z.string().url().refine(value => {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol);
  }),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3300'),
  SAFETY_EVIDENCE_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  SAFETY_EVIDENCE_KEY_ID: z.string().regex(/^[a-z0-9-]{1,32}$/).default('local-v1'),
  WORLD_FLAGS_FILE: z.string().min(1).max(4096).optional(),
  LOCAL_TRAVEL_FIXTURES: z.enum(['0', '1']).default('0'),
}).superRefine((env, ctx) => {
  const origin = new URL(env.WEB_ORIGIN);
  if (origin.origin !== env.WEB_ORIGIN || !['http:', 'https:'].includes(origin.protocol)) {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'Expected an exact HTTP origin' });
  }
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'HTTPS required in production' });
  }
  if (env.NODE_ENV === 'production' && env.LOCAL_TRAVEL_FIXTURES === '1') ctx.addIssue({ code: 'custom', path: ['LOCAL_TRAVEL_FIXTURES'], message: 'Local travel fixtures cannot run in production' });
});
export type Config = z.infer<typeof Env>;
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment fields: ' + [...new Set(parsed.error.issues.map(i => i.path.join('.')))].join(', '));
  return parsed.data;
}
