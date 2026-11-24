const apiPath = /^\/(?:v1|socket\.io)(?:\/|$)/;
const headersFromEdge = ['cf-access-jwt-assertion', 'cf-access-client-id', 'cf-access-client-secret'];

function error(message, status) {
  return new Response(message, {status, headers: {'cache-control': 'no-store'}});
}

export default {
  async fetch(request, env, context) {
    if (!context.access) return error('Access required', 403);
    if (env.SITE !== 'portal' && env.SITE !== 'admin') return error('Private origin unavailable', 503);
    const url = new URL(request.url);
    const service = env.SITE === 'portal' && apiPath.test(url.pathname) ? env.API : env.FRONTEND;
    if (!service) return error('Private origin unavailable', 503);

    const headers = new Headers(request.headers);
    for (const name of headersFromEdge) headers.delete(name);
    const applicationCookies = (headers.get('cookie') ?? '').split(';')
      .map(cookie => cookie.trim()).filter(cookie => cookie && !cookie.startsWith('CF_Authorization='));
    if (applicationCookies.length) headers.set('cookie', applicationCookies.join('; '));
    else headers.delete('cookie');
    headers.delete('forwarded');
    headers.delete('x-forwarded-for');
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', url.host);

    const origin = new URL(url);
    origin.protocol = 'http:';
    try {
      return await service.fetch(new Request(origin, {
        method: request.method, headers, body: request.body, duplex: 'half', redirect: 'manual',
      }));
    } catch {
      return error('Private origin unavailable', 502);
    }
  },
};
