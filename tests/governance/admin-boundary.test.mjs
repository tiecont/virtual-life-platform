import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminClientImports,checkAdminBoundary} from '../../scripts/admin-boundary.mjs';
test('admin client rejects environment reads, dynamic imports and server dependencies',()=>{
 for(const code of ["const key=process.env.ADMIN_METRICS_READ_TOKEN;","import x from 'node:fs';","import x from 'pg';","import x from 'next/headers';","import('./server');","require('node:fs');"])assert.throws(()=>adminClientImports(code));
 assert.deepEqual(adminClientImports("'use client'; import {useState} from 'react'; import type {OperatorSession} from '@virtual-city/contracts';"),['react']);
});
test('actual admin client graph stays outside API/server and service configuration',async()=>{const result=await checkAdminBoundary();assert(result.clientRoots>0&&result.clientFiles>0);});
test('public product permits only the named lazy scene and Three while retaining server denials',()=>{
 assert.deepEqual(adminClientImports("import('./pet-scene'); import * as T from 'three';",true),['./pet-scene','three']);
 for(const code of ["import(process.env.PATH)","import('./other')","import('three')","require('./pet-scene')","import x from 'node:fs'","import x from 'pg'","const x=process.env.ADMIN_API_ORIGIN","import catalog from '../domain/catalog.json'"]){assert.throws(()=>adminClientImports(code,true));}
 assert.throws(()=>adminClientImports("import * as T from 'three'"));
});
