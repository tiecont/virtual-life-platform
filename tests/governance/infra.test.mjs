import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyStackEnv } from '../../scripts/verify-infra.mjs';

test('stack env requires HTTPS,explicit peer,isolated names and URL-safe secrets without echoing secret values',()=>{
 const env={CITY_STACK_NAME:'virtual-city-test',CITY_APP_IMAGE:'virtual-life-platform:test',CITY_NETWORK_SUBNET:'172.29.73.0/24',CITY_DYNAMIC_RANGE:'172.29.73.128/25',CITY_PROXY_IP:'172.29.73.2',CITY_TLS_PORT:'8443',WEB_ORIGIN:'https://localhost:8443',CITY_TLS_CERT_FILE:'/private/cert.pem',CITY_TLS_KEY_FILE:'/private/key.pem',POSTGRES_USER:'city_test',POSTGRES_DB:'city_test',POSTGRES_PASSWORD:'synthetic-only-password-for-env-test',SESSION_SECRET:'synthetic-only-session-secret-for-env-test'};
 assert.equal(verifyStackEnv(env).publicRelease,false);
 for(const override of [{WEB_ORIGIN:'http://localhost:8443'},{WEB_ORIGIN:'https://localhost:8443/path'},{CITY_PROXY_IP:'198.51.100.1'},{CITY_PROXY_IP:'172.29.73.129'},{CITY_DYNAMIC_RANGE:'172.29.73.0/25'},{CITY_NETWORK_SUBNET:'0.0.0.0/0'},{CITY_TLS_PORT:'443'},{POSTGRES_PASSWORD:'not/url/safe'},{CITY_APP_IMAGE:'virtual-life-platform:latest'},{SESSION_SECRET:''}])assert.throws(()=>verifyStackEnv({...env,...override}));
 assert(!JSON.stringify(verifyStackEnv(env)).includes(env.SESSION_SECRET));assert(!JSON.stringify(verifyStackEnv(env)).includes(env.POSTGRES_PASSWORD));
});
