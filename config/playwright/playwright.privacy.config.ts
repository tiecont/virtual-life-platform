import {defineConfig,devices} from '@playwright/test';
import {resolve} from 'node:path';
const repositoryRoot=resolve(__dirname,'../..');
export default defineConfig({testDir:resolve(repositoryRoot,'tests/e2e'),testMatch:'privacy.spec.ts',workers:1,retries:0,reporter:[['list'],['html',{open:'never',outputFolder:resolve(repositoryRoot,'playwright-report')}]],use:{baseURL:'http://127.0.0.1:3300',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 5'],viewport:{width:360,height:800},defaultBrowserType:'chromium'}}],webServer:[
 {command:'node --import tsx tests/support/admin-browser-runtime.ts',cwd:repositoryRoot,url:'http://127.0.0.1:4300/health/ready',reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:15000}},
 {command:'pnpm --filter @aetheria/portal-web start',cwd:repositoryRoot,url:'http://127.0.0.1:3300',env:{API_INTERNAL_URL:'http://127.0.0.1:4300',PUBLIC_SOCKET_ORIGIN:'http://127.0.0.1:3300'},reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:10000}},
 {command:'pnpm --filter @aetheria/admin-web dev',cwd:repositoryRoot,url:'http://127.0.0.1:3400/admin',env:{NODE_ENV:'development',ADMIN_ORIGIN:'http://127.0.0.1:3400',ADMIN_API_ORIGIN:'http://127.0.0.1:4300',ADMIN_METRICS_READ_TOKEN:'e'.repeat(64)},reuseExistingServer:false,timeout:60000,gracefulShutdown:{signal:'SIGTERM',timeout:10000}},
]});
