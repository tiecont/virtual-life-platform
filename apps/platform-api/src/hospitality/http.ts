import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorldError } from '@virtual-city/world-sdk';
import { StaffShiftEndSchema } from '@virtual-city/contracts';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { HospitalityService } from './service';
export function registerHospitality(http: FastifyInstance, config: Config, identity: IdentityService, service: HospitalityService, now = Date.now) {
  const limiter = new WindowLimiter(now), uuid = z.uuid().transform(value => value.toLowerCase());
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const write = (req: FastifyRequest) => { const value = token(req); identity.verifyCsrf(value, req.headers['x-csrf-token']); return value; };
  const id = (req: FastifyRequest) => z.strictObject({ id: uuid }).parse(req.params).id;
  http.register(async api => {
    api.setErrorHandler((error, req, reply) => apiErrorHandler(error instanceof WorldError ? new DomainError(error.code, error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'WORLD_VERSION_MISMATCH' ? 409 : 503, error.message) : error, req, reply));
    api.addHook('onRequest', async req => { if (!limiter.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait'); });
    api.addHook('preHandler', async req => { z.strictObject({}).parse(req.query); if (!limiter.take('session:' + identity.hash(token(req)), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait'); });
    api.post('/orders', async (req, reply) => reply.code(201).send(await service.place(write(req), uuid.parse(req.headers['idempotency-key']), req.body)));
    api.get('/staff/shift', req => service.currentShift(token(req)));
    api.post('/staff/shifts', async (req, reply) => reply.code(201).send(await service.startShift(write(req), uuid.parse(req.headers['idempotency-key']), req.body)));
    api.post('/staff/shifts/:id/end', req => { StaffShiftEndSchema.parse(req.body); return service.endShift(write(req), id(req), uuid.parse(req.headers['idempotency-key'])); });
    api.get('/orders/:id', req => service.get(token(req), id(req)));
    api.post('/orders/queue', req => service.queue(write(req), req.body));
    api.post('/orders/menu', req => service.menu(write(req), req.body));
    api.post('/orders/:id/complete', req => service.complete(write(req), id(req), uuid.parse(req.headers['idempotency-key']), req.body));
    for (const action of ['refuse', 'withdraw'] as const) api.post('/orders/:id/' + action, req => service.withdraw(write(req), id(req), uuid.parse(req.headers['idempotency-key']), req.body, action === 'refuse'));
    for (const action of ['claim', 'cancel', 'prepare', 'ready', 'serve'] as const) api.post('/orders/:id/' + action, req => service.mutate(write(req), id(req), uuid.parse(req.headers['idempotency-key']), action, req.body));
  }, { prefix: '/v1' });
}
