import {defineConfig} from '@playwright/test';
import base from './playwright.admin.config';
export default defineConfig({...base,testMatch:'runtime.spec.ts',webServer:[{command:'node --import tsx tests/support/runtime-browser-runtime.ts',url:'http://127.0.0.1:4300/health/ready',reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:15000}},...(Array.isArray(base.webServer)?base.webServer.slice(1):[])]});
