import {z} from 'zod';
// Structural metadata only. The authoritative bundle schema lives in the Rust
// engine; TypeScript deliberately does not re-implement or interpret gameplay
// values. The engine validator returns the capability and canonical digest.
export const GameplayRulesetSchema=z.enum(['arena8-coop-pve']);
export type GameplayRuleset=z.infer<typeof GameplayRulesetSchema>;
export const GameplayConfigStateSchema=z.enum(['DRAFT','VALIDATED','PUBLISHED','SUPERSEDED','RETIRED']);
export type GameplayConfigState=z.infer<typeof GameplayConfigStateSchema>;
const hash=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().positive().max(9007199254740991),revision=z.number().int().positive().max(9007199254740991),requestId=z.uuid().transform(value=>value.toLowerCase()),capability=z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),actor=z.string().min(1).max(256),count=z.number().int().min(0).max(1_000_000);
const BUNDLE_LIMIT=1048576;
export const GameplayBundleSchema=z.record(z.string(),z.unknown()).superRefine((value,ctx)=>{
 const bytes=new TextEncoder().encode(JSON.stringify(value)).length;
 if(bytes<2||bytes>BUNDLE_LIMIT)ctx.addIssue({code:'custom',message:'Gameplay bundle size is outside the supported bound'});
});
export type GameplayBundle=z.infer<typeof GameplayBundleSchema>;
export const GameplayConfigVersionSchema=z.strictObject({
 ruleset:GameplayRulesetSchema,version,state:GameplayConfigStateSchema,schemaVersion:z.literal(1),
 engineCapability:capability.nullable(),contentDigest:hash.nullable(),revision,
 parentVersion:version.nullable(),createdBy:actor,updatedBy:actor,
 createdAt:z.iso.datetime(),validatedAt:z.iso.datetime().nullable(),publishedAt:z.iso.datetime().nullable(),
});
export const GameplayConfigVersionViewSchema=GameplayConfigVersionSchema.extend({bundle:GameplayBundleSchema});
export const GameplayConfigActiveSchema=z.strictObject({
 version,revision,state:GameplayConfigStateSchema,contentDigest:hash,engineCapability:capability,publishedAt:z.iso.datetime(),updatedBy:actor,updatedAt:z.iso.datetime(),
});
export const GameplayConfigOverviewSchema=z.strictObject({
 ruleset:GameplayRulesetSchema,active:GameplayConfigActiveSchema.nullable(),versions:z.array(GameplayConfigVersionSchema).max(200),
});
export const GameplayConfigCreateSchema=z.strictObject({requestId,ruleset:GameplayRulesetSchema,parentVersion:version.nullable(),bundle:GameplayBundleSchema});
export const GameplayConfigUpdateSchema=z.strictObject({requestId,ruleset:GameplayRulesetSchema,version,expectedRevision:revision,bundle:GameplayBundleSchema});
export const GameplayConfigValidateSchema=z.strictObject({requestId,ruleset:GameplayRulesetSchema,version,expectedRevision:revision});
export const GameplayConfigPublishSchema=z.strictObject({requestId,ruleset:GameplayRulesetSchema,version,expectedRevision:revision,expectedActiveRevision:revision.nullable()});
export const GameplayConfigRollbackSchema=z.strictObject({requestId,ruleset:GameplayRulesetSchema,version,expectedActiveRevision:revision});
export const GameplayConfigValidationSchema=z.strictObject({ruleset:GameplayRulesetSchema,version,revision,contentDigest:hash,engineCapability:capability,validatedAt:z.iso.datetime()});
export const GameplayConfigPublishResultSchema=z.strictObject({ruleset:GameplayRulesetSchema,version,contentDigest:hash,engineCapability:capability,publishedAt:z.iso.datetime(),activeRevision:revision});
export const GameplayConfigRollbackResultSchema=z.strictObject({ruleset:GameplayRulesetSchema,version,contentDigest:hash,publishedAt:z.iso.datetime(),activeRevision:revision});
export const GameplayConfigMutationSchema=z.strictObject({ruleset:GameplayRulesetSchema,version,revision});
export const GameplaySimulationPolicySchema=z.enum(['random','basic','tactical','coordinated']);
export type GameplaySimulationPolicy=z.infer<typeof GameplaySimulationPolicySchema>;
const bossId=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const bossIds=z.array(bossId).min(1).max(2).refine(ids=>new Set(ids).size===ids.length);
const simulationVersion={ruleset:GameplayRulesetSchema,version};
export const GameplaySimulationSeedsSchema=z.number().int().min(1).max(200);
export const GameplayComparisonSeedsSchema=z.number().int().min(1).max(25);
export const GameplaySimulationPartySchema=z.array(z.strictObject({
 petId:bossId,level:z.int().min(1).max(100),
 artifacts:z.array(z.strictObject({slot:z.enum(['core','aegis','rune']),artifactId:z.uuid(),definitionId:bossId,upgradeLevel:z.int().min(1).max(5)})).max(3),
 skillLevels:z.array(z.strictObject({skillId:bossId,level:z.int().min(1).max(255)})).max(5),
})).length(4);
export type GameplaySimulationParty=z.infer<typeof GameplaySimulationPartySchema>;
export const GameplaySimulationRequestSchema=z.union([
 z.strictObject({requestId,...simulationVersion,policy:GameplaySimulationPolicySchema,seeds:GameplaySimulationSeedsSchema,bossId:bossId.optional(),party:GameplaySimulationPartySchema.optional()}),
 z.strictObject({requestId,...simulationVersion,seeds:GameplayComparisonSeedsSchema,bossIds,party:GameplaySimulationPartySchema.optional()}),
]);
const simulationMetric=z.number().int().min(0).max(1_000_000_000);
const contribution=z.strictObject({
 petId:z.string().min(1).max(64),damage:z.int().nonnegative(),healing:z.int().nonnegative(),shielding:z.int().nonnegative(),
});
export const EngineGameplaySimulationReportSchema=z.strictObject({
 bossId,contentDigest:hash,policy:GameplaySimulationPolicySchema,seeds:GameplaySimulationSeedsSchema,
 wins:count,losses:count,unresolved:count,phaseTwoReached:count,totalActions:simulationMetric,
 averageRoundsMilli:simulationMetric,averageActionsMilli:simulationMetric,
 swapsUsingVisibleMultiplier:z.int().nonnegative().optional(),playerCriticals:z.int().nonnegative().optional(),abilityCasts:z.int().nonnegative().optional(),manaSpent:z.int().nonnegative().optional(),rageSpent:z.int().nonnegative().optional(),
 castsBySkill:z.record(z.string().min(1).max(64),z.int().positive()).optional(),
 averageLogicalDurationMs:simulationMetric,matchesWithMultiplier:count,contributions:z.array(contribution).length(4),
});
export type EngineGameplaySimulationReport=z.infer<typeof EngineGameplaySimulationReportSchema>;
export const GameplaySimulationReportSchema=EngineGameplaySimulationReportSchema.extend(simulationVersion);
export const GameplaySimulationComparisonSchema=z.strictObject({
 ...simulationVersion,seeds:GameplayComparisonSeedsSchema,reports:z.array(EngineGameplaySimulationReportSchema).min(4).max(8),
});
export const GameplaySimulationResultSchema=z.union([GameplaySimulationReportSchema,GameplaySimulationComparisonSchema]);
export const GameplayConfigAuditSchema=z.strictObject({events:z.array(z.strictObject({
 sequence:z.string().regex(/^[0-9]+$/),ruleset:GameplayRulesetSchema,version,action:z.enum(['create','update','validate','publish','rollback','retire','seed']),
 actor,fromState:GameplayConfigStateSchema.nullable(),toState:GameplayConfigStateSchema.nullable(),occurredAt:z.iso.datetime(),previousHash:hash,eventHash:hash,
})).max(100)});
export const GameplayConfigVersionQuerySchema=z.strictObject({ruleset:GameplayRulesetSchema,version:z.coerce.number().int().positive().max(9007199254740991)});
export const GameplayConfigOverviewQuerySchema=z.strictObject({ruleset:GameplayRulesetSchema.default('arena8-coop-pve')});
