import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module, Catch, HttpException, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { SCHEMA_VERSION, SanctionChangedSchema } from '@virtual-city/contracts';
import type { Config } from './config';
import { IdentityService } from './identity/service';
import { registerIdentity } from './identity/http';
import { migrationNames } from './db/migrations';
import { createIdentityGateway } from './identity/socket';
import { SocialService, type SocialPresencePort } from './social/service';
import { registerSocial } from './social/http';
import { createWorldRuntime, type WorldRuntimeOptions } from './worlds/service';
import { registerWorlds } from './worlds/http';
import { RoomService } from './rooms/service';
import { registerRoomGateway } from './rooms/socket';
import { RoomMetrics } from './rooms/metrics';
import { RoomAuthority } from './rooms/authority';
import { createSafetyRuntime, loadSafetyPolicy, type SafetyRuntimeOptions } from './safety/runtime';
import { registerChatGateway } from './safety/socket';
import { ReportService } from './safety/reports';
import { registerReports } from './safety/http';
import { SanctionPolicy, SanctionService } from './safety/sanctions';
import { IncidentPolicy, IncidentService } from './safety/incidents';
import { requestLog } from './common/request-log';
class SafeHttpErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const raw = error instanceof HttpException ? error.getStatus() : (typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : 500);
    const status = typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : 500;
    const code = status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST';
    return reply.code(status).send({ error: { code, message: status === 404 ? 'Route not found' : status >= 500 ? 'Service unavailable' : 'Invalid request', requestId: request.id } });
  }
}
Catch()(SafeHttpErrors);
class AppModule {}
Module({})(AppModule);
export async function createApp(config: Config, db: Pick<Pool, 'query' | 'connect'>, logging = false, options: { now?: () => number; socialPresence?: SocialPresencePort; worlds?: WorldRuntimeOptions; safety?: SafetyRuntimeOptions } = {}) {
  const safetyPolicy = await loadSafetyPolicy(options.safety?.policy);
  const requiredMigrations = await migrationNames();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 8192, requestTimeout: 10000, genReqId: () => randomUUID(),
    logger: logging ? { level: 'info', serializers: { req: requestLog }, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body', 'res.headers.set-cookie'] } : false,
  }), { logger: false });
  const http = app.getHttpAdapter().getInstance() as FastifyInstance;
  http.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id).header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').header('referrer-policy', 'same-origin');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin !== config.WEB_ORIGIN) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Origin is not allowed', requestId: req.id } });
    }
  });
  const identity = new IdentityService(db, config, options.now);
  const social = new SocialService(db, identity, options.socialPresence, options.now);
  const sanctionsPolicy = new SanctionPolicy(db, options.now), incidentPolicy = new IncidentPolicy(db);
  const safetyGuard = { permits: async (id: string, world: string) => await incidentPolicy.permits(id, world) && await sanctionsPolicy.permits(id, world), assert: async (id: string, world: string, room?: string, chat?: boolean) => { await incidentPolicy.assert(id, world, room, chat); await sanctionsPolicy.assert(id, world, room, chat); } };
  let roomService: RoomService | undefined = undefined;
  const worlds = await createWorldRuntime(config, identity, { ...options.worlds, safety: safetyGuard, membership: options.worlds?.membership ?? { permits: async (actor, slug, membershipId) => roomService?.permits(actor, slug, membershipId) ?? false } });
  const roomAuthority = new RoomAuthority(db);
  roomService = new RoomService(worlds.registry, identity, roomAuthority, options.now, {
    relationships: (viewer, targets) => social.roomRelationships(viewer, targets),
    profiles: (viewer, targets, world, relationships) => identity.visibleRoomProfiles(viewer, targets, world, relationships),
  }, safetyGuard);
  if (!roomService) throw new Error('Room service failed to initialize');
  const rooms = roomService;
  const reports = new ReportService(db, identity, rooms, safetyPolicy, config.NODE_ENV, config.SAFETY_EVIDENCE_KEY, config.SAFETY_EVIDENCE_KEY_ID, options.now);
  const sanctions = new SanctionService(db, identity, reports, rooms, safetyPolicy, config.NODE_ENV, config.SAFETY_EVIDENCE_KEY, config.SAFETY_EVIDENCE_KEY_ID, options.now);
  const incidents = new IncidentService(db, identity, reports, rooms, () => worlds.registry.slugs(), options.now);
  const chat = await createSafetyRuntime(config, rooms, identity, { ...options.safety, policy: safetyPolicy, evidence: reports.cache }, options.now);
  http.addHook('onClose', async () => { await worlds.registry.close(); });
  http.addHook('onClose', async () => { await rooms.close(); });
  registerWorlds(http, config, worlds.registry, options.now, rooms);
  registerIdentity(http, config, identity, options.now);
  registerSocial(http, config, identity, social, options.now);
  registerReports(http, config, identity, reports, sanctions, incidents, options.now);
  identity.registerExportOwner('sanctions', (id, transaction) => sanctions.exportAccount(id, transaction));
  identity.registerDeletionOwner('sanctions', (id, transaction) => sanctions.redactAccount(id, transaction));
  identity.registerExportOwner('safety', (id, transaction) => reports.exportAccount(id, transaction));
  identity.registerDeletionOwner('safety', (id, transaction) => reports.redactAccount(id, transaction));
  identity.registerExportOwner('social', (id, transaction) => social.exportAccount(id, transaction));
  // Emit truthful room interruption events while sockets are still connected; the gateway closes immediately after this hook.
  http.addHook('preClose', async () => { chat.close(); await reports.close(); await rooms.close(); roomAuthority.close(); });
  http.get('/health/live', async () => ({ status: 'ok' }));
  http.get('/health/ready', async (_req, reply) => {
    try {
      if (['blocked', 'lost', 'closed'].includes(roomAuthority.state)) throw new Error('Room authority unavailable');
      const result = await db.query('SELECT schema_version FROM platform_metadata WHERE singleton=true AND (SELECT count(*) FROM city_schema_migrations WHERE name=ANY($1::text[]))=$2', [requiredMigrations, requiredMigrations.length]);
      if (result.rows.length !== 1 || result.rows[0].schema_version !== SCHEMA_VERSION) throw new Error('Incompatible database schema');
      return { status: 'ready', schemaVersion: SCHEMA_VERSION };
    } catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.useGlobalFilters(new SafeHttpErrors());
  await app.init();
  const gateway = createIdentityGateway(http, config, identity, options.now);
  const roomMetrics = new RoomMetrics();
  const unsubscribeRooms = registerRoomGateway(gateway, rooms, roomMetrics);
  registerChatGateway(gateway, chat);
  const unsubscribeSanctions = sanctions.onChanged(id => gateway.emitToAccount(id, 'sanction.changed', SanctionChangedSchema.parse({ schemaVersion: 1 })));
  const unsubscribeSocial = social.onChanged(ids => { for (const id of ids) gateway.emitToAccount(id, 'friendship.changed', { schemaVersion: 1 }); });
  const unsubscribeRoomSocial = social.onChanged(ids => { void rooms.refreshAccounts(ids); });
  const unsubscribeRoomIdentity = identity.onChanged(id => { void rooms.refreshAccounts([id]); });
  http.addHook('onClose', async () => { unsubscribeSanctions(); unsubscribeSocial(); unsubscribeRoomSocial(); unsubscribeRoomIdentity(); unsubscribeRooms(); });
  await http.ready();
  const diagnostics = () => ({ sockets: gateway.io.of('/').sockets.size, transportConnections: gateway.io.engine.clientsCount, authority: roomAuthority.state, rooms: rooms.diagnostics(), realtime: roomMetrics.snapshot() });
  return { app, http, identity, gateway, social, worlds, rooms, chat, reports, sanctions, incidents, diagnostics };
}
