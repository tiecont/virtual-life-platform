export function internalApiOrigin(value = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4300'): URL {
  try {
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) throw Error();
    return origin;
  } catch { throw Error('API_INTERNAL_URL must be a trusted HTTP origin'); }
}

export function apiRewrite(pathname: string, search: string): URL {
  if (pathname !== '/v1' && !pathname.startsWith('/v1/')) throw Error('Only platform API routes may be rewritten');
  const destination = internalApiOrigin();
  destination.pathname = pathname;
  destination.search = search;
  return destination;
}
