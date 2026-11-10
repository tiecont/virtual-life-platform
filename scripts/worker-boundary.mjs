import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const allowed = new Set(['pg', 'zod', '@virtual-city/contracts', 'node:crypto', 'node:fs/promises', 'node:path']);
export async function checkWorkerBoundary(root = process.cwd()) {
  const base = resolve(root, 'apps/platform-api/src'), files = new Set(), externals = new Set();
  async function visit(file) {
    const name = relative(base, file).replaceAll('\\', '/');
    assert(!name.startsWith('..') && !/^(?:app|main)\.ts$|^features\/rooms\/|^features\/identity\/modules\/accounts\/(?:application\/service|presentation\/(?:socket|http))\.ts$/.test(name), 'Worker imports API/room/session runtime');
    if (files.has(file)) return; files.add(file);
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true), dependencies = [];
    assert.equal(source.parseDiagnostics.length, 0);
    function walk(node) {
      if (ts.isImportDeclaration(node)) {
        if (node.importClause?.isTypeOnly || node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every(item => item.isTypeOnly)) return;
        assert(ts.isStringLiteral(node.moduleSpecifier)); dependencies.push(node.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {assert(ts.isStringLiteral(node.moduleSpecifier)); dependencies.push(node.moduleSpecifier.text);}
      if (ts.isCallExpression(node)) assert(!['require', 'eval', 'Function', 'migrate', 'createApp'].includes(node.expression.getText(source)) && node.expression.kind !== ts.SyntaxKind.ImportKeyword, 'Worker dynamically loads or bootstraps forbidden runtime');
      if (ts.isNewExpression(node)) assert(!['Function', 'RoomAuthority', 'RoomService', 'Server'].includes(node.expression.getText(source)), 'Worker constructs forbidden runtime');
      ts.forEachChild(node, walk);
    }
    walk(source);
    for (const dependency of dependencies) {
      if (dependency.startsWith('.')) await visit(resolve(dirname(file), dependency + '.ts'));
      else {assert(allowed.has(dependency), 'Unexpected worker runtime dependency'); externals.add(dependency);}
    }
  }
  await visit(resolve(base, 'worker.ts'));
  return {result: 'PASS', scope: 'Static runtime import graph; type imports erased, installed dependency internals trusted', files: [...files].map(file => relative(root, file)).sort(), externals: [...externals].sort()};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await checkWorkerBoundary(), null, 2));
