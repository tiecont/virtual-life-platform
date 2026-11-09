import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserReportDirectory} from '../../scripts/browser-report-directory.mjs';

test('unscoped HTML reports use fresh child directories;root/traversal/absolute output cannot erase archived runs',()=>{
 const first=browserReportDirectory(),second=browserReportDirectory();assert.notEqual(first,second);
 for(const path of [first,second])assert.match(path,/^playwright-report\/local\/run-[a-f0-9-]{36}$/);
 for(const path of ['playwright-report/ci/rendering/scene-performance','playwright-report/ci/legacy/deadline/desktop'])assert.equal(browserReportDirectory(path),path);
 for(const path of ['playwright-report','playwright-report/','./playwright-report','/tmp/reports','playwright-report/../evidence','playwright-report//ci','playwright-report/ci/..','',null])assert.throws(()=>browserReportDirectory(path));
});
