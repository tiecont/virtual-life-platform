import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReportInputSchema, ReportStatusSchema, CaseAssignmentSchema } from '@virtual-city/contracts';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { ReportService } from './reports';
export function registerReports(http: FastifyInstance, config: Config, identity: IdentityService, reports: ReportService, now = Date.now) {
  const limits = new WindowLimiter(now);
  const token = (req: FastifyRequest) => readSessionToken(req, config)!;
  const key = (req: FastifyRequest) => z.uuid().parse(req.headers['idempotency-key']).toLowerCase();
  function write(req: FastifyRequest) { const credential = token(req); identity.verifyCsrf(credential, req.headers['x-csrf-token']); return credential; }
  const id = (req: FastifyRequest) => z.strictObject({ id: z.uuid() }).parse(req.params).id.toLowerCase();
  http.register(async api => {
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest', async req => { if (!limits.take('ip:' + req.ip, 300)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.addHook('preHandler', async req => { const credential = token(req); if (!limits.take('session:' + identity.hash(credential), 60)) throw new DomainError('RATE_LIMITED', 429, 'Please wait before trying again'); });
    api.get('/safety/status', async req => { await identity.authenticate(token(req)); return ReportStatusSchema.parse({ schemaVersion: 1, reportsAvailable: reports.available() }); });
    api.post('/reports', async (req, reply) => reply.code(201).send(await reports.submit(write(req), key(req), ReportInputSchema.parse(req.body))));
    api.get('/reports/:id', req => reports.receiptFor(token(req), id(req)));
    api.get('/moderation/cases', req => { const query = z.strictObject({ cursor: z.uuid().optional() }).parse(req.query); return reports.cases(token(req), query.cursor); });
    api.get('/moderation/cases/:id', req => reports.detail(token(req), id(req)));
    api.post('/moderation/cases/:id/assignment', req => reports.assign(write(req), id(req), key(req), CaseAssignmentSchema.parse(req.body)));
  }, { prefix: '/v1' });
}
