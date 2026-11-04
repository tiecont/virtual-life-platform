import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReservationMutationSchema, ReservationCheckInSchema } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { ReservationService } from './reservations';
import type { ReservationParties } from './parties';
export function registerReservations(http: FastifyInstance, config: Config, identity: IdentityService, reservations: ReservationService, now = Date.now,parties?:ReservationParties) {
  const limits = new WindowLimiter(now), uuid = z.uuid().transform(value => value.toLowerCase());
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const id = (req: FastifyRequest) => z.strictObject({ id: uuid }).parse(req.params).id;
  const key = (req: FastifyRequest) => uuid.parse(req.headers['idempotency-key']);
  const empty = (req: FastifyRequest) => z.strictObject({}).parse(req.query);
  const write = (req: FastifyRequest) => { empty(req); const value = token(req); identity.verifyCsrf(value, req.headers['x-csrf-token']); return value; };
  http.register(async api => {
    api.setErrorHandler((error, req, reply) => apiErrorHandler(error instanceof WorldError ? new DomainError(error.code, error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 503, error.message) : error, req, reply));
    api.addHook('onRequest', async req => { if (!limits.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.addHook('preHandler', async req => { if (!limits.take('session:' + identity.hash(token(req)), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.get('/reservations', req => { empty(req); return reservations.list(token(req)); });
    if(parties){
      api.post('/reservations/parties/stop',req=>{ReservationMutationSchema.parse(req.body);return parties.stop(write(req));});
      api.get('/reservations/parties/me',req=>{empty(req);return parties.own(token(req));});
      api.post('/reservations/parties/view',req=>parties.view(write(req),req.body));
      for(const action of ['open','join','leave']as const)api.post('/reservations/:id/party/'+action,req=>parties.mutate(write(req),id(req),key(req),('party-'+action)as 'party-open'|'party-join'|'party-leave',req.body));
    }
    api.get('/reservations/:id', req => { empty(req); return reservations.get(token(req), id(req)); });
    api.post('/reservations', async (req, reply) => reply.code(201).send(await reservations.place(write(req), key(req), req.body)));
    api.post('/reservations/waitlist', async (req, reply) => reply.code(201).send(await reservations.waitlist(write(req), key(req), req.body)));
    api.post('/reservations/waitlist/:id/leave', req => { ReservationMutationSchema.parse(req.body); return reservations.leaveWaitlist(write(req), id(req), key(req)); });
    for (const action of ['confirm', 'cancel'] as const) api.post('/reservations/:id/' + action, req => { ReservationMutationSchema.parse(req.body); return reservations.mutate(write(req), id(req), key(req), action); });
    api.post('/reservations/:id/check-in', req => { const input = ReservationCheckInSchema.parse(req.body); return reservations.mutate(write(req), id(req), key(req), 'check-in', input.source); });
  }, { prefix: '/v1' });
}
