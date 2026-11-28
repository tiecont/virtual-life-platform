import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {PetMatchContentPinV3Schema} from '../src/pet-manifest-v3';

const fixture=JSON.parse(readFileSync('crates/aetheria-pet-arena/tests/fixtures/v3-pin.json','utf8'));
it('accepts the shared Rust/TS v3 binding fixture and rejects malformed versions, nested fields and bounds',()=>{
 expect(PetMatchContentPinV3Schema.parse(fixture)).toEqual(fixture);
 for(const change of [{schemaVersion:1},{ruleset:'pet-arena-pve'},{contentHash:'A'.repeat(64)},{rulesHash:'b'.repeat(63)},{loadout:'../invalid'},{encounterRevision:2147483648},{level:101},{level:'1'},{script:{code:'invalid'}},{stats:{...fixture.stats,extra:1}},{stats:{...fixture.stats,hp:1000001}},{stats:{...fixture.stats,defense:-1}}])expect(PetMatchContentPinV3Schema.safeParse({...fixture,...change}).success).toBe(false);
});
