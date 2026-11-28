import base from './playwright.config';
import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
const repositoryRoot=resolve(__dirname,'../..');
export default defineConfig({...base,webServer:[{command:'node --import tsx tests/support/lodge-browser-runtime.ts',cwd:repositoryRoot,url:'http://127.0.0.1:4300/health/ready',reuseExistingServer:false,timeout:60000},{command:'pnpm --filter @aetheria/portal-web start',cwd:repositoryRoot,env:{LOCAL_LANTERN_LODGE_WORLD:'1',LOCAL_GAME_LOBBY:'1'},url:'http://127.0.0.1:3300',reuseExistingServer:false,timeout:60000}]});
