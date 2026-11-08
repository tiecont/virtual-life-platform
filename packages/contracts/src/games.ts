import {z} from 'zod';
import {PublicProfileSchema} from './profiles';
import {AvatarAppearanceV2Schema} from './avatar-parts';
export const GameIdSchema=z.uuid().transform(value=>value.toLowerCase());
const uuid=GameIdSchema;
export const GameModeSchema=z.enum(['lantern-colors','mask-and-tell','mistbound-routes']);
export type GameMode=z.infer<typeof GameModeSchema>;
export const GameVersionSchema=z.number().int().min(0).max(2147483647);
export const GameTimeSchema=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const GameRulesetVersionSchema=z.string().regex(/^[1-9][0-9]{0,3}\.[0-9]{1,3}\.[0-9]{1,3}$/);
export const GameSeatIndexSchema=z.number().int().min(0).max(7);
export const GameStatusSchema=z.enum(['LOBBY','READY_CHECK','DEALING','ACTIVE','SETTLING','FINISHED','ABORTED','INTERRUPTED']);
export const GamePhaseSchema=z.enum(['LOBBY','READY_CHECK','DEALING','WAITING_PLAY','OPTIONAL_PLAY_DRAWN','SUBMIT_CLAIM','CHALLENGE_DECISION','TILE_TURN','SETTLING','FINISHED','ABORTED','INTERRUPTED']);
export const GameSourceSchema=z.strictObject({epoch:uuid,roomId:uuid,membershipId:uuid});
export const GameColorSchema=z.enum(['red','amber','blue','green']);
export const GameSymbolSchema=z.enum(['moon','star','flower']);
export const GameGateIdSchema=z.enum(['gate-a','gate-b','gate-c']);
export const GameConnectorSchema=z.enum(['N','E','S','W']);
const connectors=z.array(GameConnectorSchema).min(2).max(4).refine(values=>new Set(values).size===values.length);
export const GameColorFaceSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('number'),color:GameColorSchema,value:z.number().int().min(1).max(8)}),
 z.strictObject({kind:z.literal('action'),color:GameColorSchema,action:z.enum(['REVERSE','SKIP','DRAW_ONE'])}),
 z.strictObject({kind:z.literal('prism')}),
]);
export const GameColorCardSchema=z.strictObject({cardId:uuid,face:GameColorFaceSchema});
export const GameMaskCardSchema=z.strictObject({cardId:uuid,symbol:GameSymbolSchema});
export const GameRouteTileSchema=z.strictObject({tileId:uuid,connectors});
const coordinate=z.number().int().min(0).max(6),uniqueSeats=(items:readonly {seatIndex:number}[])=>new Set(items.map(item=>item.seatIndex)).size===items.length;
export const GamePublicBoardSchema=z.discriminatedUnion('mode',[
 z.strictObject({mode:z.literal('lantern-colors'),top:GameColorFaceSchema,color:GameColorSchema,direction:z.union([z.literal(1),z.literal(-1)]),glow:z.array(z.strictObject({seatIndex:GameSeatIndexSchema,amount:z.number().int().min(0).max(2)})).min(2).max(6).refine(uniqueSeats),drawCount:z.number().int().min(0).max(64)}),
 z.strictObject({mode:z.literal('mask-and-tell'),targetSymbol:GameSymbolSchema,round:z.number().int().min(1).max(6),claimCount:z.number().int().min(0).max(4),lastClaim:z.strictObject({seatIndex:GameSeatIndexSchema,count:z.number().int().min(1).max(2)}).nullable(),revealedClaim:z.array(GameSymbolSchema).min(1).max(2).nullable(),scores:z.array(z.strictObject({seatIndex:GameSeatIndexSchema,credibility:z.number().int().min(0).max(3),mastery:z.number().int().min(0).max(128)})).min(3).max(6).refine(uniqueSeats)}),
 z.strictObject({mode:z.literal('mistbound-routes'),tiles:z.array(z.strictObject({x:coordinate,y:coordinate,connectors,rotation:z.number().int().min(0).max(3)})).max(45),gates:z.array(z.strictObject({id:GameGateIdSchema,x:coordinate,y:coordinate,connector:GameConnectorSchema,status:z.enum(['unknown','excluded','reached'])})).length(3).refine(items=>new Set(items.map(item=>item.id)).size===3),scansRemaining:z.number().int().min(0).max(2),turnsRemaining:z.number().int().min(0).max(24),drawCount:z.number().int().min(0).max(512)}),
]);
export type GamePublicBoard=z.infer<typeof GamePublicBoardSchema>;
// Separate strict variants:crew can never receive a target,including a field
// whose value is undefined. No public DTO admits card IDs,deck order or roles.
export const GamePrivateStateSchema=z.union([
 z.strictObject({mode:z.literal('lantern-colors'),hand:z.array(GameColorCardSchema).max(64)}),
 z.strictObject({mode:z.literal('mask-and-tell'),hand:z.array(GameMaskCardSchema).max(72)}),
 z.strictObject({mode:z.literal('mistbound-routes'),role:z.literal('crew'),hand:z.array(GameRouteTileSchema).max(512)}),
 z.strictObject({mode:z.literal('mistbound-routes'),role:z.literal('mist'),targetGateId:GameGateIdSchema,hand:z.array(GameRouteTileSchema).max(512)}),
]).refine(state=>{const ids=state.hand.map(card=>'cardId'in card?card.cardId:card.tileId);return new Set(ids).size===ids.length;},'Duplicate private item');
export type GamePrivateState=z.infer<typeof GamePrivateStateSchema>;
export const GamePublicSeatSchema=z.strictObject({seatIndex:GameSeatIndexSchema,ready:z.boolean(),connected:z.boolean(),handCount:z.number().int().min(0).max(512),profile:PublicProfileSchema.nullable(),appearance:AvatarAppearanceV2Schema.nullable()}).refine(seat=>seat.profile!==null||seat.appearance===null,'Hidden profile cannot publish an identifying appearance');
export const GameResultSchema=z.strictObject({outcome:z.enum(['none','win','tie','aborted']),winnerSeats:z.array(GameSeatIndexSchema).max(8).refine(values=>new Set(values).size===values.length)});
const caps={ 'lantern-colors':[2,6], 'mask-and-tell':[3,6], 'mistbound-routes':[4,8] }as const;
export const GamePublicViewSchema=z.strictObject({schemaVersion:z.literal(1),protocolVersion:z.literal(1),projection:z.literal('public'),matchId:uuid,tableId:uuid,generation:uuid,roomId:uuid,mode:GameModeSchema,rulesetVersion:GameRulesetVersionSchema,stateVersion:GameVersionSchema,status:GameStatusSchema,phase:GamePhaseSchema,serverTime:GameTimeSchema,deadline:GameTimeSchema.nullable(),turnSeat:GameSeatIndexSchema.nullable(),seedCommitment:z.string().regex(/^[a-f0-9]{64}$/).nullable(),seats:z.array(GamePublicSeatSchema).min(1).max(8).refine(uniqueSeats),board:GamePublicBoardSchema.nullable(),result:GameResultSchema}).superRefine((view,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message}),seats=new Set(view.seats.map(seat=>seat.seatIndex));
 if(view.seats.length>caps[view.mode][1])fail('Mode capacity exceeded');
 if(view.turnSeat!==null&&!seats.has(view.turnSeat)||view.result.winnerSeats.some(seat=>!seats.has(seat)))fail('Unknown public seat');
 if(view.board&&view.board.mode!==view.mode)fail('Board mode mismatch');
 if(view.status==='ACTIVE'){
  const phases=view.mode==='lantern-colors'?['WAITING_PLAY','OPTIONAL_PLAY_DRAWN']:view.mode==='mask-and-tell'?['SUBMIT_CLAIM','CHALLENGE_DECISION']:['TILE_TURN'];
  if(view.seats.length<caps[view.mode][0]||!view.board||view.turnSeat===null||view.deadline===null||view.seedCommitment===null||!phases.includes(view.phase))fail('Incomplete active match');
 }
 if(view.board?.mode==='lantern-colors'&&(view.board.glow.length!==seats.size||view.board.glow.some(row=>!seats.has(row.seatIndex)))||view.board?.mode==='mask-and-tell'&&(view.board.scores.length!==seats.size||view.board.scores.some(row=>!seats.has(row.seatIndex))||view.board.lastClaim&&!seats.has(view.board.lastClaim.seatIndex)))fail('Unknown score seat');
 if(view.status==='ACTIVE'&&(view.result.outcome!=='none'||view.result.winnerSeats.length))fail('Active match cannot declare a result');
 if(view.status==='FINISHED'&&(!['win','tie'].includes(view.result.outcome)||!view.result.winnerSeats.length))fail('Finished match requires winners');
 if(['ABORTED','INTERRUPTED'].includes(view.status)&&(view.result.outcome!=='aborted'||view.result.winnerSeats.length))fail('Interrupted match has no winner');
 if(['FINISHED','ABORTED','INTERRUPTED'].includes(view.status)&&(view.deadline!==null||view.turnSeat!==null||view.phase!==view.status))fail('Terminal match still has an active turn');
});
export type GamePublicView=z.infer<typeof GamePublicViewSchema>;
export const GameOwnViewSchema=z.strictObject({schemaVersion:z.literal(1),projection:z.literal('own'),accountId:uuid,ownSeat:GameSeatIndexSchema,public:GamePublicViewSchema,private:GamePrivateStateSchema.nullable()}).superRefine((view,ctx)=>{
 const seat=view.public.seats.find(seat=>seat.seatIndex===view.ownSeat);
 if(!seat||view.private&&view.private.mode!==view.public.mode||view.private&&view.private.hand.length!==seat.handCount||!view.private&&seat?.handCount!==0||view.public.status==='ACTIVE'&&!view.private||seat?.profile&&seat.profile.id!==view.accountId)ctx.addIssue({code:'custom',message:'Own projection mismatch'});
});
export type GameOwnView=z.infer<typeof GameOwnViewSchema>;
export const GameSpectatorViewSchema=z.strictObject({schemaVersion:z.literal(1),projection:z.literal('spectator'),enabled:z.literal(false)});
const envelope=z.strictObject({schemaVersion:z.literal(1),protocolVersion:z.literal(1),requestId:uuid,matchId:uuid,tableId:uuid,generation:uuid,expectedVersion:GameVersionSchema,source:GameSourceSchema});
const empty=z.strictObject({});
export const GameCommandSchema=z.discriminatedUnion('kind',[
 envelope.extend({kind:z.literal('color.play'),payload:z.strictObject({cardId:uuid,spendGlow:z.boolean().optional(),chosenColor:GameColorSchema.optional()})}),
 envelope.extend({kind:z.literal('color.draw'),payload:empty}),
 envelope.extend({kind:z.literal('color.playDrawn'),payload:z.strictObject({cardId:uuid,chosenColor:GameColorSchema.optional()})}),
 envelope.extend({kind:z.literal('mask.submit'),payload:z.strictObject({cardIds:z.array(uuid).min(1).max(2).refine(ids=>new Set(ids).size===ids.length)})}),
 envelope.extend({kind:z.literal('mask.challenge'),payload:empty}),
 envelope.extend({kind:z.literal('mask.trust'),payload:empty}),
 envelope.extend({kind:z.literal('route.place'),payload:z.strictObject({tileId:uuid,x:coordinate,y:coordinate,rotation:z.number().int().min(0).max(3)})}),
 envelope.extend({kind:z.literal('route.scan'),payload:empty}),
 envelope.extend({kind:z.literal('route.redraw'),payload:z.strictObject({tileId:uuid})}),
 envelope.extend({kind:z.literal('game.leave'),payload:empty}),
]);
export type GameCommand=z.infer<typeof GameCommandSchema>;
export const GameErrorCodeSchema=z.enum(['AUTH_REQUIRED','NOT_IN_ROOM','NOT_PARTICIPANT','GAME_FULL','TABLE_CLOSED','WRONG_TURN','WRONG_PHASE','WRONG_MODE','INVALID_REQUEST','INVALID_CARD','INVALID_PLACEMENT','DEADLINE_EXPIRED','STATE_CONFLICT','IDEMPOTENCY_CONFLICT','RATE_LIMITED','WORLD_DISABLED','OWNER_UNAVAILABLE','UNAVAILABLE','INTERNAL_ERROR']);
export type GameErrorCode=z.infer<typeof GameErrorCodeSchema>;
export const GameAckSchema=z.discriminatedUnion('ok',[
 z.strictObject({schemaVersion:z.literal(1),requestId:uuid,ok:z.literal(true),replayed:z.boolean(),committedVersion:GameVersionSchema.min(1),view:GameOwnViewSchema}).refine(ack=>ack.view.public.stateVersion>=ack.committedVersion,'Current view cannot predate receipt'),
 z.strictObject({schemaVersion:z.literal(1),requestId:uuid,ok:z.literal(false),serverVersion:GameVersionSchema.nullable(),error:z.strictObject({code:GameErrorCodeSchema,retryable:z.boolean()})}),
]);
export type GameAck=z.infer<typeof GameAckSchema>;
