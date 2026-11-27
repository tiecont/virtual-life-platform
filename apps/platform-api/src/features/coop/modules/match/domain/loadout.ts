import {createHash} from 'node:crypto';
import {CoopSkillLevelBindingSchema} from '@aetheria/contracts';
import {z} from 'zod';

const uuid=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const stableId=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const slots=['core','aegis','rune'] as const;
const artifact=z.strictObject({
 slot:z.enum(slots),artifactId:uuid,definitionId:stableId,upgradeLevel:z.number().int().min(1).max(5),
}).readonly();
const loadout=z.strictObject({entries:z.array(artifact).max(slots.length).readonly(),digest}).readonly();
const seatIdentity=z.strictObject({
 skillLevels:z.array(CoopSkillLevelBindingSchema).max(5).refine(levels=>new Set(levels.map(entry=>entry.skillId)).size===levels.length).readonly().optional(),
 account:uuid,petId:stableId,ownedPetInstanceId:uuid,petLevel:z.number().int().min(1).max(60),
});
const allocatedSeat=z.union([
 seatIdentity.extend({loadout}).readonly(),
 seatIdentity.extend({artifactPowerPm:z.number().int().min(1000).max(5000)}).readonly(),
]);
const seats=z.array(allocatedSeat).length(4).readonly();

type SeatIdentity=z.infer<typeof seatIdentity>;
export type CoopSeat=z.infer<typeof allocatedSeat>;
export type ArtifactSeat=Extract<CoopSeat,{loadout:unknown}>;
type EquippedArtifact=z.infer<typeof artifact>;

function loadoutDigest(configDigest:string,seat:SeatIdentity,entries:readonly EquippedArtifact[]){
 return createHash('sha256').update(JSON.stringify([
  'aetheria.arena8-coop.loadout.v1',configDigest,seat.account,seat.petId,seat.ownedPetInstanceId,seat.petLevel,
  entries.map(({slot,artifactId,definitionId,upgradeLevel})=>[slot,artifactId,definitionId,upgradeLevel]),
 ])).digest('hex');
}

export function bindArtifactLoadout(configDigest:string,seat:SeatIdentity,equipped:readonly EquippedArtifact[]){
 const entries=Object.freeze([...equipped].sort((a,b)=>slots.indexOf(a.slot)-slots.indexOf(b.slot)));
 return Object.freeze({entries,digest:loadoutDigest(configDigest,seat,entries)});
}

function validateArtifactLoadout(seat:ArtifactSeat,configDigest:string){
 const {entries,digest}=seat.loadout;
 if(digest!==loadoutDigest(configDigest,seat,entries)
   ||new Set(entries.map(entry=>entry.artifactId)).size!==entries.length
   ||entries.some((entry,i)=>i>0&&slots.indexOf(entries[i-1]!.slot)>=slots.indexOf(entry.slot)))
  throw new Error('Native allocation Artifact loadout is invalid');
}

export function readArtifactSeat(value:unknown,configDigest:string):ArtifactSeat{
 const seat=allocatedSeat.parse(value);
 if(!('loadout' in seat))throw new Error('Typed Artifact loadout is required');
 validateArtifactLoadout(seat,configDigest);
 return seat;
}

export function readAllocationSeats(value:unknown,configDigest:string):readonly CoopSeat[]{
 const roster=seats.parse(value);
 const accounts=new Set(roster.map(seat=>seat.account));
 const instances=new Set(roster.map(seat=>seat.ownedPetInstanceId));
 const typed=roster.filter(seat=>'loadout' in seat);
 if(accounts.size!==roster.length||instances.size!==roster.length
   ||(typed.length!==0&&typed.length!==roster.length))throw new Error('Cooperative allocation seats are invalid');
 for(const seat of typed)validateArtifactLoadout(seat,configDigest);
 return roster;
}
