import {describe,expect,it} from 'vitest';
import {bundleDifferences} from './bundle-diff';

describe('gameplay bundle differences',()=>{
 it('reports no differences for the same value',()=>{
  expect(bundleDifferences({boss:{maxHp:10},party:{maxRounds:4}},{boss:{maxHp:10},party:{maxRounds:4}})).toEqual([]);
 });
 it('reports nested scalar and array-length paths',()=>{
  expect(bundleDifferences({boss:{maxHp:10,phase:{thresholdBp:2500}}},{boss:{maxHp:12,phase:{thresholdBp:2500}}})).toEqual(['boss.maxHp']);
  expect(bundleDifferences({skills:[1,2]},{skills:[1,2,3]})).toEqual(['skills.length']);
  expect(bundleDifferences({skills:[1,2]},{skills:[1,3]})).toEqual(['skills.1']);
 });
 it('reports type changes at the containing path',()=>{
  expect(bundleDifferences({party:{maxRounds:4}},{party:{maxRounds:'4'}})).toEqual(['party.maxRounds']);
 });
});
