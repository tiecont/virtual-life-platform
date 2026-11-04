export function requestLog(req: { method: string; url: string }) {
  if(/^\/v1\/dating(?:\/|\?|$)/.test(req.url))return {method:req.method,path:'/v1/[private]'};
  const path = req.url.split('?')[0].replace(/^(\/v1\/(?:stage\/slots|reservations\/(?:waitlist|dinner-invitations)|reservations|staff\/shifts|event-invitations|events|orders|focus|invitation-groups|invitations|travel-intents|reports|moderation\/(?:cases|sanctions|appeals)|me\/sanctions))\/[^/]+/, '$1/[redacted]');
  return { method: req.method, path };
}
