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
import { TravelService } from './travel/service';
import { registerTravel } from './travel/http';
import { registerTravelGateway } from './travel/socket';
import { InvitationService } from './invitations/service';
import { registerInvitations } from './invitations/http';
import { FocusService } from './focus/service';
import { registerFocus } from './focus/http';
import { HospitalityService, type HospitalityStaffPort } from './hospitality/service';
import { registerHospitality } from './hospitality/http';
import { HospitalityOutbox, type HospitalityCompletionSink } from './hospitality/outbox';
import { EventService, type EventOrganizerPort } from './events/service';
import { registerEvents } from './events/http';
import { ReservationService } from './events/reservations';
import { registerReservations } from './events/reservations-http';
import { EventPermissions } from './events/permissions';
import { EventInvitationService } from './events/invitations';
import { ProgressionService } from './progression/service';
import { registerProgression } from './progression/http';
import { AppearanceService } from './progression/appearance';
import { DiscoveryService } from './discovery/service';
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
export async function createApp(config: Config, db: Pick<Pool, 'query' | 'connect'>, logging = false, options: { now?: () => number; socialPresence?: SocialPresencePort; worlds?: WorldRuntimeOptions; safety?: SafetyRuntimeOptions; hospitality?: { staff?: HospitalityStaffPort; completionSinks?: readonly HospitalityCompletionSink[] }; events?: { organizers?: EventOrganizerPort }; progression?: { policy: unknown;correctionOperators?:readonly string[] } } = {}) {
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
  const travel = new TravelService(db, identity, rooms, options.now);
  const invitations = new InvitationService(db, identity, social, worlds.registry, options.now);
  const focus = new FocusService(db, identity, rooms, options.now);
  const hospitality = new HospitalityService(db, identity, rooms, social, options.hospitality?.staff, options.now);
  const progression = new ProgressionService(db, identity, focus, async (transaction, account, world) => await new IncidentPolicy(transaction).permits(account,world) && await new SanctionPolicy(transaction, options.now).permits(account,world), options.progression?.policy, options.now,options.progression?.correctionOperators);
  const appearance=new AppearanceService(db,identity,rooms,hospitality,options.now);rooms.setAppearanceProjection((account,world,source,connected)=>appearance.project(account,world,source,connected));
  const hospitalityOutbox = new HospitalityOutbox(db, identity, [...options.hospitality?.completionSinks ?? [], ...progression.policy.enabled ? [progression.hospitalitySink()] : []], options.now);
  const eventPermissions = new EventPermissions(reports, options.now);
  const events = new EventService(db, identity, social, worlds.registry, { permits: async (transaction, account, world) => await new IncidentPolicy(transaction).permits(account, world) && await new SanctionPolicy(transaction, options.now).permits(account, world) }, options.events?.organizers ?? eventPermissions, options.now, eventPermissions);
  const reservations = new ReservationService(db, identity, social, rooms, events, options.now); events.attachReservations(reservations);
  const eventInvitations = new EventInvitationService(db, identity, invitations, events, options.now); events.attachInvitations(eventInvitations);
  const discovery=new DiscoveryService(identity,rooms,events,options.now);http.addHook('preClose',async()=>discovery.close());
  const unsubscribeInvitationWithdrawal = social.onContactWithdrawn((transaction, a, b) => invitations.withdrawContact(transaction, a, b));
  const unsubscribeHospitalityWithdrawal = social.onContactWithdrawn((transaction, a, b) => hospitality.withdrawContact(transaction, a, b));
  const unsubscribeEventWithdrawal = social.onContactWithdrawn((transaction, a, b) => events.withdrawContact(transaction, a, b));
  const unsubscribeReservationWithdrawal = social.onContactWithdrawn((transaction, a, b) => reservations.withdrawContact(transaction, a, b));
  const unsubscribeEventInvitationWithdrawal = social.onContactWithdrawn((transaction, a, b) => eventInvitations.withdrawContact(transaction, a, b));
  const unsubscribeEventConsent = invitations.onConsentWithdrawn((transaction, account) => eventInvitations.withdrawAll(transaction, account));
  const chat = await createSafetyRuntime(config, rooms, identity, { ...options.safety, policy: safetyPolicy, evidence: reports.cache }, options.now);
  http.addHook('onClose', async () => { await worlds.registry.close(); });
  http.addHook('onClose', async () => { await rooms.close(); });
  registerWorlds(http, config, worlds.registry, options.now, rooms,discovery);
  registerIdentity(http, config, identity, options.now);
  registerSocial(http, config, identity, social, options.now);
  registerReports(http, config, identity, reports, sanctions, incidents, options.now);
  registerTravel(http, config, identity, travel, options.now);
  registerInvitations(http, config, identity, invitations, options.now);
  registerFocus(http, config, identity, focus, options.now);
  registerProgression(http, config, identity, progression, appearance, options.now);
  identity.registerExportOwner('appearance',(id,transaction)=>appearance.exportAccount(id,transaction));
  identity.registerExportOwner('progression', (id, transaction) => progression.exportAccount(id,transaction));
  registerHospitality(http, config, identity, hospitality, options.now);
  registerEvents(http, config, identity, events, eventInvitations, options.now);
  identity.registerExportOwner('eventInvitations', (id, transaction) => eventInvitations.exportAccount(id, transaction));
  registerReservations(http, config, identity, reservations, options.now);
  identity.registerExportOwner('reservations', (id, transaction) => reservations.exportAccount(id, transaction));
  identity.registerExportOwner('events', (id, transaction) => events.exportAccount(id, transaction));
  identity.registerExportOwner('hospitality', (id, transaction) => hospitality.exportAccount(id, transaction));
  identity.registerDeletionOwner('hospitality', (id, transaction) => hospitality.redactAccount(id, transaction));
  identity.registerExportOwner('focus', (id, transaction) => focus.exportAccount(id, transaction));
  identity.registerExportOwner('invitations', (id, transaction) => invitations.exportAccount(id, transaction));
  identity.registerExportOwner('travel', (id, transaction) => travel.exportAccount(id, transaction));
  identity.registerExportOwner('sanctions', (id, transaction) => sanctions.exportAccount(id, transaction));
  identity.registerDeletionOwner('sanctions', (id, transaction) => sanctions.redactAccount(id, transaction));
  identity.registerExportOwner('safety', (id, transaction) => reports.exportAccount(id, transaction));
  identity.registerDeletionOwner('safety', (id, transaction) => reports.redactAccount(id, transaction));
  identity.registerExportOwner('social', (id, transaction) => social.exportAccount(id, transaction));
  // Emit truthful room interruption events while sockets are still connected; the gateway closes immediately after this hook.
  http.addHook('preClose', async () => { chat.close(); await events.close(); await hospitalityOutbox.close(); await hospitality.close(); await focus.close(); await invitations.close(); await travel.close(); await reports.close(); await rooms.close(); roomAuthority.close(); });
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
  registerTravelGateway(gateway, travel);
  const unsubscribeSanctions = sanctions.onChanged(id => gateway.emitToAccount(id, 'sanction.changed', SanctionChangedSchema.parse({ schemaVersion: 1 })));
  const unsubscribeSocial = social.onChanged(ids => { for (const id of ids) gateway.emitToAccount(id, 'friendship.changed', { schemaVersion: 1 }); });
  const unsubscribeInvitations = invitations.onChanged((ids, event) => { for (const id of ids) gateway.emitToAccount(id, event, { schemaVersion: 1 }); });
  const unsubscribeEventNotices = events.onNotice(ids => { for (const id of ids) gateway.emitToAccount(id, 'event.notice', { schemaVersion: 1 }); });
  const unsubscribeEventInvitations = eventInvitations.onChanged(ids => { for (const id of ids) gateway.emitToAccount(id, 'event.invitation', { schemaVersion: 1 }); });
  const unsubscribeRoomSocial = social.onChanged(ids => { void rooms.refreshAccounts(ids); });
  const unsubscribeRoomIdentity = identity.onChanged(id => { void rooms.refreshAccounts([id]); });
  http.addHook('onClose', async () => { unsubscribeInvitations(); unsubscribeEventNotices(); unsubscribeEventInvitations(); unsubscribeEventInvitationWithdrawal(); unsubscribeEventConsent(); unsubscribeInvitationWithdrawal(); unsubscribeHospitalityWithdrawal(); unsubscribeEventWithdrawal(); unsubscribeReservationWithdrawal(); unsubscribeSanctions(); unsubscribeSocial(); unsubscribeRoomSocial(); unsubscribeRoomIdentity(); unsubscribeRooms(); });
  await http.ready();
  const diagnostics = () => ({ sockets: gateway.io.of('/').sockets.size, transportConnections: gateway.io.engine.clientsCount, authority: roomAuthority.state, rooms: rooms.diagnostics(), realtime: roomMetrics.snapshot() });
  return { app, http, identity, gateway, social, worlds, rooms, chat, reports, sanctions, incidents, travel, invitations, focus, hospitality, hospitalityOutbox, events, eventInvitations, reservations, progression, diagnostics };
}
