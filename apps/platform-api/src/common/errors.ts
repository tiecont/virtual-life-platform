import type { ApiErrorCode } from '@virtual-city/contracts';
export class DomainError extends Error {
  constructor(readonly code: ApiErrorCode, readonly status: number, message: string, readonly retryAfterSeconds = 60) { super(message); }
}
