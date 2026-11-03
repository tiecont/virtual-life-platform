import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WorldError, type WorldRegistry } from '@virtual-city/world-sdk';
import { WorldSlugSchema, RoomsListSchema } from '@virtual-city/contracts';
import type { RoomService } from '../rooms/service';
import type { Config } from '../config';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { DiscoveryService } from '../discovery/service';

export function registerWorlds(http: FastifyInstance, config: Config, registry: WorldRegistry, now = Date.now, rooms?: RoomService,discovery?:DiscoveryService) {
  const limits = new WindowLimiter(now);
  http.register(async api => {
    api.setErrorHandler((error, req, reply) => {
      const safe = error instanceof WorldError ? new DomainError(error.code, error.code === 'WORLD_UNAVAILABLE' ? 503 : error.code === 'WORLD_VERSION_MISMATCH' ? 409 : error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 422, error.message) : error;
      return apiErrorHandler(safe, req, reply);
    });
    api.get('/worlds', async req => {
      if (!limits.take(req.ip, 120)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again');
      const credential = readSessionToken(req, config)!;
      z.strictObject({}).parse(req.query);
      return registry.catalog(credential);
    });
    if(discovery)api.get('/discovery',req=>{if(!limits.take('discovery:'+req.ip,120))throw new DomainError('RATE_LIMITED',429,'Please wait before refreshing discovery');z.strictObject({}).parse(req.query);return discovery.observe(readSessionToken(req,config)!);});
    if (rooms) api.get('/worlds/:slug/rooms', async req => {
      if (!limits.take(req.ip, 120)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again');
      const credential = readSessionToken(req, config)!; z.strictObject({}).parse(req.query);
      const { slug } = z.strictObject({ slug: WorldSlugSchema }).parse(req.params);
      return RoomsListSchema.parse(await rooms.list(credential, slug));
    });
  }, { prefix: '/v1' });
}
