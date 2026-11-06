import {defineConfig} from 'vite';import {resolve} from 'node:path';
export default defineConfig({base:'./',publicDir:resolve(import.meta.dirname,'../../apps/portal-web/public'),server:{host:'127.0.0.1'},build:{target:'es2022',sourcemap:false}});
