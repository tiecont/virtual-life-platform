export function requestLog(req: { method: string; url: string }) {
  const path = req.url.split('?')[0].replace(/^(\/v1\/(?:reports|moderation\/(?:cases|sanctions|appeals)|me\/sanctions))\/[^/]+/, '$1/[redacted]');
  return { method: req.method, path };
}
