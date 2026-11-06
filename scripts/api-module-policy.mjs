import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const apiModulePolicy=JSON.parse(readFileSync(new URL('../docs/architecture/api-modules.json',import.meta.url),'utf8'));
assert.equal(apiModulePolicy.schemaVersion,1,'Unknown API module policy');
const base='apps/platform-api/src/';
export function apiModuleOwner(file){
 if(!file.startsWith(base))return null;
 const name=file.slice(base.length).replace(/\.(?:[cm]?[jt]sx?)$/,'');
 const owner=['app','main','worker'].includes(name)?'composition':name.split('/')[0];
 assert(Object.hasOwn(apiModulePolicy.modules,owner),'Unowned API source area: '+name);return owner;
}
export function assertApiModuleImport(from,target){
 const owner=apiModuleOwner(from);if(!owner||!target.startsWith(base))return;
 const destination=apiModuleOwner(target);if(owner===destination)return;
 assert(destination!=='composition','Module imports API composition root: '+from);
 assert(destination!=='db'||owner==='composition','Domain imports migration/schema internals: '+from);
 assert(!['common','config','db'].includes(owner)||['common','config','db'].includes(destination),'Foundation imports domain implementation: '+from);
 const entry=target.slice(base.length).replace(/\.(?:[cm]?[jt]sx?)$/,'');
 assert(apiModulePolicy.modules[destination].currentPublicEntryFiles.includes(entry),'API module private import: '+from+' → '+entry);
}
export function assertWorldPersistenceImport(from,specifier,target){
 const world=from.startsWith('worlds/')||apiModulePolicy.worldPackages.some(name=>from.startsWith('packages/'+name+'/'));
 if(!world)return;
 assert(!/^(?:pg|postgres|drizzle-orm|mysql2|better-sqlite3|node:sqlite)(?:\/|$)/.test(specifier)&&! /\.sql(?:[?#]|$)/.test(target),'World imports persistence implementation: '+from);
}
