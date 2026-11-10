import { it, expect } from 'vitest';
import { PasswordHasher } from '../src/features/identity/modules/accounts/infrastructure/passwords';
it('salts the same password independently and verifies only the correct input', async () => {
  const hasher = new PasswordHasher(); const password = 'synthetic-test-only-password';
  const a = await hasher.hash(password); const b = await hasher.hash(password);
  expect(a.salt).not.toBe(b.salt); expect(a.digest).not.toBe(b.digest);
  expect(await hasher.verify(password, a)).toBe(true);
  expect(await hasher.verify('incorrect-test-only-password', a)).toBe(false);
  expect(await hasher.verify(password)).toBe(false);
});
it('rejects excess concurrent KDF work without an unbounded queue', async () => {
  const hasher = new PasswordHasher(1); const active = hasher.hash('synthetic-test-only-password');
  await expect(hasher.hash('synthetic-test-only-password')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  await active; expect((await hasher.hash('synthetic-test-only-password')).digest).toHaveLength(128);
});
