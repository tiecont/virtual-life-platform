import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module, Catch, HttpException, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { SCHEMA_VERSION } from '@virtual-city/contracts';
import type { Config } from './config';
import { IdentityService } from './identity/service';
import { registerIdentity } from './identity/http';
import { migrationNames } from './db/migrations';
import { createIdentityGateway } from './identity/socket';
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
export async function createApp(config: Config, db: Pick<Pool, 'query' | 'connect'>, logging = false, options: { now?: () => number } = {}) {
  const requiredMigrations = await migrationNames();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({
    bodyLimit: 8192, requestTimeout: 10000, genReqId: () => randomUUID(),
    logger: logging ? { level: 'info', serializers: { req: (req: FastifyRequest) => ({ method: req.method, path: req.url.split('?')[0] }) }, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body', 'res.headers.set-cookie'] } : false,
  }), { logger: false });
  const http = app.getHttpAdapter().getInstance() as FastifyInstance;
  http.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id).header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').header('referrer-policy', 'same-origin');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin !== config.WEB_ORIGIN) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Origin is not allowed', requestId: req.id } });
    }
  });
  const identity = new IdentityService(db, config, options.now);
  registerIdentity(http, config, identity, options.now);
  http.get('/health/live', async () => ({ status: 'ok' }));
  http.get('/health/ready', async (_req, reply) => {
    try {
      const result = await db.query('SELECT schema_version FROM platform_metadata WHERE singleton=true AND (SELECT count(*) FROM city_schema_migrations WHERE name=ANY($1::text[]))=$2', [requiredMigrations, requiredMigrations.length]);
      if (result.rows.length !== 1 || result.rows[0].schema_version !== SCHEMA_VERSION) throw new Error('Incompatible database schema');
      return { status: 'ready', schemaVersion: SCHEMA_VERSION };
    } catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.useGlobalFilters(new SafeHttpErrors());
  await app.init();
  const gateway = createIdentityGateway(http, config, identity, options.now);
  await http.ready();
  return { app, http, identity, gateway };
}
