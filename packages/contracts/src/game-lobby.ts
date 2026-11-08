import {z} from 'zod';
import {TravelSourceSchema} from './travel';
import {GameModeSchema} from './games';
const id=z.uuid().transform(value=>value.toLowerCase()),base={schemaVersion:z.literal(1),source:TravelSourceSchema};
const table={tableId:id,generation:id};
export const GameLobbyInputSchema=z.discriminatedUnion('op',[
 z.strictObject({...base,op:z.literal('view')}),
 z.strictObject({...base,op:z.literal('open'),mode:GameModeSchema,consent:z.literal(true)}),
 z.strictObject({...base,...table,op:z.literal('join'),consent:z.literal(true)}),
 z.strictObject({...base,...table,op:z.literal('ready'),expectedVersion:z.number().int().min(1).max(2147483646),ready:z.boolean()}),
]);
// Withdrawal must work after travel, disconnection or a turn deadline.
export const GameLobbyLeaveSchema=z.strictObject({schemaVersion:z.literal(1),tableId:id,generation:id});
export const GameLobbyViewSchema=z.strictObject({schemaVersion:z.literal(1),ephemeral:z.literal(true),spectator:z.literal(false),canStart:z.literal(false),table:z.strictObject({tableId:id,generation:id,mode:GameModeSchema,version:z.number().int().min(1),minimum:z.number().int().min(2).max(4),capacity:z.number().int().min(6).max(8),phase:z.enum(['WAITING','READY_CHECK']),slots:z.array(z.strictObject({seat:z.number().int().min(0).max(7),ready:z.boolean(),own:z.boolean()})).max(8),ownSeat:z.number().int().min(0).max(7).nullable()}).nullable()}).superRefine((view,ctx)=>{
 const table=view.table;if(!table)return;const expected={'lantern-colors':[2,6],'mask-and-tell':[3,6],'mistbound-routes':[4,8]}[table.mode],own=table.slots.filter(slot=>slot.own);
 if(table.minimum!==expected[0]||table.capacity!==expected[1]||!table.slots.length||table.slots.length>table.capacity||new Set(table.slots.map(slot=>slot.seat)).size!==table.slots.length||table.slots.some(slot=>slot.seat>=table.capacity)||own.length!==(table.ownSeat===null?0:1)||table.ownSeat!==null&&own[0]?.seat!==table.ownSeat||table.phase==='READY_CHECK'&&(table.slots.length<table.minimum||table.slots.some(slot=>!slot.ready)))ctx.addIssue({code:'custom',message:'Incoherent table projection'});
});
export type GameLobbyInput=z.infer<typeof GameLobbyInputSchema>;
export type GameLobbyView=z.infer<typeof GameLobbyViewSchema>;
