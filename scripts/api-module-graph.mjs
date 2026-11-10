import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {apiModulePolicy,apiModuleOwner,assertApiModuleImport,assertWorldPersistenceImport} from './api-module-policy.mjs';
export async function inspectApiModules(root=process.cwd()){
 const base=resolve(root,'apps/platform-api/src'),files=[];
 async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=resolve(folder,entry.name);if(entry.isDirectory())await walk(file);else if(file.endsWith('.ts')&&!file.endsWith('.test.ts')&&!file.endsWith('.d.ts'))files.push(file);}}
 await walk(base);const imports=[],exports=[],constructors=[],compositionCalls=[],owners=Object.create(null);
 for(const file of files.sort()){
  const from=relative(root,file).split('\\').join('/'),owner=apiModuleOwner(from);owners[owner]=(owners[owner]??0)+1;
  const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);assert.equal(source.parseDiagnostics.length,0,'API source parse error');
  function visit(node){
   const line=source.getLineAndCharacterOfPosition(node.getStart()).line+1;
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
    const specifier=node.moduleSpecifier.text,target=specifier.startsWith('.')?relative(root,resolve(dirname(file),specifier)).split('\\').join('/'):specifier;
    assertApiModuleImport(from,target);assertWorldPersistenceImport(from,specifier,target);
    const named=node.importClause?.namedBindings;
    imports.push({from,owner,specifier,target,typeOnly:node.importClause?.isTypeOnly??false,bindings:named&&ts.isNamedImports(named)?named.elements.map(part=>({name:part.name.text,typeOnly:part.isTypeOnly})):[],line});
   }
   if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&node.name)exports.push({from,owner,name:node.name.getText(source),kind:ts.SyntaxKind[node.kind],line});
   if(owner==='composition'&&ts.isNewExpression(node))constructors.push({from,expression:node.expression.getText(source),line});
   if(owner==='composition'&&ts.isCallExpression(node))compositionCalls.push({from,expression:node.expression.getText(source),line});
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
 const ownership=JSON.parse(await readFile(resolve(root,'config/architecture/ownership.json'),'utf8'));
 assert.equal(ownership.journalTable,apiModulePolicy.database.journal);assert.equal(ownership.apiReplicas,apiModulePolicy.database.apiReplicas);
 for(const owner of Object.values(ownership.tables))assert(Object.hasOwn(apiModulePolicy.tableOwnerModules,owner)&&Object.hasOwn(apiModulePolicy.modules,apiModulePolicy.tableOwnerModules[owner]),'SQL owner without API module: '+owner);
 const edges=new Map();for(const row of imports){const to=row.target.startsWith('apps/platform-api/src/')?apiModuleOwner(row.target):null;if(!to||to===row.owner)continue;const key=row.owner+' → '+to;edges.set(key,(edges.get(key)??0)+1);}
 return {scope:'Static current API imports/exports and composition call sites; not a dynamic runtime call graph',productionFiles:files.length,owners,importCount:imports.length,exportCount:exports.length,crossModuleEdges:[...edges].map(([edge,references])=>({edge,references})).sort((a,b)=>a.edge.localeCompare(b.edge)),imports,exports,constructors,compositionCalls,sqlTablesAndJournal:Object.keys(ownership.tables).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await inspectApiModules();console.log(JSON.stringify(result,null,2));}
