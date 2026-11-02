import { z } from 'zod';
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4300),
  DATABASE_URL: z.string().url().refine(value => {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol);
  }),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3300'),
}).superRefine((env, ctx) => {
  const origin = new URL(env.WEB_ORIGIN);
  if (origin.origin !== env.WEB_ORIGIN || !['http:', 'https:'].includes(origin.protocol)) {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'Expected an exact HTTP origin' });
  }
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'HTTPS required in production' });
  }
});
export type Config = z.infer<typeof Env>;
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment fields: ' + [...new Set(parsed.error.issues.map(i => i.path.join('.')))].join(', '));
  return parsed.data;
}
