import type { Privacy } from '@virtual-city/contracts';
import type { IdentityContext } from './service';
// Inputs come from services. Never deserialize age/role/friend/block claims from clients.
export function canViewPresence(viewer: string, target: string, world: string, privacy: Privacy, relationship: { blocked: boolean; friends: boolean }): boolean {
  if (viewer === target) return true;
  if (world === 'dating' || relationship.blocked || !['deadline', 'maid', 'library', 'restaurant', 'lounge', 'park', 'sdk-sandbox'].includes(world)) return false;
  const visibility = privacy.worldVisibility[world as keyof Privacy['worldVisibility']] ?? privacy.presence;
  return visibility === 'public' || (visibility === 'friends' && relationship.friends);
}
export type AccessRequirement = { enabled: boolean; restricted: boolean; requiresAdult: boolean; restrictedAccessApproved?: boolean };
export interface AdultEligibilityProvider { hasReviewedProof(accountId: string): Promise<boolean> }
export class AdmissionPolicy {
  // No provider installed by default. Self-attestation, request age and roles have no authority.
  constructor(private proof?: AdultEligibilityProvider) {}
  async permits(context: IdentityContext | null, policy: AccessRequirement): Promise<boolean> {
    if (!context || !policy.enabled) return false;
    if (policy.restricted && !policy.restrictedAccessApproved) return false;
    if (policy.requiresAdult) return this.proof ? this.proof.hasReviewedProof(context.accountId) : false;
    return true;
  }
}
