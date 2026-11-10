import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,dirname,sep} from 'node:path';
import ts from 'typescript';
const forbidden=new Set(['Date','performance','fetch','WebSocket','XMLHttpRequest','setTimeout','setInterval','queueMicrotask','requestAnimationFrame','process','Buffer','require','eval','Function','global','globalThis','window','document','navigator','localStorage','sessionStorage','crypto','console','module','exports']);
export function assertPureGameSource(code,file='packages/boardgame-core/src/core.ts'){
 const tree=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);
 function visit(node){
  assert(!ts.isImportEqualsDeclaration(node),'CommonJS import escape in pure source');
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)&&node.moduleSpecifier){const specifier=node.moduleSpecifier;assert(ts.isStringLiteralLike(specifier));const name=specifier.text;
   if(name==='@virtual-city/contracts'){
    const clause=ts.isImportDeclaration(node)?node.importClause:node.exportClause;
    assert(clause&&!clause.name,'Pure source uses named data imports only');const bindings=ts.isImportDeclaration(node)?clause.namedBindings:clause;assert(bindings&&(ts.isNamedImports(bindings)||ts.isNamedExports(bindings)),'Contract namespace/barrel escape in pure source');
    for(const element of bindings.elements)if(!node.isTypeOnly&&!clause.isTypeOnly&&!element.isTypeOnly)assert(/^Game[A-Za-z]+Schema$/.test((element.propertyName??element.name).text),'Only reviewed game data schemas may be imported as values');
   }else{assert(/^\.\.?\/[a-z0-9/-]+$/.test(name),'Pure game import outside reviewed data closure');const target=resolve(dirname(file),name);assert(target.startsWith(resolve('packages/boardgame-core/src')+sep),'Pure source import escapes its closure');}
  }
  if(ts.isIdentifier(node))assert(!forbidden.has(node.text),'System I/O/clock/global in pure game source: '+node.text);
  if(ts.isIdentifier(node)&&node.text==='Math'){const parent=node.parent;assert(ts.isPropertyAccessExpression(parent)&&parent.expression===node&&parent.name.text!=='random'||ts.isElementAccessExpression(parent)&&parent.expression===node&&ts.isStringLiteralLike(parent.argumentExpression)&&parent.argumentExpression.text!=='random','Aliased/destructured system RNG in pure game source');}
  if(ts.isPropertyAccessExpression(node)&&node.expression.getText(tree)==='Math')assert(node.name.text!=='random','System RNG in pure game source');
  if(ts.isElementAccessExpression(node)&&node.expression.getText(tree)==='Math')assert(ts.isStringLiteralLike(node.argumentExpression)&&node.argumentExpression.text!=='random','Computed system RNG in pure game source');
  if(ts.isCallExpression(node))assert(node.expression.kind!==ts.SyntaxKind.ImportKeyword,'Dynamic import in pure game source');
  ts.forEachChild(node,visit);
 }visit(tree);
}
export async function checkBoardgameBoundary(){
 const base='packages/boardgame-core',manifest=JSON.parse(await readFile(base+'/package.json'));assert.deepEqual(manifest.dependencies,{'@virtual-city/contracts':'workspace:*'});let files=0;
 assert.equal(manifest.main,'dist/index.js');assert.deepEqual(manifest.exports,{'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}});
 async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const ref=path+'/'+entry.name;if(entry.isDirectory())await walk(ref);else if(/\.[cm]?[jt]s$/.test(entry.name)){assertPureGameSource(await readFile(ref,'utf8'),ref);files++;}}}await walk(base+'/src');
 return {files,scope:'Static pure core source/import boundary;not authentication,game rules,privacy enforcement or a security sandbox'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await checkBoardgameBoundary()));
