import {z} from 'zod';
import {SceneManifestSchema} from './scene';
export const SceneIdentitySchema = z.strictObject({schemaVersion: z.number().int().min(1).max(65535), sha256: z.string().regex(/^[a-f0-9]{64}$/)});
export type SceneIdentity = z.infer<typeof SceneIdentitySchema>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
// Array order is meaningful. This identifies the scene description, not asset bytes.
export function canonicalSceneManifest(input: unknown): string {return JSON.stringify(canonical(SceneManifestSchema.parse(input)));}
export async function sceneManifestHash(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSceneManifest(input));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
