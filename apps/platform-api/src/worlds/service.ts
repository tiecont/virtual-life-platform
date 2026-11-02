import { readFile } from 'node:fs/promises';
import { WorldFlagsSchema } from '@virtual-city/contracts';
import { WorldRegistry, createSandboxWorld, type WorldActor, type WorldAdapter } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { AdmissionPolicy, type AdultEligibilityProvider } from '../identity/policy';

export interface WorldRuntimeOptions {
  modules?: WorldAdapter[];
  policy?: { permits(actor: WorldActor, policyKey: string): Promise<boolean> };
  adultProof?: AdultEligibilityProvider;
  membership?: { permits(actor: WorldActor, slug: string, membershipId: string): Promise<boolean> };
}
export async function createWorldRuntime(config: Config, identity: IdentityService, options: WorldRuntimeOptions = {}) {
  const admission = new AdmissionPolicy(options.adultProof);
  const registry = new WorldRegistry(config.NODE_ENV, {
    authenticate: credential => identity.authenticate(credential),
    canAccess: async (actor, world) => {
      const policy = world.accessPolicy;
      const approved = policy.kind === 'public' || (await options.policy?.permits(actor, policy.policyKey) ?? false);
      return admission.permits(actor, { enabled: true, restricted: policy.kind !== 'public', restrictedAccessApproved: approved, requiresAdult: policy.kind === 'restricted' && policy.requiresAdult });
    },
    hasMembership: (actor, slug, membershipId) => options.membership?.permits(actor, slug, membershipId) ?? Promise.resolve(false),
  });
  registry.register(createSandboxWorld());
  for (const module of options.modules ?? []) registry.register(module);
  let reloadTail: Promise<void> = Promise.resolve();
  function reloadFlags(): Promise<void> {
    const work = reloadTail.then(async () => {
      let flags: Record<string, boolean> = {};
      try {
        if (config.WORLD_FLAGS_FILE) flags = WorldFlagsSchema.parse(JSON.parse(await readFile(config.WORLD_FLAGS_FILE, 'utf8'))).environments[config.NODE_ENV];
        if (Object.keys(flags).some(slug => !registry.slugs().includes(slug))) throw new Error('Unknown flag');
      } catch {
        await Promise.allSettled(registry.slugs().map(slug => registry.setEnabled(slug, false)));
        throw new Error('World flag configuration unavailable; worlds disabled');
      }
      const results = await Promise.allSettled(registry.slugs().map(slug => registry.setEnabled(slug, flags[slug] ?? false)));
      if (results.some(result => result.status === 'rejected')) throw new Error('One or more worlds unavailable');
    });
    reloadTail = work.catch(() => {}); return work;
  }
  try { await reloadFlags(); } catch (error) { await registry.close().catch(() => {}); throw error; }
  return { registry, reloadFlags };
}
