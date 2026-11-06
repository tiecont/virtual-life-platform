import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
export function adminClientImports(code){
 const source=ts.createSourceFile('client.tsx',code,ts.ScriptTarget.Latest,true),imports=[];
 function visit(node){
  if(ts.isIdentifier(node)&&node.text==='process')throw Error('Admin client cannot read process environment');
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))throw Error('Admin client imports must be static');
  ts.forEachChild(node,visit);
 }visit(source);
 for(const specifier of imports)assert(specifier.startsWith('.')||['react','next/link','next/navigation','@virtual-city/contracts'].includes(specifier),'Admin client dependency not allowlisted');return imports;
}
export async function checkAdminBoundary(root=process.cwd()){
 const base=resolve(root,'apps/admin-web'),files=new Map();
 async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(['node_modules','.next','dist'].includes(entry.name)||entry.name.startsWith('.next'))continue;const path=resolve(folder,entry.name);if(entry.isDirectory())await walk(path);else if(/\.[cm]?[jt]sx?$/.test(entry.name)&&!entry.name.endsWith('.d.ts'))files.set(path,await readFile(path,'utf8'));}}
 await walk(base);const roots=[...files].filter(([,code])=>/^\s*['"]use client['"]/.test(code)).map(([path])=>path),visited=new Set();assert(roots.length>0);
 function visit(path){if(visited.has(path))return;assert(path.startsWith(base+'/app/')&&!path.startsWith(base+'/app/api/'),'Admin client reached server implementation');visited.add(path);
  for(const specifier of adminClientImports(files.get(path))){if(!specifier.startsWith('.'))continue;const target=resolve(dirname(path),specifier);if(target.endsWith('.css'))continue;const found=[target,...['.ts','.tsx','.js','/index.ts','/index.tsx'].map(ext=>target+ext)].find(value=>files.has(value));assert(found,'Admin client import unresolved');visit(found);}
 }roots.forEach(visit);return {clientRoots:roots.length,clientFiles:visited.size,scope:'Static first-party client graph, not a sandbox or substitute for actual bundle inspection'};
}
