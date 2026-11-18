import {afterEach,it,expect,vi} from 'vitest';
const replacement=vi.hoisted(()=>new Map<string,(bytes:Buffer)=>Buffer>());
vi.mock('node:fs/promises',async original=>{
 const fs=await original<typeof import('node:fs/promises')>();return {...fs,readFile:async(path:Parameters<typeof fs.readFile>[0],options?:unknown)=>{
  const bytes=await fs.readFile(path),change=replacement.get(String(path).split('/').at(-1)!);const result=change?change(bytes):bytes;
  return options==='utf8'?result.toString('utf8'):result;
 }};
});
import {petAcquisitionDraft} from '../../scripts/pet-acquisition-draft-seed.mjs';
afterEach(()=>replacement.clear());
it('loads all 240 identities from the verified canonical bundle and actual trusted upstream',async()=>{
 const {value,upstream}=await petAcquisitionDraft();expect(value.pets).toHaveLength(240);expect(upstream).toHaveLength(114);expect(value.publishAllowed).toBe(false);
});
it('fails closed on modified exact candidate bytes before returning a seed',async()=>{
 replacement.set('pets_initial_240.json',bytes=>Buffer.concat([bytes,Buffer.from(' ')]));await expect(petAcquisitionDraft()).rejects.toThrow('hash mismatch');
});
it('rejects missing or path-injected manifest entries',async()=>{
 for(const mode of ['missing','path']){
  replacement.set('catalog_manifest.json',bytes=>{const manifest=JSON.parse(bytes.toString());if(mode==='missing')delete manifest.files['skills_16.json'];else manifest.files['../outside.json']='a'.repeat(64);return Buffer.from(JSON.stringify(manifest));});await expect(petAcquisitionDraft()).rejects.toBeDefined();
 }
});
it('compares against actual upstream identities rather than accepting the candidate upstream manifest as authority',async()=>{
 replacement.set('catalog-v2.json',bytes=>{const upstream=JSON.parse(bytes.toString());upstream.species[0].displayName='Changed identity';return Buffer.from(JSON.stringify(upstream));});await expect(petAcquisitionDraft()).rejects.toThrow('Upstream Pet identity changed');
});
