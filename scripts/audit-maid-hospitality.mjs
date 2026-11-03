import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const root = process.argv[2] ?? '../maid-cafe';
const paths = ['apps/api/src/db/schema.ts', 'apps/api/src/db/migrations/0001_foundation.sql', 'apps/api/src/db/catalog.ts', 'apps/api/src/db/seeding.ts', 'apps/api/src/app.ts', 'apps/api/src/main.ts', 'packages/contracts/src/index.ts', 'packages/contracts/test/unit/contracts.test.ts', 'apps/api/test/integration/foundation.test.ts', 'apps/web/src/app/page.tsx'];
const source = path => readFileSync(root + '/' + path, 'utf8');
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const parse = path => ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true);
const contracts = parse('packages/contracts/src/index.ts'), app = parse('apps/api/src/app.ts');
let states = [], commands = []; const routes = [];
function visitContracts(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (node.name.text === 'OrderStateSchema' && ts.isCallExpression(node.initializer) && ts.isArrayLiteralExpression(node.initializer.arguments[0])) states = node.initializer.arguments[0].elements.map(item => item.text);
    if (node.name.text === 'commandSchemas' && ts.isAsExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.expression)) commands = node.initializer.expression.properties.map(item => item.name.text);
  }
  ts.forEachChild(node, visitContracts);
}
function visitApp(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['get', 'post', 'patch', 'put', 'delete'].includes(node.expression.name.text) && ts.isStringLiteral(node.arguments[0])) routes.push({ method: node.expression.name.text.toUpperCase(), path: node.arguments[0].text });
  ts.forEachChild(node, visitApp);
}
visitContracts(contracts); visitApp(app);
const sql = source('apps/api/src/db/migrations/0001_foundation.sql'), tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map(match => match[1]);
function files(dir) { return readdirSync(root + '/' + dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(dir + '/' + item.name) : [dir + '/' + item.name]).sort(); }
const report = {
  taskID: 'M11-01', auditedAt: new Date().toISOString(), cityBase: git(['rev-parse', 'HEAD']), command: 'node scripts/audit-maid-hospitality.mjs ' + root, exitCode: 0,
  legacy: { path: root, branch: git(['-C', root, 'branch', '--show-current']), head: git(['-C', root, 'rev-parse', 'HEAD']), status: git(['-C', root, 'status', '--short']).split('\n').filter(Boolean), sources: paths.map(path => ({ path, sha256: createHash('sha256').update(source(path)).digest('hex') })), tables, states, serviceCommands: commands.filter(name => /^(order\.|maid\.shift\.|minigame\.)/.test(name)), routes, apiSourceFiles: files('apps/api/src'), webPageFiles: files('apps/web/src/app').filter(path => /page\.tsx$/.test(path)) },
  scope: 'Readonly current source/SQL/AST inventory plus manual reference comparison; no legacy server/database/test/process/mutation/secret access or copied implementation. Contracts/menu seeds do not prove live order/shift functionality.',
};
const artifact = 'docs/agent/evidence/m11-hospitality-audit.json'; writeFileSync(artifact, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ artifact, head: report.legacy.head, sources: paths.length, states, serviceCommands: report.legacy.serviceCommands, routes, tables }));
