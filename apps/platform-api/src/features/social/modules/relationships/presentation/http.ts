import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FriendRequestInputSchema, FriendRespondSchema, BlockInputSchema, SocialSettingsInputSchema, SocialPageSchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import { SocialService } from '../application/service';
export function registerSocial(http: FastifyInstance, config: Config, identity: IdentityService, social: SocialService, now = Date.now) {
  const limits = new WindowLimiter(now);
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const key = (req: FastifyRequest) => z.uuid().parse(req.headers['idempotency-key']);
  function write(req: FastifyRequest) {
    const credential = token(req); identity.verifyCsrf(credential, req.headers['x-csrf-token']);
    if (!limits.take('writes:' + identity.hash(credential), 30)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again');
    return credential;
  }
  const id = (req: FastifyRequest) => z.strictObject({ id: z.uuid().transform(id => id.toLowerCase()) }).parse(req.params).id;
  const empty = (req: FastifyRequest) => { z.strictObject({}).parse(req.body ?? {}); };
  http.register(async api => {
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest', async req => { if (!limits.take('http:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.get('/social/me', req => social.settings(token(req)));
    api.patch('/social/me', req => social.updateSettings(write(req), key(req), SocialSettingsInputSchema.parse(req.body).requestPolicy));
    api.post('/social/contact-code/rotate', req => { empty(req); return social.rotateCode(write(req), key(req)); });
    api.post('/friends/requests', req => social.request(write(req), key(req), FriendRequestInputSchema.parse(req.body).contactCode));
    api.post('/friends/requests/:id/respond', req => social.respond(write(req), key(req), id(req), FriendRespondSchema.parse(req.body).action));
    api.get('/friends/requests', req => { const query = SocialPageSchema.parse(req.query); return social.requests(token(req), query.cursor, query.limit); });
    api.get('/friends', req => { const query = SocialPageSchema.parse(req.query); return social.friends(token(req), query.cursor, query.limit); });
    api.delete('/friends/:id', req => { empty(req); return social.unfriend(write(req), key(req), id(req)); });
    api.post('/blocks', req => { const input = BlockInputSchema.parse(req.body); return social.block(write(req), key(req), input.targetId, input.blocked); });
    api.get('/blocks', req => social.blocks(token(req)));
  }, { prefix: '/v1' });
}
