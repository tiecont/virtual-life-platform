import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { loadSafetyPolicy } from './runtime';
import { ChatService } from './chat';
import type { RoomService } from '../rooms/service';
import type { IdentityService } from '../identity/service';

it('loads validated server-owned defaults, rejects unsafe config and cannot activate production via local override', async () => {
  const policy = await loadSafetyPolicy(); expect(policy.defaults.chatEnabled).toBe(false);
  await expect(loadSafetyPolicy({ ...policy, defaults: { ...policy.defaults, reporterIdentityPublic: true } })).rejects.toThrow('Safety policy configuration unavailable');
  const neverUsedRoom = {} as RoomService; const neverUsedIdentity = {} as IdentityService;
  const chat = new ChatService(neverUsedRoom, neverUsedIdentity, 'production', { enabled: true, policy });
  expect(chat.diagnostics().enabled).toBe(false);
  await expect(chat.send('not-a-credential', 'not-a-connection', { schemaVersion: 1, requestId: randomUUID(), epoch: randomUUID(), roomId: randomUUID(), membershipId: randomUUID(), content: { kind: 'canned', id: 'hello' } }, () => { throw new Error('must never emit'); })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  chat.close();
});
