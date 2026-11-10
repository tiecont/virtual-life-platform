import assert from 'node:assert/strict';
import {access,readFile,readdir,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {cpus,totalmem,platform,arch,release} from 'node:os';
import {join,delimiter} from 'node:path';
import {pathToFileURL} from 'node:url';

export const routes = ['aurora-plaza-noon','cafe-seat-card','pet-arena-dusk'];
const digest = value => typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const textField = value => typeof value==='string'&&value.trim().length>0;
export function summarizeFrames(input) {
  assert.equal(input.schemaVersion,1,'Frame input schemaVersion must be 1');
  for(const key of ['runId','deviceId','os','gpu','driver'])assert(textField(input[key]),'Missing '+key);
  assert(routes.includes(input.routeId),'Unknown routeId');
  assert(['cold-start','warmup','measured'].includes(input.phase),'Specify one phase per input');
  assert(digest(input.buildSha256)&&digest(input.contentSha256),'Exact build/content SHA256 required');
  assert(Array.isArray(input.frameMs)&&input.frameMs.length>0,'Nonempty frameMs required');
  assert(input.frameMs.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0),'Invalid frame duration');
  const sorted=[...input.frameMs].sort((a,b)=>a-b),count=sorted.length;
  const percentile=p=>sorted[Math.ceil(count*p)-1];
  const slowest=sorted.slice(-Math.max(1,Math.ceil(count*0.01)));
  return {
    schemaVersion:1,result:'MEASUREMENT_SUMMARY_NOT_QUALIFICATION',acceptanceMet:false,
    runId:input.runId,deviceId:input.deviceId,os:input.os,gpu:input.gpu,driver:input.driver,
    routeId:input.routeId,phase:input.phase,buildSha256:input.buildSha256,contentSha256:input.contentSha256,
    sampleCount:count,observedFrameDurationMs:input.frameMs.reduce((sum,value)=>sum+value,0),
    p50FrameMs:percentile(0.5),p95FrameMs:percentile(0.95),p99FrameMs:percentile(0.99),
    onePercentLowFps:1000/(slowest.reduce((sum,value)=>sum+value,0)/slowest.length),
    onePercentLowMethod:'1000 / arithmetic mean of slowest ceil(N * 0.01) frame times',
    severeHitchesOver100Ms:sorted.filter(value=>value>100).length,
    framesOver16_7Ms:sorted.filter(value=>value>16.7).length,
    limitations:['One device, route, build and phase only; do not merge percentiles across runs.',
      'Frame input is a supplied measurement, not proof of physical hardware or a Unity capture.',
      'CPU/GPU timing, VRAM, GC, crashes, route/capture hashes and independent review remain separate evidence.']
  };
}
async function optionalText(ref) {
  try{return(await readFile(ref,'utf8')).trim();}catch(error){if(['ENOENT','EACCES','ENOTDIR'].includes(error.code))return null;throw error;}
}
async function executable(names) {
  for(const directory of(process.env.PATH??'').split(delimiter).filter(Boolean))for(const name of names) {
    const ref=join(directory,name);
    try{await access(ref,constants.X_OK);return await realpath(ref);}catch(error){if(!['ENOENT','EACCES','ENOTDIR','ELOOP'].includes(error.code))throw error;}
  }
  return null;
}
export async function inspectHost() {
  const gpu=[];
  if(platform()==='linux') {
    let entries=[];try{entries=await readdir('/sys/class/drm');}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const entry of entries.filter(name=>/^card\d+$/.test(name))) {
      const base='/sys/class/drm/'+entry+'/device';
      gpu.push({adapter:entry,pciVendor:await optionalText(base+'/vendor'),pciDevice:await optionalText(base+'/device'),driverVersion:await optionalText(base+'/driver/module/version')});
    }
  }
  const tools=Object.fromEntries(await Promise.all([
    ['cargo',['cargo','cargo.exe']],['rustc',['rustc','rustc.exe']],
    ['dotnet',['dotnet','dotnet.exe']],['unity',['Unity','Unity.exe']]
  ].map(async([name,names])=>[name,{path:await executable(names),executed:false}])));
  return {
    schemaVersion:1,observedAt:new Date().toISOString(),taskId:'VL-007',
    result:'HOST_INVENTORY_NOT_WINDOWS_QUALIFICATION',acceptanceMet:false,
    host:{os:platform(),osRelease:release(),architecture:arch(),cpu:cpus()[0]?.model??null,logicalCpuCount:cpus().length,ramBytes:totalmem(),gpu},
    tools,physicalWindowsDevices:[],ownerAgreedDeviceMatrix:false,
    missingEvidence:['Three named physical Windows CPU/GPU/VRAM/RAM/SSD/driver profiles and owner agreement',
      'Windows runner and Unity editor/license qualification',
      'Compiled Windows player/build/content/protocol hashes and actual profiler captures'],
    routes:routes.map(routeId=>({routeId,durationMinutes:10,passesAfterWarmup:3,status:'NOT_RUN'})),
    limitations:['Read-only local inventory; no tool executed, installed or licensed.',
      'PATH absence does not prove software is absent from all machines.',
      'No hardware tier or performance measurement is inferred from this host.']
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);let result;
  if(args.length===0)result=await inspectHost();
  else {
    assert(args.length===2&&args[0]==='--frames','Usage: node scripts/desktop-hardware-audit.mjs [--frames capture.json]');
    result=summarizeFrames(JSON.parse(await readFile(args[1],'utf8')));
  }
  console.log(JSON.stringify(result,null,2));
}
