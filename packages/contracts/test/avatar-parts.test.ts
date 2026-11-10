import {describe,it,expect} from 'vitest';
import {AvatarAppearanceSchema,AvatarPartsSchema,AvatarSaveInputSchema,AvatarAppearanceV2Schema,AVATAR_CATALOG_VERSION,starterAvatarParts,projectAvatarV1,AVATAR_COMPATIBILITY} from '../src';
describe('versioned modular animal catalog',()=>{
 it('has distinct species-compatible starter selections and rejects cross-species parts',()=>{
  for(const species of ['cat','dog','rabbit'] as const){const parts=starterAvatarParts('cocoa',species);expect(AvatarPartsSchema.parse(parts)).toEqual(parts);for(const ears of AVATAR_COMPATIBILITY[species].ears)expect(AvatarPartsSchema.safeParse({...parts,ears}).success).toBe(true);expect(AvatarPartsSchema.safeParse({...parts,ears:species==='rabbit'?'pointed':'long'}).success).toBe(false);}
 });
 it('rejects URLs,unknown parts,extra actor and authority fields at every boundary',()=>{
  const parts=starterAvatarParts();for(const key of Object.keys(parts))expect(AvatarPartsSchema.safeParse({...parts,[key]:'https://untrusted.invalid/model.glb'}).success).toBe(false);
  for(const extra of [{actorId:'someone'},{seatId:'chair'},{entitled:true}])expect(AvatarPartsSchema.safeParse({...parts,...extra}).success).toBe(false);
  expect(AvatarSaveInputSchema.safeParse({schemaVersion:2,catalogVersion:AVATAR_CATALOG_VERSION,expectedRevision:0,parts,accountId:'other'}).success).toBe(false);
 });
 it('projects v2 to valid v1 without changing saved parts or granting a uniform',()=>{
  const parts={...starterAvatarParts('rose','rabbit'),outfit:'cafe-apron' as const},before=structuredClone(parts);
  expect(AvatarAppearanceSchema.parse(projectAvatarV1(parts,'casual'))).toEqual({schemaVersion:1,core:'starter-v1',palette:'rose',outfit:'casual'});expect(parts).toEqual(before);
  expect(AvatarAppearanceV2Schema.safeParse({schemaVersion:2,catalogVersion:'stale',parts}).success).toBe(false);
 });
});
