import type { NextConfig } from 'next';
const api = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4300');
if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.pathname !== '/') throw new Error('API_INTERNAL_URL must be a trusted HTTP origin');
const config: NextConfig = {
  poweredByHeader: false, transpilePackages: ['@virtual-city/contracts'],
  async rewrites() { return [{ source: '/v1/:path*', destination: `${api.origin}/v1/:path*` }]; },
};
export default config;
