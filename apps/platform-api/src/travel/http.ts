import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { TravelService } from './service';
export function registerTravel(http: FastifyInstance, config: Config, identity: IdentityService, travel: TravelService, now = Date.now) {
  const limits = new WindowLimiter(now), uuid = z.uuid().transform(value => value.toLowerCase());
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const key = (req: FastifyRequest) => uuid.parse(req.headers['idempotency-key']);
  const id = (req: FastifyRequest) => z.strictObject({ id: uuid }).parse(req.params).id;
  const write = (req: FastifyRequest) => { const value = token(req); identity.verifyCsrf(value, req.headers['x-csrf-token']); return value; };
  http.register(async api => {
    api.setErrorHandler((error, req, reply) => apiErrorHandler(error instanceof WorldError ? new DomainError(error.code, error.code === 'WORLD_UNAVAILABLE' ? 503 : error.code === 'WORLD_VERSION_MISMATCH' ? 409 : error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 422, error.message) : error, req, reply));
    api.addHook('onRequest', async req => { if (!limits.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.addHook('preHandler', async req => { z.strictObject({}).parse(req.query); if (!limits.take('session:' + identity.hash(token(req)), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.post('/travel-intents', async (req, reply) => reply.code(201).send(await travel.create(write(req), key(req), req.body)));
    api.get('/travel-intents/:id', req => travel.get(token(req), id(req)));
    api.post('/travel-intents/:id/cancel', req => { z.strictObject({}).parse(req.body ?? {}); return travel.cancel(write(req), id(req), key(req)); });
  }, { prefix: '/v1' });
}
