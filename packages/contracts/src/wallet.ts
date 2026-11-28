import {z} from 'zod';

const safeCount=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInt=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const uuidLower=z.uuid().transform(value=>value.toLowerCase());
const hex64=z.string().regex(/^[a-f0-9]{64}$/);
const actor=z.string().trim().min(1).max(256);
const reason=z.string().trim().min(3).max(256);
const stableId=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);

export const WalletEnergySchema=z.strictObject({
  current:safeCount,
  max:z.number().int().min(1).max(10000),
  regenSeconds:z.number().int().min(10).max(86400),
  nextRegenSeconds:z.number().int().min(0).max(86400),
});
export type WalletEnergy=z.infer<typeof WalletEnergySchema>;

export const WalletConversionPolicySchema=z.strictObject({
  enabled:z.literal(true),
  from:z.literal('premiumDiamonds'),
  to:z.literal('luminousStones'),
  inputUnit:z.literal(1),
  outputUnit:z.literal(1),
});
export type WalletConversionPolicy=z.infer<typeof WalletConversionPolicySchema>;

// R02 canonical order: 1. energy, 2. premiumDiamonds, 3. coins, 4. luminousStones.
export const FourResourceWalletSchema=z.strictObject({
  schemaVersion:z.literal(1),
  energy:WalletEnergySchema,
  premiumDiamonds:safeCount,
  coins:safeCount,
  luminousStones:safeCount,
  conversionPolicy:WalletConversionPolicySchema,
});
export type FourResourceWallet=z.infer<typeof FourResourceWalletSchema>;

export const WalletConvertInputSchema=z.strictObject({
  requestId:uuidLower,
  premiumDiamonds:z.number().int().min(1).max(1_000_000_000),
});
export type WalletConvertInput=z.infer<typeof WalletConvertInputSchema>;

export const WalletConvertReceiptSchema=z.strictObject({
  receiptId:uuidLower,
  requestId:uuidLower,
  debitedPremiumDiamonds:z.number().int().min(1).max(1_000_000_000),
  creditedLuminousStones:z.number().int().min(1).max(1_000_000_000),
  wallet:FourResourceWalletSchema,
});
export type WalletConvertReceipt=z.infer<typeof WalletConvertReceiptSchema>;

export const GachaDisclosureSchema=z.strictObject({
  featuredPetId:stableId,
  softPityAt:z.number().int().min(1).max(500),
  hardPityAt:z.number().int().min(1).max(500),
  baseSProbabilityPpm:z.number().int().min(1).max(1_000_000),
  featuredProbabilityPpm:z.number().int().min(1).max(1_000_000),
  guaranteedFeaturedAfterOffRate:z.boolean(),
  duplicateExp:z.number().int().min(0).max(1_000_000),
  missExp:z.number().int().min(0).max(1_000_000),
  realMoneyPurchasesEnabled:z.literal(false),
  summary:z.string().trim().min(1).max(512),
}).refine(value=>value.softPityAt<=value.hardPityAt,{
  message:'softPityAt must not exceed hardPityAt',
  path:['softPityAt'],
});
export type GachaDisclosure=z.infer<typeof GachaDisclosureSchema>;

export const EconomyPolicyValuesSchema=z.strictObject({
  energyMax:z.number().int().min(1).max(10000),
  energyRegenSeconds:z.number().int().min(10).max(86400),
  activityEnergyCost:z.number().int().min(0).max(1000),
  diamondToLuminousStoneRate:z.literal(1),
  firstClearLuminousStones:z.number().int().min(0).max(1_000_000),
  bossFirstClearLuminousStones:z.number().int().min(0).max(1_000_000),
  gachaSingleCostCoins:z.number().int().min(1).max(1_000_000),
  gachaSingleCostLuminousStones:z.number().int().min(1).max(1_000_000),
  gachaDisclosure:GachaDisclosureSchema,
});
export type EconomyPolicyValues=z.infer<typeof EconomyPolicyValuesSchema>;

export const EconomyPolicyVersionSchema=EconomyPolicyValuesSchema.extend({
  version:positiveInt,
  reason,
  publishedBy:actor,
  publishedAt:z.iso.datetime(),
});
export type EconomyPolicyVersion=z.infer<typeof EconomyPolicyVersionSchema>;

export const EconomyPolicyOverviewSchema=z.strictObject({
  schemaVersion:z.literal(1),
  activeVersion:positiveInt.nullable(),
  activeRevision:safeCount,
  updatedBy:actor.nullable(),
  updatedAt:z.iso.datetime().nullable(),
  active:EconomyPolicyVersionSchema.nullable(),
  versions:z.array(EconomyPolicyVersionSchema).max(200),
});
export type EconomyPolicyOverview=z.infer<typeof EconomyPolicyOverviewSchema>;

export const EconomyPolicyPublishSchema=z.strictObject({
  requestId:uuidLower,
  expectedActiveRevision:safeCount,
  reason,
  policy:EconomyPolicyValuesSchema,
});
export type EconomyPolicyPublish=z.infer<typeof EconomyPolicyPublishSchema>;

export const EconomyPolicyRollbackSchema=z.strictObject({
  requestId:uuidLower,
  version:positiveInt,
  expectedActiveRevision:positiveInt,
  reason,
});
export type EconomyPolicyRollback=z.infer<typeof EconomyPolicyRollbackSchema>;

export const EconomyPolicyMutationResultSchema=z.strictObject({
  schemaVersion:z.literal(1),
  version:positiveInt,
  activeRevision:positiveInt,
  active:EconomyPolicyVersionSchema,
});
export type EconomyPolicyMutationResult=z.infer<typeof EconomyPolicyMutationResultSchema>;

export const EconomyPolicyAuditSchema=z.strictObject({
  events:z.array(z.strictObject({
    sequence:z.string().regex(/^[0-9]+$/),
    version:positiveInt,
    action:z.enum(['publish','rollback']),
    actor,
    reason,
    beforeVersion:positiveInt.nullable(),
    afterVersion:positiveInt,
    snapshot:EconomyPolicyValuesSchema,
    occurredAt:z.iso.datetime(),
    previousHash:hex64,
    eventHash:hex64,
  })).max(100),
});
export type EconomyPolicyAudit=z.infer<typeof EconomyPolicyAuditSchema>;
