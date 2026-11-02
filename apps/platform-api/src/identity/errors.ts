export class IdentityError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'IDEMPOTENCY_CONFLICT' | 'RATE_LIMITED' | 'NAME_UNAVAILABLE', readonly status: number, message: string) { super(message); }
}
export const unauthorized = () => new IdentityError('UNAUTHENTICATED', 401, 'Session expired or unavailable');
