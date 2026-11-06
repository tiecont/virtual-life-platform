import type {NextConfig} from 'next';
const config:NextConfig={poweredByHeader:false,devIndicators:false,transpilePackages:['@virtual-city/contracts','@virtual-city/ui'],async headers(){return [{source:'/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), display-capture=()'}]}];}};
export default config;
