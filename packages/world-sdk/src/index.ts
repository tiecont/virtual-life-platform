import { SCHEMA_VERSION } from '@virtual-city/contracts';
export * from './registry';
export * from './sandbox';
export const SDK_CONTRACT_VERSION = SCHEMA_VERSION;
export function supportsContract(version: number): boolean {
  return version === SDK_CONTRACT_VERSION;
}
