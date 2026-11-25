import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import type {NativeArena8RuntimeRequest} from '../application/native-provisioner';
import {
  LocalNativeArena8Runtime,nativeArena8Settings,
  type LocalNativeArena8RuntimeOptions,NativeArena8SettingsOptions,
} from './native-runtime';

const CONTENT='ab'.repeat(32);
const ENGINE='cd'.repeat(32);
const ORIGIN='https://127.0.0.1:4443';
const PUBLIC_KEY='A'.repeat(43);
const REQUEST:NativeArena8RuntimeRequest=Object.freeze({
  accountId:'11111111-1111-4111-8111-111111111111',
  matchId:'33333333-3333-4333-8333-333333333333',
  bootId:'44444444-4444-4444-8444-444444444444',
  worldId:'native:arena8-33333333-3333-4333-8333-333333333333',
  contentHash:CONTENT,
  ownedPetId:'99999999-9999-5999-8999-999999999999',
  petId:'ember-cub',level:12,encounterId:'cinder-terraces-regular',
  artifacts:Object.freeze([Object.freeze({definitionId:'ember-core',upgradeLevel:2})]),
  origin:ORIGIN,
});

function options(overrides:Partial<NativeArena8SettingsOptions>={}):NativeArena8SettingsOptions{
  return {
    publicKey:PUBLIC_KEY,keyId:'arena8-native-v1',origin:ORIGIN,role:'arena8_runtime',
    caFile:'/run/aetheria/pg-ca.pem',storageKey:ENGINE,storageKeyId:'local-v1',
    engineHash:ENGINE,...overrides,
  };
}

const directories:string[]=[];
async function script(body:string){
  const directory=await mkdtemp(join(tmpdir(),'aetheria-arena8-test-'));
  directories.push(directory);
  const file=join(directory,'runtime-fixture');
  await writeFile(file,body,{mode:0o700});
  return file;
}
afterAll(async()=>{
  for(const directory of directories)await rm(directory,{recursive:true,force:true});
});

describe('native Arena8 runtime configuration',()=>{
  it('writes a server-owned arena8-pve configuration without client fields',()=>{
    const settings=nativeArena8Settings(REQUEST,options());
    expect(settings).toEqual({
      schemaVersion:1,ruleset:'arena8-pve',movement:false,
      world:REQUEST.worldId,boot:REQUEST.bootId,matchId:REQUEST.matchId,
      player:REQUEST.accountId,
      publicKeys:{'arena8-native-v1':PUBLIC_KEY},
      caFile:'/run/aetheria/pg-ca.pem',role:'arena8_runtime',origin:ORIGIN,
      activeStorageKey:'local-v1',
      storageKeys:{'local-v1':Array.from(Buffer.from(ENGINE,'hex'))},
      engineHash:Array.from(Buffer.from(ENGINE,'hex')),
      arena8:{
        petId:'ember-cub',ownedPetId:REQUEST.ownedPetId,level:12,
        encounterId:'cinder-terraces-regular',bindingVersion:2,
        artifacts:[{definitionId:'ember-core',upgradeLevel:2}],
      },
    });
    const serialized=JSON.stringify(settings);
    expect(serialized).not.toContain('requestId');
    expect(serialized).not.toContain('database');
    expect(serialized).not.toContain('ticket');
  });

  it('rejects malformed keys and loadouts before writing a configuration',()=>{
    expect(()=>nativeArena8Settings(REQUEST,options({storageKey:'bad'})))
      .toThrow(/storage key/);
    expect(()=>nativeArena8Settings(REQUEST,options({publicKey:'short'})))
      .toThrow(/public key/);
    expect(()=>nativeArena8Settings({...REQUEST,level:61},options()))
      .toThrow(/level/);
    expect(()=>nativeArena8Settings({
      ...REQUEST,artifacts:[{definitionId:'ember-core',upgradeLevel:9}],
    },options())).toThrow(/Artifact/);
  });
});

describe('local native Arena8 runtime adapter',()=>{
  const runtimeOptions=(binary:string,overrides:Partial<LocalNativeArena8RuntimeOptions>={}):LocalNativeArena8RuntimeOptions=>({
    binary,databaseUrl:'postgresql://arena8_runtime:'+'ef'.repeat(24)+'@127.0.0.1/aetheria_soulbound',
    role:'arena8_runtime',caFile:'/run/aetheria/pg-ca.pem',publicKey:PUBLIC_KEY,
    keyId:'arena8-native-v1',origin:ORIGIN,storageKey:ENGINE,storageKeyId:'local-v1',
    ...overrides,
  });

  it('executes the built runtime to read the arena8-pve content hash',async()=>{
    const binary=await script('#!/bin/sh\nprintf '+CONTENT+'\n');
    const runtime=new LocalNativeArena8Runtime(runtimeOptions(binary));
    expect(await runtime.contentHash()).toBe(CONTENT);
    expect(await runtime.contentHash()).toBe(CONTENT);
  });

  it('fails closed when the runtime cannot report a valid content hash',async()=>{
    const binary=await script('#!/bin/sh\nprintf not-a-hash\n');
    const runtime=new LocalNativeArena8Runtime(runtimeOptions(binary));
    await expect(runtime.contentHash()).rejects.toThrow(/content hash/);
  });
});
