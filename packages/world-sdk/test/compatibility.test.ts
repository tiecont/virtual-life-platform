import { it, expect } from 'vitest';
import { supportsContract } from '../src';
it('rejects unknown/future adapter contract versions', () => {
  expect(supportsContract(1)).toBe(true);
  expect(supportsContract(0)).toBe(false);
  expect(supportsContract(2)).toBe(false);
});
