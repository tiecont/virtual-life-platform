import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { GuestInputSchema, ProfilePatchSchema, PrivacySchema, UpgradeInputSchema, LoginInputSchema } from '@virtual-city/contracts';
import type { Config } from '../config';
import { IdentityService } from './service';
import { IdentityError, unauthorized } from './errors';
import { WindowLimiter } from './limits';
import { apiErrorHandler } from '../common/http-errors';
export function sessionCookieName(config: Config) { return config.NODE_ENV === 'production' ? '__Host-city_session' : 'city_session'; }
export function registerIdentity(http: FastifyInstance, config: Config, service: IdentityService, now = Date.now) {
  const name = sessionCookieName(config); const limiter = new WindowLimiter(now);
  const cookieOptions = { path: '/', httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax' as const, signed: true };
  http.register(cookie, { secret: config.SESSION_SECRET });
  const token = (req: FastifyRequest, optional = false) => readSessionToken(req, config, optional);
  function protectedToken(req: FastifyRequest): string {
    const value = token(req)!;
    service.verifyCsrf(value, req.headers['x-csrf-token']);
    if (!limiter.take('write:' + service.hash(value), 60)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before trying again');
    return value;
  }
  const requestKey = (req: FastifyRequest) => z.uuid().parse(req.headers['idempotency-key']);
  const emptyBody = (req: FastifyRequest) => { z.strictObject({}).parse(req.body ?? {}); };
  const writeCookie = (reply: FastifyReply, value: string, expiresAt: string) => reply.setCookie(name, value, { ...cookieOptions, maxAge: Math.max(0, Math.floor((Date.parse(expiresAt) - now()) / 1000)) });
  http.register(async api => {
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest', async req => {
      if (!limiter.take('http:' + req.ip, 300)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before trying again');
    });
    api.post('/session/guest', async (req, reply) => {
      if (!limiter.take('guest:' + req.ip, 10)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before creating another guest');
      const input = GuestInputSchema.parse(req.body);
      const result = await service.guest(input, token(req, true));
      writeCookie(reply, result.token, result.me.expiresAt);
      return reply.code(result.created ? 201 : 200).send(result.me);
    });
    api.post('/session/upgrade', async (req, reply) => {
      const value = protectedToken(req);
      if (!limiter.take('upgrade:' + service.hash(value), 5)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before trying again');
      const result = await service.upgrade(value, requestKey(req), UpgradeInputSchema.parse(req.body));
      writeCookie(reply, result.token, result.me.expiresAt); return result.me;
    });
    api.post('/session/login', async (req, reply) => {
      if (!limiter.take('login:' + req.ip, 5)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before signing in again');
      const result = await service.login(LoginInputSchema.parse(req.body), token(req, true));
      writeCookie(reply, result.token, result.me.expiresAt); return result.me;
    });
    api.get('/me', req => service.me(token(req)!));
    api.patch('/me', req => service.updateProfile(protectedToken(req), requestKey(req), ProfilePatchSchema.parse(req.body)));
    api.get('/me/privacy', req => service.privacy(token(req)!));
    api.patch('/me/privacy', req => service.updatePrivacy(protectedToken(req), requestKey(req), PrivacySchema.parse(req.body)));
    api.get('/me/export', req => service.export(token(req)!));
    api.post('/session/rotate', async (req, reply) => {
      emptyBody(req);
      const result = await service.rotate(protectedToken(req), requestKey(req));
      writeCookie(reply, result.token, result.me.expiresAt); return result.me;
    });
    api.post('/session/logout', async (req, reply) => {
      emptyBody(req);
      const result = await service.logout(protectedToken(req), requestKey(req));
      reply.clearCookie(name, { path: '/', secure: cookieOptions.secure, httpOnly: true, sameSite: 'lax' }); return result;
    });
    api.delete('/me', async (req, reply) => {
      emptyBody(req);
      const result = await service.delete(protectedToken(req), requestKey(req));
      reply.clearCookie(name, { path: '/', secure: cookieOptions.secure, httpOnly: true, sameSite: 'lax' }); return result;
    });
  }, { prefix: '/v1' });
}

export function readSessionToken(req: FastifyRequest, config: Config, optional = false): string | undefined {
    const signed = req.cookies[sessionCookieName(config)];
    if (!signed) { if (optional) return undefined; throw unauthorized(); }
    const result = req.unsignCookie(signed);
    if (!result.valid || !result.value) { if (optional) return undefined; throw unauthorized(); }
    return result.value;
  }
