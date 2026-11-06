import { readFile } from 'node:fs/promises';
import { WorldFlagsSchema } from '@virtual-city/contracts';
import { WorldRegistry, createSandboxWorld, type WorldActor, type WorldAdapter,type WorldPorts } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { AdmissionPolicy, type AdultEligibilityProvider } from '../identity/policy';
import { createTravelFixtures } from './travel-fixtures';
import { createLibraryWorld } from '@virtual-city/library-world';
import { createParkWorld } from '@virtual-city/park-world';
import { createDeadlineWorld } from '@virtual-city/deadline-world';
import { createMaidWorld } from '@virtual-city/maid-world';
import { createRestaurantWorld } from '@virtual-city/restaurant-world';
import { createLoungeWorld } from '@virtual-city/lounge-world';
import {createReleaseWorldRuntime} from './release-installation';
import type {RuntimeControlReader} from '../operations/runtime-policy-store';

export interface WorldRuntimeOptions {
  modules?: WorldAdapter[];
  policy?: { permits(actor: WorldActor, policyKey: string): Promise<boolean> };
  adultProof?: AdultEligibilityProvider;
  membership?: { permits(actor: WorldActor, slug: string, membershipId: string): Promise<boolean> };
  safety?: { permits(accountId: string, worldSlug: string): Promise<boolean> };
  safetyPolicy?:unknown;
  runtimeControls?:RuntimeControlReader;
}
export async function createWorldRuntime(config: Config, identity: IdentityService, options: WorldRuntimeOptions = {}) {
  const admission = new AdmissionPolicy(options.adultProof);
  const ports:WorldPorts={
    authenticate: credential => identity.authenticate(credential),
    canAccess: async (actor, world) => {
      if (options.safety && !await options.safety.permits(actor.accountId, world.slug)) return false;
      const policy = world.accessPolicy;
      const approved = policy.kind === 'public' || (await options.policy?.permits(actor, policy.policyKey) ?? false);
      return admission.permits(actor, { enabled: true, restricted: policy.kind !== 'public', restrictedAccessApproved: approved, requiresAdult: policy.kind === 'restricted' && policy.requiresAdult });
    },
    hasMembership: (actor, slug, membershipId) => options.membership?.permits(actor, slug, membershipId) ?? Promise.resolve(false),
  };
  if(config.RELEASE_POLICY_FILE){if(options.modules?.length)throw Error('Versioned installation rejects injected fixture modules');return createReleaseWorldRuntime(config,ports,options.safetyPolicy,options.runtimeControls);}
  const registry = new WorldRegistry(config.NODE_ENV,ports);
  registry.register(createSandboxWorld());
  if (config.NODE_ENV !== 'production' && config.LOCAL_LIBRARY_WORLD === '1') registry.register(createLibraryWorld());
  if (config.NODE_ENV !== 'production' && config.LOCAL_PARK_WORLD === '1') registry.register(createParkWorld());
  if(config.NODE_ENV!=='production'&&config.LOCAL_DEADLINE_WORLD==='1')registry.register(createDeadlineWorld());
  if(config.NODE_ENV!=='production'&&config.LOCAL_MAID_WORLD==='1')registry.register(createMaidWorld());
  if (config.NODE_ENV !== 'production' && config.LOCAL_RESTAURANT_WORLD === '1') registry.register(createRestaurantWorld());
  if (config.NODE_ENV !== 'production' && config.LOCAL_LOUNGE_WORLD === '1') registry.register(createLoungeWorld());
  if (config.NODE_ENV !== 'production' && config.LOCAL_TRAVEL_FIXTURES === '1') for (const fixture of createTravelFixtures()) registry.register(fixture);
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
  return { registry, reloadFlags,releasePolicy:undefined };
}
