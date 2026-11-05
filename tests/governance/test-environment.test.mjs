import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testEnvironment,validateTestDatabaseURL } from '../../scripts/test-environment.mjs';
const url='postgresql://virtual_city_test:synthetic@127.0.0.1:5432/virtual_city_test';
test('database target rejects remote/non-test/scheme/query overrides without echoing credentials',()=>{
 assert.equal(validateTestDatabaseURL(url),url);assert.doesNotThrow(()=>validateTestDatabaseURL('postgresql://test:synthetic@[::1]/virtual_city_test_job1'));
 for(const value of [url+'?host=elsewhere',url+'?options=-csearch_path=public',url+'#fragment',url.replace('127.0.0.1','example.invalid'),url.replace(/virtual_city_test$/,'real_database'),url.replace('postgresql:','http:'),'private-secret-invalid-url'])assert.throws(()=>validateTestDatabaseURL(value),error=>!error.message.includes('synthetic')&&!error.message.includes('private-secret'));
});
test('fixture environment uses independent keys and excludes inherited runtime,PG and preload state',()=>{
 const parent={PATH:'/synthetic/tools',HOME:'/synthetic/home',SESSION_SECRET:'private-parent-marker',SAFETY_EVIDENCE_KEY:'private-parent-marker',DATING_PROFILE_KEY:'private-parent-marker',OPERATOR_TELEMETRY_TOKEN:'private-parent-marker',PGHOST:'elsewhere',PGOPTIONS:'private-parent-marker',NODE_OPTIONS:'private-parent-marker',WORLD_FLAGS_FILE:'private-parent-marker',UNEXPECTED_PRIVATE_VALUE:'private-parent-marker',NODE_ENV:'production',TZ:'Asia/Ho_Chi_Minh'},a=testEnvironment(parent,url,'synthetic'),b=testEnvironment(parent,url,'synthetic');
 assert(a.SESSION_SECRET!==b.SESSION_SECRET&&a.SAFETY_EVIDENCE_KEY!==b.SAFETY_EVIDENCE_KEY&&a.DATING_PROFILE_KEY!==b.DATING_PROFILE_KEY);assert(!JSON.stringify(a).includes('private-parent-marker'));assert.equal(a.NODE_ENV,'test');assert.equal(a.TZ,'UTC');assert.equal(a.PATH,parent.PATH);assert.equal(a.OPERATOR_TELEMETRY_TOKEN,'');assert.equal(a.LOCAL_DATING_PROTOTYPE,'0');assert.equal(parent.NODE_ENV,'production');
});
test('only explicit finite test fixtures/report scopes survive environment filtering',()=>{
 const a=testEnvironment({BROWSER_DATING_PROFILE:'1',BROWSER_REPORT_SCOPE:'ci/private/dating-profile',PLAYWRIGHT_HTML_OUTPUT_DIR:'playwright-report/ci/private/dating-profile/desktop',ROOM_LOAD_SOCKETS:'24'},url,'synthetic');assert.equal(a.BROWSER_DATING_PROFILE,'1');assert.equal(a.ROOM_LOAD_SOCKETS,'24');
 for(const parent of [{BROWSER_DATING_PROFILE:'unreviewed'},{BROWSER_REPORT_SCOPE:'../../private'},{PLAYWRIGHT_HTML_OUTPUT_DIR:'/private/report'},{ROOM_LOAD_SOCKETS:'1000'}])assert.throws(()=>testEnvironment(parent,url,'synthetic'));
});
