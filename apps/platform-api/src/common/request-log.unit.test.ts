import { it, expect } from 'vitest';
import { requestLog } from './request-log';

it('omits safety object IDs, query filters and request secrets from request logging', () => {
  for (const [url, expected] of [
    ['/v1/reports/private-receipt', '/v1/reports/[redacted]'],
    ['/v1/moderation/cases/private-case/appeals?cursor=private-cursor', '/v1/moderation/cases/[redacted]/appeals'],
    ['/v1/moderation/sanctions/private-sanction/revoke', '/v1/moderation/sanctions/[redacted]/revoke'],
    ['/v1/moderation/appeals/private-appeal/review', '/v1/moderation/appeals/[redacted]/review'],
    ['/v1/travel-intents/private-intent/cancel?capability=private-proof', '/v1/travel-intents/[redacted]/cancel'],
    ['/v1/invitations/private-offer/respond?sender=private-contact', '/v1/invitations/[redacted]/respond'],
    ['/v1/invitation-groups/private-group?recipient=private-contact', '/v1/invitation-groups/[redacted]'],
    ['/v1/focus/private-timer/finish?note=private-note', '/v1/focus/[redacted]/finish'],
    ['/v1/me/sanctions/private-sanction/appeal', '/v1/me/sanctions/[redacted]/appeal'],
    ['/v1/moderation/cases?id=private-case&world=maid', '/v1/moderation/cases'],
    ['/health/ready?unexpected=private-text', '/health/ready'],
  ]) {
    const result = requestLog({ method: 'POST', url, headers: { cookie: 'private-cookie' }, body: { note: 'private-note' } } as Parameters<typeof requestLog>[0]);
    expect(result).toEqual({ method: 'POST', path: expected });
    expect(JSON.stringify(result)).not.toMatch(/private-/);
  }
});
