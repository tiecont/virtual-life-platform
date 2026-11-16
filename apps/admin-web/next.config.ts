import type {NextConfig} from 'next';
import {resolve} from 'node:path';
const standalone=process.env.VLP_ADMIN_STANDALONE==='1';
const privateHeaders=[{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}];
const config:NextConfig={output:standalone?'standalone':undefined,outputFileTracingRoot:standalone?resolve(__dirname,'../..'):undefined,poweredByHeader:false,devIndicators:false,transpilePackages:['@virtual-city/contracts','@virtual-city/ui'],webpack(config,{dev}){
 // Route denial cannot protect publicly served lazy chunks. Exclude draft scene
 // geometry and Three.js from every production compilation.
 if(!dev)config.resolve.alias['./pet-scene$']=resolve(__dirname,'features/prelaunch/modules/product/presentation/pet-scene-disabled.ts');
 return config;
},async headers(){return [
 {source:'/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), display-capture=()'}]},
 {source:'/admin/:path*',headers:privateHeaders},
 {source:'/api/:path*',headers:privateHeaders},
 // Private confirmation and withdrawal pages must never become indexable later.
 {source:'/preregister/:path*',headers:privateHeaders},
 {source:'/unsubscribe',headers:privateHeaders},
 ];}};
export default config;
