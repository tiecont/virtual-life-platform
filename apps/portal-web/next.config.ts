import type { NextConfig } from 'next';
const api = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4300');
if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.pathname !== '/') throw new Error('API_INTERNAL_URL must be a trusted HTTP origin');
const config: NextConfig = {
  poweredByHeader: false, transpilePackages: ['@virtual-city/contracts', '@virtual-city/world-sdk', '@virtual-city/pixi-scene', '@virtual-city/focus-ui'],
  async headers() { return [{ source: '/assets/avatars/:revision/starter-v1.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]; },
  async rewrites() { return [{ source: '/v1/:path*', destination: `${api.origin}/v1/:path*` }]; },
};
export default config;
