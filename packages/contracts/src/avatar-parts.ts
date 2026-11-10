import {z} from 'zod';
import {AvatarKeySchema,type PublicProfile} from './profiles';
import type {AvatarAppearance} from './avatar';

export const AVATAR_CATALOG_VERSION='starter-parts-v2.1' as const;
export const AvatarSpeciesSchema=z.enum(['cat','dog','rabbit']);
export const AVATAR_COMPATIBILITY={cat:{ears:['pointed','tufted'],tail:['curved','plume']},dog:{ears:['floppy','upright'],tail:['wag','curl']},rabbit:{ears:['long','bent'],tail:['puff','bob']}} as const;
// Bounded IDs only. Neither saved parts nor public projections contain URLs,
// entitlements,animation commands,world roles or authority coordinates.
const shape={species:AvatarSpeciesSchema,body:z.enum(['round','slender']),head:z.enum(['soft','wide']),eyes:z.enum(['bright','calm']),muzzle:z.enum(['small','soft']),ears:z.enum(['pointed','tufted','floppy','upright','long','bent']),tail:z.enum(['curved','plume','wag','curl','puff','bob']),fur:AvatarKeySchema,marking:z.enum(['plain','patch','freckles']),hair:z.enum(['smooth','tuft']),outfit:z.enum(['bare','knit','overalls','cafe-apron']),accessory:z.enum(['none','scarf','cap','glasses'])};
export const AvatarPartsSchema=z.strictObject(shape).superRefine((parts,context)=>{
 const compatible=AVATAR_COMPATIBILITY[parts.species];
 for(const key of ['ears','tail'] as const)if(!(compatible[key] as readonly string[]).includes(parts[key]))context.addIssue({code:'custom',path:[key],message:'Part is incompatible with this species'});
});
export type AvatarParts=z.infer<typeof AvatarPartsSchema>;
export const AvatarAppearanceV2Schema=z.strictObject({schemaVersion:z.literal(2),catalogVersion:z.literal(AVATAR_CATALOG_VERSION),parts:AvatarPartsSchema});
export type AvatarAppearanceV2=z.infer<typeof AvatarAppearanceV2Schema>;
export const AvatarSaveInputSchema=z.strictObject({schemaVersion:z.literal(2),catalogVersion:z.string().min(1).max(64),expectedAccountId:z.uuid().transform(id=>id.toLowerCase()),expectedRevision:z.number().int().min(0).max(2147483646),parts:AvatarPartsSchema});
export const AvatarOwnStateSchema=z.strictObject({schemaVersion:z.literal(2),catalogVersion:z.literal(AVATAR_CATALOG_VERSION),accountId:z.uuid(),revision:z.number().int().min(0).max(2147483647),selected:AvatarPartsSchema,effective:AvatarPartsSchema,canEquipApron:z.boolean()});
export type AvatarOwnState=z.infer<typeof AvatarOwnStateSchema>;
export const AvatarSaveResultSchema=z.strictObject({schemaVersion:z.literal(2),requestId:z.uuid(),savedRevision:z.number().int().min(1).max(2147483647),state:AvatarOwnStateSchema});
export type AvatarSaveInput=z.infer<typeof AvatarSaveInputSchema>;
export type AvatarSaveResult=z.infer<typeof AvatarSaveResultSchema>;

export function starterAvatarParts(fur:PublicProfile['avatarKey']='fern',species:AvatarParts['species']='cat'):AvatarParts{
 return {species,body:'round',head:'soft',eyes:'bright',muzzle:'soft',ears:AVATAR_COMPATIBILITY[species].ears[0],tail:AVATAR_COMPATIBILITY[species].tail[0],fur,marking:'plain',hair:'tuft',outfit:'bare',accessory:'none'};
}
// N-1 projection is presentation only. Never rewrite the saved v2 selection or
// legacy uniform row when a client/world cannot present a particular part.
export function projectAvatarV1(parts:AvatarParts,outfit:AvatarAppearance['outfit']):AvatarAppearance{
 return {schemaVersion:1,core:'starter-v1',palette:parts.fur,outfit};
}
export const AVATAR_PART_OPTIONS={species:shape.species.options,body:shape.body.options,head:shape.head.options,eyes:shape.eyes.options,muzzle:shape.muzzle.options,ears:shape.ears.options,tail:shape.tail.options,fur:shape.fur.options,marking:shape.marking.options,hair:shape.hair.options,outfit:shape.outfit.options,accessory:shape.accessory.options} as const;
