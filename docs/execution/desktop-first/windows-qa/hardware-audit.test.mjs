import assert from 'node:assert/strict';
import {test} from 'node:test';
import {summarizeFrames,routes} from '../../../../scripts/desktop-hardware-audit.mjs';
const sample=()=>({schemaVersion:1,runId:'synthetic-statistics-test',deviceId:'fixture-not-hardware',os:'fixture',gpu:'fixture',driver:'fixture',routeId:routes[0],phase:'measured',buildSha256:'a'.repeat(64),contentSha256:'b'.repeat(64),frameMs:Array.from({length:100},(_,i)=>i+1)});
test('nearest-rank percentiles and slowest one percent retain every measured sample',()=>{
  const input=sample(),result=summarizeFrames(input);
  assert.equal(result.p50FrameMs,50);assert.equal(result.p95FrameMs,95);assert.equal(result.p99FrameMs,99);
  assert.equal(result.onePercentLowFps,10);assert.equal(result.sampleCount,100);
  assert.equal(result.observedFrameDurationMs,5050);assert.equal(input.frameMs[0],1);
  assert.equal(result.acceptanceMet,false);assert.equal(result.result,'MEASUREMENT_SUMMARY_NOT_QUALIFICATION');
});
test('hitch boundary retains an extreme sample without averaging it away',()=>{
  const input=sample();input.frameMs=[16,16,100,1000];const result=summarizeFrames(input);
  assert.equal(result.p99FrameMs,1000);assert.equal(result.severeHitchesOver100Ms,1);assert.equal(result.framesOver16_7Ms,2);
});
test('nonfinite, nonnumeric, zero and missing samples fail closed',()=>{
  for(const frameMs of [[],[0],[-1],[NaN],[Infinity],['16']])assert.throws(()=>summarizeFrames({...sample(),frameMs}));
});
test('identity, phase, route and content omissions cannot produce an anonymous summary',()=>{
  for(const key of ['runId','deviceId','os','gpu','driver','buildSha256','contentSha256','routeId','phase']) {
    const input=sample();delete input[key];assert.throws(()=>summarizeFrames(input));
  }
  assert.throws(()=>summarizeFrames({...sample(),routeId:'combined-routes'}));
});
