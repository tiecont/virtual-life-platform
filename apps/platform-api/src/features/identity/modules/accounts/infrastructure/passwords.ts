import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { IdentityError } from '../domain/errors';
export type PasswordRecord = { salt: string; digest: string };
export class PasswordHasher {
  private active = 0;
  private dummySalt = randomBytes(16).toString('hex');
  private dummyDigest = randomBytes(64);
  constructor(private maxActive = 4) {}
  private async derive(password: string, salt: string): Promise<Buffer> {
    if (this.active >= this.maxActive) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before signing in again');
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
      });
    } finally { this.active--; }
  }
  async hash(password: string): Promise<PasswordRecord> { const salt = randomBytes(16).toString('hex'); return { salt, digest: (await this.derive(password, salt)).toString('hex') }; }
  async verify(password: string, record?: PasswordRecord): Promise<boolean> {
    const valid = record && /^[a-f0-9]{32}$/.test(record.salt) && /^[a-f0-9]{128}$/.test(record.digest);
    const actual = await this.derive(password, valid ? record.salt : this.dummySalt);
    const expected = valid ? Buffer.from(record.digest, 'hex') : this.dummyDigest;
    return timingSafeEqual(actual, expected) && Boolean(valid);
  }
}
