import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EventCalendarInputSchema, EventRsvpInputSchema, EventPerformerReadySchema, EventInviteRespondSchema } from '@virtual-city/contracts';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { EventService } from './service';
import type { EventInvitationService } from './invitations';
export function registerEvents(http: FastifyInstance, config: Config, identity: IdentityService, events: EventService, invitations: EventInvitationService, now = Date.now) {
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
    api.get('/events', req => events.catalog(token(req), req.query));
    api.post('/events', async (req, reply) => reply.code(201).send(await events.schedule(write(req), key(req), req.body)));
    api.get('/events/notices', req => { empty(req); return events.notices(token(req)); });
    api.get('/events/:id', req => { empty(req); return events.get(token(req), id(req)); });
    api.get('/events/:id/controls', req => { empty(req); return events.controls(token(req), id(req)); });
    api.post('/events/:id/invitations', async (req, reply) => reply.code(201).send(await invitations.create(write(req), id(req), key(req), req.body)));
    api.get('/event-invitations', req => { empty(req); return invitations.list(token(req)); });
    api.post('/event-invitations/:id/respond', req => invitations.respond(write(req), id(req), key(req), EventInviteRespondSchema.parse(req.body).action));
    for (const action of ['adjust', 'cancel'] as const) api.post('/events/:id/' + action, req => events.govern(write(req), id(req), key(req), action, req.body));
    api.post('/events/:id/performer-ready', req => { const input = EventPerformerReadySchema.parse(req.body); return events.performerReady(write(req), id(req), key(req), input.ready); });
    api.post('/events/:id/rsvp', async (req, reply) => { EventRsvpInputSchema.parse(req.body); return reply.code(201).send(await events.rsvp(write(req), id(req), key(req))); });
    api.post('/events/:id/withdraw', req => { EventRsvpInputSchema.parse(req.body); return events.withdraw(write(req), id(req), key(req)); });
    api.post('/events/:id/calendar', async (req, reply) => { EventCalendarInputSchema.parse(req.body); const value = write(req); key(req); const content = await events.calendar(value, id(req)); return reply.type('text/calendar; charset=utf-8').header('content-disposition', 'attachment; filename="virtual-life-event.ics"').send(content); });
  }, { prefix: '/v1' });
}
