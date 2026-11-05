import {evidenceOutput} from './evidence-output.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = process.argv[2] ?? '../deadline-cafe';
const paths = ['apps/api/src/db/schema.ts', 'apps/api/drizzle/0000_hot_slyde.sql', 'apps/api/src/http.ts', 'apps/api/src/app.ts', 'packages/contracts/src/index.ts', 'apps/web/src/components/FocusPanel.tsx', 'apps/web/src/features/time.ts', 'apps/web/app/stats/page.tsx'];
const source = path => readFileSync(root + '/' + path, 'utf8');
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sql = source('apps/api/drizzle/0000_hot_slyde.sql');
const report = {
  taskID: 'M10-01', auditedAt: new Date().toISOString(), cityBase: git(['rev-parse', 'HEAD']),
  command: 'node scripts/audit-deadline-focus.mjs ' + root, exitCode: 0,
  legacy: {
    path: root, branch: git(['-C', root, 'branch', '--show-current']), head: git(['-C', root, 'rev-parse', 'HEAD']), status: git(['-C', root, 'status', '--short']).split('\n').filter(Boolean),
    sources: paths.map(path => ({ path, sha256: createHash('sha256').update(source(path)).digest('hex') })),
    moduleFiles: readdirSync(root + '/apps/api/src/modules').sort(),
    focusHttpDeclarations: (source('apps/api/src/http.ts').match(/api\.(?:get|post|patch|delete)\([^\n]*focus/gi) ?? []).length,
    focusWireLines: source('packages/contracts/src/index.ts').split('\n').filter(line => /focus|pomodoro|timer/i.test(line)).length,
    focusStartButtonDisabled: /button[^>]*disabled/.test(source('apps/web/src/components/FocusPanel.tsx')),
    sql: { timestampWithTimeZone: sql.includes('timestamp with time zone'), activeUniqueIndex: sql.includes('focus_one_active_guest'), idempotencyUniqueIndex: sql.includes('focus_guest_idempotency'), allowedDurationConstraint: sql.includes('in (900,1500,3000)') },
  },
  scope: 'Readonly source/SQL inspection; no legacy process/database/network/mutation/secret read, no runtime focus behavior claimed. Pattern counts support manual audit, not a security certificate.',
};
const artifact = evidenceOutput('docs/agent/evidence/m10-focus-audit.json');
writeFileSync(artifact, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ artifact, head: report.legacy.head, sourceCount: paths.length, focusHttpDeclarations: report.legacy.focusHttpDeclarations, focusWireLines: report.legacy.focusWireLines, buttonDisabled: report.legacy.focusStartButtonDisabled, sql: report.legacy.sql }));
