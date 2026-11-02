import { DomainError } from '../common/errors';
export class IdentityError extends DomainError {}
export const unauthorized = () => new IdentityError('UNAUTHENTICATED', 401, 'Session expired or unavailable');
