import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from './errors';
export function apiErrorHandler(error: unknown, req: FastifyRequest, reply: FastifyReply) {
  const status = error instanceof DomainError ? error.status : error instanceof ZodError ? 422 : (typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503);
  const code = error instanceof DomainError ? error.code : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
  if (status === 429) reply.header('retry-after', String(error instanceof DomainError ? error.retryAfterSeconds : 60));
  return reply.code(status).send({ error: { code, message: error instanceof DomainError ? error.message : status < 500 ? 'Invalid request' : 'Service unavailable', requestId: req.id } });
}
