import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,webServer:[{command:'node --import tsx tests/support/lodge-browser-runtime.ts',url:'http://127.0.0.1:4300/health/ready',reuseExistingServer:false,timeout:60000},{command:'pnpm --filter @virtual-city/portal-web start',env:{LOCAL_LANTERN_LODGE_WORLD:'1',LOCAL_GAME_LOBBY:'1'},url:'http://127.0.0.1:3300',reuseExistingServer:false,timeout:60000}]});
