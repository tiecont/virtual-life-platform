export function requestLog(req: { method: string; url: string }) {
  const path = req.url.split('?')[0].replace(/^(\/v1\/(?:reservations\/(?:waitlist|dinner-invitations)|reservations|staff\/shifts|event-invitations|events|orders|focus|invitation-groups|invitations|travel-intents|reports|moderation\/(?:cases|sanctions|appeals)|me\/sanctions))\/[^/]+/, '$1/[redacted]');
  return { method: req.method, path };
}
