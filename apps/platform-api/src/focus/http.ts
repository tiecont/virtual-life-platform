import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FocusMutationSchema } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { FocusService } from './service';
export function registerFocus(http: FastifyInstance, config: Config, identity: IdentityService, focus: FocusService, now = Date.now) {
  const limits = new WindowLimiter(now), uuid = z.uuid().transform(value => value.toLowerCase());
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const key = (req: FastifyRequest) => uuid.parse(req.headers['idempotency-key']);
  const id = (req: FastifyRequest) => z.strictObject({ id: uuid }).parse(req.params).id;
  const write = (req: FastifyRequest) => { const value = token(req); identity.verifyCsrf(value, req.headers['x-csrf-token']); return value; };
  http.register(async api => {
    api.setErrorHandler((error, req, reply) => apiErrorHandler(error instanceof WorldError ? new DomainError(error.code, error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'WORLD_VERSION_MISMATCH' ? 409 : 503, error.message) : error, req, reply));
    api.addHook('onRequest', async req => { if (!limits.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.addHook('preHandler', async req => { z.strictObject({}).parse(req.query); if (!limits.take('session:' + identity.hash(token(req)), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.post('/focus', async (req, reply) => reply.code(201).send(await focus.start(write(req), key(req), req.body)));
    api.get('/focus', req => focus.current(token(req)));
    api.get('/focus/:id', req => focus.get(token(req), id(req)));
    for (const action of ['pause', 'resume', 'finish', 'cancel'] as const) api.post('/focus/:id/' + action, req => { FocusMutationSchema.parse(req.body); return focus.mutate(write(req), id(req), key(req), action); });
  }, { prefix: '/v1' });
}
