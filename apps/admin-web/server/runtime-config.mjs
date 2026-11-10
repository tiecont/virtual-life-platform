// Shared by the BFF and the image entrypoint. Never serialize this object.
export function adminConfig(env) {
  try {
    const origin = new URL(env.ADMIN_ORIGIN ?? ''), api = new URL(env.ADMIN_API_ORIGIN ?? ''), production = env.NODE_ENV === 'production';
    if (origin.origin !== env.ADMIN_ORIGIN || api.origin !== env.ADMIN_API_ORIGIN ||
      ![origin, api].every(url => ['http:', 'https:'].includes(url.protocol)) ||
      production && origin.protocol !== 'https:' ||
      env.ADMIN_METRICS_READ_TOKEN !== undefined && !/^[a-f0-9]{64}$/.test(env.ADMIN_METRICS_READ_TOKEN)) return;
    return {origin: origin.origin, api: api.origin, production, metricsToken: env.ADMIN_METRICS_READ_TOKEN};
  } catch {return;}
}
