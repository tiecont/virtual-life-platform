import { randomBytes } from 'node:crypto';
const TOOL_KEYS=['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','TMP','TEMP','LANG','LC_ALL','TERM','COLORTERM','FORCE_COLOR','NO_COLOR','CI','GITHUB_ACTIONS','GITHUB_WORKSPACE','PNPM_HOME','XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_RUNTIME_DIR','DOCKER_CONFIG','DOCKER_CONTEXT','DOCKER_HOST','PLAYWRIGHT_BROWSERS_PATH','PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD','PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH','npm_execpath','npm_node_execpath','npm_config_user_agent','INIT_CWD'];
export function toolEnvironment(parent){return Object.fromEntries(TOOL_KEYS.filter(key=>typeof parent[key]==='string').map(key=>[key,parent[key]]));}
export function validateTestDatabaseURL(raw){
 let url;try{url=new URL(raw);}catch{throw Error('Refusing invalid test database target');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_[a-z0-9]+)*$/.test(url.pathname.slice(1))||url.pathname.length>64||url.search||url.hash)throw Error('Refusing nonlocal or non-test database target');
 return url.toString();
}
export function testEnvironment(parent,databaseUrl,project){
 const env={...toolEnvironment(parent),NODE_ENV:'test',TZ:'UTC',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:validateTestDatabaseURL(databaseUrl),TEST_DATABASE_URL:validateTestDatabaseURL(databaseUrl),CITY_TEST_DB_PROJECT:project,SESSION_SECRET:randomBytes(48).toString('base64url'),SESSION_TTL_SECONDS:'2592000',SAFETY_EVIDENCE_KEY:randomBytes(32).toString('hex'),SAFETY_EVIDENCE_KEY_ID:'synthetic-harness',DATING_PROFILE_KEY:randomBytes(32).toString('hex'),DATING_PROFILE_KEY_ID:'synthetic-harness',OPERATOR_TELEMETRY_TOKEN:'',HOST:'127.0.0.1',PORT:'4300',WEB_ORIGIN:'http://127.0.0.1:3300',PUBLIC_SOCKET_ORIGIN:'http://127.0.0.1:4300',API_INTERNAL_URL:'http://127.0.0.1:4300',LOCAL_LIBRARY_WORLD:'0',LOCAL_PARK_WORLD:'0',LOCAL_RESTAURANT_WORLD:'0',LOCAL_LOUNGE_WORLD:'0',LOCAL_DATING_PROTOTYPE:'0',LOCAL_TRAVEL_FIXTURES:'0',DATING_TEST_PROOFS:'0'};
 for(const key of ['BROWSER_PARK_WORLD','BROWSER_LIBRARY_WORLD','BROWSER_RESTAURANT_WORLD','BROWSER_LOUNGE_WORLD','BROWSER_DATING_PROFILE']){if(parent[key]!==undefined&&!['0','1'].includes(parent[key]))throw Error('Invalid test fixture toggle');env[key]=parent[key]??'0';}
 if(parent.ROOM_LOAD_SOCKETS!==undefined){if(!/^(?:[2-9]|1[0-9]|2[0-4])$/.test(parent.ROOM_LOAD_SOCKETS))throw Error('Invalid local room baseline size');env.ROOM_LOAD_SOCKETS=parent.ROOM_LOAD_SOCKETS;}
 if(parent.BROWSER_REPORT_SCOPE!==undefined){if(!/^ci\/[a-z][a-z0-9-]{0,39}\/[a-z][a-z0-9-]{0,79}$/.test(parent.BROWSER_REPORT_SCOPE))throw Error('Invalid test report scope');env.BROWSER_REPORT_SCOPE=parent.BROWSER_REPORT_SCOPE;}
 if(parent.PLAYWRIGHT_HTML_OUTPUT_DIR!==undefined){if(!/^playwright-report\/[a-z0-9/-]+$/.test(parent.PLAYWRIGHT_HTML_OUTPUT_DIR)||parent.PLAYWRIGHT_HTML_OUTPUT_DIR.includes('//'))throw Error('Invalid test report directory');env.PLAYWRIGHT_HTML_OUTPUT_DIR=parent.PLAYWRIGHT_HTML_OUTPUT_DIR;}
 return env;
}
