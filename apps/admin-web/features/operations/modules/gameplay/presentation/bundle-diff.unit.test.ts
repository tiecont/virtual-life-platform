import {describe,expect,it} from 'vitest';
import {bundleDifferences} from './bundle-diff';

describe('gameplay publication comparison',()=>{
 it('ignores unchanged values and identifies the affected skill',()=>{
  const before={skills:[{id:'mend',powerPm:1000}]};
  expect(bundleDifferences(before,structuredClone(before))).toEqual([]);
  expect(bundleDifferences(before,{skills:[{id:'mend',powerPm:1100}]})).toEqual([
   {path:'skills[0: mend].powerPm',before:1000,after:1100},
  ]);
 });
 it('reports an edit even when another item is added in the same array',()=>{
  expect(bundleDifferences([1,2],[1,3,4])).toEqual([
   {path:'[1]',before:2,after:3},{path:'[2]',before:undefined,after:4},
  ]);
 });
 it('distinguishes removal, explicit null, and a new object',()=>{
  const before={a:null,b:{cost:2},c:0};
  const after={a:{cost:3},b:null};
  expect(bundleDifferences(before,after)).toEqual([
   {path:'a',before:null,after:{cost:3}},
   {path:'b',before:{cost:2},after:null},
   {path:'c',before:0,after:undefined},
  ]);
 });
});
