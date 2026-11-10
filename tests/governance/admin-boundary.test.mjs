import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminClientImports,checkAdminBoundary} from '../../scripts/admin-boundary.mjs';
test('admin client rejects environment reads, dynamic imports and server dependencies',()=>{
 for(const code of ["const key=process.env.ADMIN_METRICS_READ_TOKEN;","import x from 'node:fs';","import x from 'pg';","import x from 'next/headers';","import('./server');","require('node:fs');"])assert.throws(()=>adminClientImports(code));
 assert.deepEqual(adminClientImports("'use client'; import {useState} from 'react'; import type {OperatorSession} from '@virtual-city/contracts';"),['react','@virtual-city/contracts']);
});
test('actual admin client graph stays outside API/server and service configuration',async()=>{const result=await checkAdminBoundary();assert(result.clientRoots>0&&result.clientFiles>0);});
