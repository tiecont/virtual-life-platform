// M01 defines only package compatibility. M05 owns actual WorldDefinition/lifecycle.
import { SCHEMA_VERSION } from '@virtual-city/contracts';
export const SDK_CONTRACT_VERSION = SCHEMA_VERSION;
export function supportsContract(version: number): boolean {
  return version === SDK_CONTRACT_VERSION;
}
