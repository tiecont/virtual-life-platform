import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { loadSafetyPolicy } from './runtime';
import { ChatService } from './chat';
import type { RoomService } from '../../../../rooms/modules/presence/application/service';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { ReportService } from '../../reporting/application/reports';
import type { Pool } from 'pg';

it('loads validated server-owned defaults, rejects unsafe config and cannot activate production via local override', async () => {
  const policy = await loadSafetyPolicy(); expect(policy.defaults.chatEnabled).toBe(false);
  await expect(loadSafetyPolicy({ ...policy, defaults: { ...policy.defaults, reporterIdentityPublic: true } })).rejects.toThrow('Safety policy configuration unavailable');
  const neverUsedRoom = {} as RoomService; const neverUsedIdentity = {} as IdentityService;
  const chat = new ChatService(neverUsedRoom, neverUsedIdentity, 'production', { enabled: true, policy });
  expect(chat.diagnostics().enabled).toBe(false);
  await expect(chat.send('not-a-credential', 'not-a-connection', { schemaVersion: 1, requestId: randomUUID(), epoch: randomUUID(), roomId: randomUUID(), membershipId: randomUUID(), content: { kind: 'canned', id: 'hello' } }, () => { throw new Error('must never emit'); })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  chat.close();
});

it('report evidence keys cannot enable production reporting or privileged case access', async () => {
  const reports = new ReportService({} as Pool, {} as IdentityService, {} as RoomService, await loadSafetyPolicy(), 'production', '89'.repeat(32));
  expect(reports.available()).toBe(false); expect(reports.cache).toBeUndefined(); await reports.close();
});
