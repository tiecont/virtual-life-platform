import type { NextConfig } from 'next';
import {resolve} from 'node:path';
const standalone = process.env.AETHERIA_WEB_STANDALONE === '1';
const config: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  output: standalone ? 'standalone' : undefined,
  outputFileTracingRoot: standalone ? resolve(__dirname, '../..') : undefined,
  poweredByHeader: false, transpilePackages: ['@aetheria/game-client', '@aetheria/client-sdk', '@aetheria/scene3d', '@aetheria/contracts', '@aetheria/world-sdk', '@aetheria/pixi-scene', '@aetheria/focus-ui'],
  async headers() { return [{source:'/:path*',headers:[{key:'Content-Security-Policy',value:"media-src 'none'; frame-src 'none'; object-src 'none'"},{key:'Permissions-Policy',value:'camera=(), microphone=(), display-capture=()'}]},{source:'/private/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]},{ source: '/assets/avatars/:revision/starter-v1.svg', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }]; },
};
export default config;
