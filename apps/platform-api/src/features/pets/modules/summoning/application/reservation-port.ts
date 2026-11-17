import type {BannerRules,FamilyState,PullEntropy,PullResolution} from '../domain/rules';
import type {PetAcquisitionCatalogV3} from '@virtual-city/contracts';

/** VL-140 must implement this inside Nest's account/family/wallet transaction.
 * Reserve locks account+family+wallet, binds requestId to requestHash, and durably
 * stores server entropy and immutable rules/catalog BEFORE evaluation. A retry
 * returns the same reservation/receipt; a conflicting hash must reject.
 * This interface alone provides no persistence, idempotence or wallet guarantee.
 */
export interface PullReservationPort {
  reserve(request:{accountId:string;family:string;requestId:string;requestHash:string;count:1|10}):Promise<
    {status:'committed';receipt:PullResolution}|
    {status:'reserved';reservationId:string;acceptedAt:number;rules:BannerRules;catalog:PetAcquisitionCatalogV3;before:FamilyState;entropy:PullEntropy[]}
  >;
  /** Compare the locked revision; atomically debit, persist state/owned copies,
   * duplicate conversions and ordered receipt. Failure rolls everything back.
   * Never expose this port or caller-provided entropy through a public route.
   */
  commit(reservationId:string,resolution:PullResolution):Promise<PullResolution>;
}
