import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import test from 'node:test';

const binaryExtensions=new Set(['.apk','.blend','.dll','.fbx','.glb','.ico','.jpeg','.jpg','.mp4','.png','.so','.tar','.wav','.webp','.zip']);

function activeFiles(){
  return execFileSync('git',['ls-files','-z','--',
    'README.md','AGENTS.md','package.json','Cargo.toml','Cargo.lock','pnpm-workspace.yaml',
    'apps/portal-web','apps/admin-web','packages','specs','.github/workflows','infra/cloudflare',
    'scripts/media','config/playwright',
  ],{encoding:'utf8'}).split('\0').filter(path=>path&&!binaryExtensions.has(extname(path).toLowerCase()));
}

test('active product source uses the canonical Aetheria identity and workspace scope',async()=>{
  const rootPackage=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(rootPackage.name,'aetheria-soulbound');
  assert.match(await readFile('README.md','utf8'),/^# Aetheria: SoulBound$/m);

  const retired=[/VirtualLife/,/@virtual-life\//,/@vl\//,/\bVIRTUAL LIFE\b/i,/\bVirtual Life\b/];
  const offenders=[];
  for(const path of activeFiles()){
    const source=await readFile(path,'utf8');
    if(retired.some(pattern=>pattern.test(source)))offenders.push(path);
  }
  assert.deepEqual(offenders,[],'Retired product or package identity remains in active source');
});

test('manifests expose only the canonical package scope and crate names',async()=>{
  const manifests=execFileSync('git',['ls-files','-z','--','package.json','packages/*/package.json','apps/*/package.json'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const names=[];
  for(const path of manifests)names.push(JSON.parse(await readFile(path,'utf8')).name);
  assert(names.every(name=>name==='aetheria-soulbound'||name.startsWith('@aetheria/')),'Unexpected workspace package name');

  const crates=execFileSync('git',['ls-files','-z','--','Cargo.toml','crates/*/Cargo.toml','apps/*/Cargo.toml'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const expected=new Set([
    'aetheria-game-core','aetheria-game-runtime','aetheria-gateway','aetheria-persistence',
    'aetheria-pet-arena','aetheria-protocol','aetheria-security','aetheria-world',
  ]);
  const found=[];
  for(const path of crates){
    const source=await readFile(path,'utf8'),match=/^name = "([^"]+)"$/m.exec(source);
    if(match)found.push(match[1]);
  }
  for(const name of found){
    if(name.startsWith('aetheria-'))assert(expected.delete(name),'Unknown Aetheria crate: '+name);
  }
  assert.deepEqual([...expected],[]);
  assert(!found.some(name=>name.startsWith('vl-')),'Retired vl crate remains');
});
