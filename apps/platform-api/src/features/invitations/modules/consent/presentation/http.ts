import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { InvitationRespondSchema, InvitationSettingsSchema, SocialPageSchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { InvitationService } from '../application/service';
export function registerInvitations(http: FastifyInstance, config: Config, identity: IdentityService, invitations: InvitationService, now = Date.now) {
  const limits = new WindowLimiter(now), uuid = z.uuid().transform(value => value.toLowerCase());
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const write = (req: FastifyRequest) => { const value = token(req); identity.verifyCsrf(value, req.headers['x-csrf-token']); return value; };
  const key = (req: FastifyRequest) => uuid.parse(req.headers['idempotency-key']);
  http.register(async api => {
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest', async req => { if (!limits.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.addHook('preHandler', async req => { if (!limits.take('session:' + identity.hash(token(req)), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    const emptyQuery = (req: FastifyRequest) => { z.strictObject({}).parse(req.query); };
    api.get('/me/invitations/settings', req => { emptyQuery(req); return invitations.settings(token(req)); });
    api.patch('/me/invitations/settings', req => { emptyQuery(req); return invitations.updateSettings(write(req), key(req), InvitationSettingsSchema.parse(req.body).allowInvitations); });
    api.get('/invitations', req => { const query = SocialPageSchema.parse(req.query); return invitations.list(token(req), query.cursor, query.limit); });
    api.post('/invitations', async (req, reply) => { emptyQuery(req); return reply.code(201).send(await invitations.create(write(req), key(req), req.body)); });
    api.post('/invitation-groups', async (req, reply) => { emptyQuery(req); return reply.code(201).send(await invitations.createGroup(write(req), key(req), req.body)); });
    api.get('/invitation-groups/:id', req => { emptyQuery(req); const id = z.strictObject({ id: uuid }).parse(req.params).id; return invitations.group(token(req), id); });
    api.post('/invitations/:id/respond', req => { emptyQuery(req); const id = z.strictObject({ id: uuid }).parse(req.params).id; return invitations.respond(write(req), key(req), id, InvitationRespondSchema.parse(req.body).action); });
  }, { prefix: '/v1' });
}
