import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {
  EconomyPolicyVersionSchema,
  FourResourceWalletSchema,
  WalletConvertReceiptSchema,
  type EconomyPolicyVersion,
  type FourResourceWallet,
  type WalletConvertInput,
  type WalletConvertReceipt,
} from '@aetheria/contracts';
import {DomainError} from '../../../../../shared/common/errors';
import {
  computeDiamondConversion,
  computeLazyEnergy,
  conversionPayloadSha256,
} from '../domain/wallet';

type Queryable=Pick<PoolClient,'query'>;

type PolicyRow={
  version:unknown;
  energy_max:number;
  energy_regen_seconds:number;
  activity_energy_cost:number;
  diamond_to_luminous_stone_rate:number;
  first_clear_luminous_stones:number;
  boss_first_clear_luminous_stones:number;
  gacha_single_cost_coins:number;
  gacha_single_cost_luminous_stones:number;
  gacha_disclosure:unknown;
  reason:string;
  published_by:string;
  published_at:Date;
};

type WalletRow={
  premium_diamonds:unknown;
  luminous_stones:unknown;
  energy_current:number;
  energy_updated_at:Date;
  revision:number;
};

function safeNonNegative(value:unknown,label:string):number{
  const parsed=Number(value as string|number);
  if(!Number.isSafeInteger(parsed)||parsed<0)throw new Error(`${label} is outside safe integer range`);
  return parsed;
}

async function readActiveEconomyPolicy(tx:Queryable):Promise<EconomyPolicyVersion>{
  const row=(await tx.query<PolicyRow>(
    `SELECT p.version,p.energy_max,p.energy_regen_seconds,p.activity_energy_cost,
            p.diamond_to_luminous_stone_rate,p.first_clear_luminous_stones,
            p.boss_first_clear_luminous_stones,p.gacha_single_cost_coins,
            p.gacha_single_cost_luminous_stones,p.gacha_disclosure,
            p.reason,p.published_by,p.published_at
       FROM pet_economy_policy_active a
       JOIN pet_economy_policy p ON p.version=a.version
      WHERE a.singleton=true`,
  )).rows[0];
  if(!row)throw new DomainError('NOT_AVAILABLE',503,'Economy policy is unavailable');
  const parsed=EconomyPolicyVersionSchema.safeParse({
    version:Number(row.version),
    energyMax:row.energy_max,
    energyRegenSeconds:row.energy_regen_seconds,
    activityEnergyCost:row.activity_energy_cost,
    diamondToLuminousStoneRate:row.diamond_to_luminous_stone_rate,
    firstClearLuminousStones:row.first_clear_luminous_stones,
    bossFirstClearLuminousStones:row.boss_first_clear_luminous_stones,
    gachaSingleCostCoins:row.gacha_single_cost_coins,
    gachaSingleCostLuminousStones:row.gacha_single_cost_luminous_stones,
    gachaDisclosure:row.gacha_disclosure,
    reason:row.reason,
    publishedBy:row.published_by,
    publishedAt:row.published_at.toISOString(),
  });
  if(!parsed.success)throw new DomainError('NOT_AVAILABLE',503,'Economy policy is invalid');
  return parsed.data;
}

function buildFourResourceWallet(input:Readonly<{
  energyCurrent:number;
  policy:EconomyPolicyVersion;
  nextRegenSeconds:number;
  premiumDiamonds:number;
  coins:number;
  luminousStones:number;
}>):FourResourceWallet{
  return FourResourceWalletSchema.parse({
    schemaVersion:1,
    energy:{
      current:input.energyCurrent,
      max:input.policy.energyMax,
      regenSeconds:input.policy.energyRegenSeconds,
      nextRegenSeconds:input.nextRegenSeconds,
    },
    premiumDiamonds:input.premiumDiamonds,
    coins:input.coins,
    luminousStones:input.luminousStones,
    conversionPolicy:{
      enabled:true,
      from:'premiumDiamonds',
      to:'luminousStones',
      inputUnit:1,
      outputUnit:1,
    },
  });
}

async function initializeWalletAccount(
  tx:Queryable,
  accountId:string,
  nowMs:number,
  energyMax:number,
):Promise<void>{
  const at=new Date(nowMs);
  await tx.query(
    `INSERT INTO pet_wallet_accounts(account_id,energy_current,energy_updated_at,created_at,updated_at)
     VALUES($1,$2,$3,$3,$3) ON CONFLICT(account_id) DO NOTHING`,
    [accountId,energyMax,at],
  );
}

export class WalletStore{
  async readWalletInTx(tx:Queryable,accountId:string,nowMs:number):Promise<FourResourceWallet>{
    const policy=await readActiveEconomyPolicy(tx);
    await initializeWalletAccount(tx,accountId,nowMs,policy.energyMax);
    const wallet=(await tx.query<WalletRow>(
      `SELECT premium_diamonds,luminous_stones,energy_current,energy_updated_at,revision
         FROM pet_wallet_accounts WHERE account_id=$1 FOR SHARE`,
      [accountId],
    )).rows[0];
    if(!wallet)throw new Error('Wallet account is unavailable');
    const coinsRow=(await tx.query<{coins:number}>(
      'SELECT coins FROM pet_wave_one_players WHERE account_id=$1',
      [accountId],
    )).rows[0];
    const coins=coinsRow?safeNonNegative(coinsRow.coins,'coins'):0;
    const premiumDiamonds=safeNonNegative(wallet.premium_diamonds,'premium_diamonds');
    const luminousStones=safeNonNegative(wallet.luminous_stones,'luminous_stones');
    const energy=computeLazyEnergy(
      wallet.energy_current,wallet.energy_updated_at.getTime(),nowMs,policy.energyMax,policy.energyRegenSeconds,
    );
    return buildFourResourceWallet({
      energyCurrent:energy.current,
      policy,
      nextRegenSeconds:energy.nextRegenSeconds,
      premiumDiamonds,
      coins,
      luminousStones,
    });
  }

  async convertDiamondsToStones(
    tx:Queryable,
    accountId:string,
    input:WalletConvertInput,
    nowMs:number,
  ):Promise<WalletConvertReceipt>{
    const payloadSha=conversionPayloadSha256(input.premiumDiamonds);
    const prior=(await tx.query<{payload_sha256:string;receipt:unknown}>(
      'SELECT payload_sha256,receipt FROM pet_wallet_ledger WHERE account_id=$1 AND request_id=$2',
      [accountId,input.requestId],
    )).rows[0];
    if(prior){
      if(prior.payload_sha256!==payloadSha||!prior.receipt){
        throw new DomainError('REQUEST_CONFLICT',409,'Request key was used with different input');
      }
      return WalletConvertReceiptSchema.parse(prior.receipt);
    }
    const policy=await readActiveEconomyPolicy(tx);
    await initializeWalletAccount(tx,accountId,nowMs,policy.energyMax);
    const walletRow=(await tx.query<WalletRow>(
      `SELECT premium_diamonds,luminous_stones,energy_current,energy_updated_at,revision
         FROM pet_wallet_accounts WHERE account_id=$1 FOR UPDATE`,
      [accountId],
    )).rows[0];
    if(!walletRow)throw new Error('Wallet account is unavailable');
    const coinsRow=(await tx.query<{coins:number}>(
      'SELECT coins FROM pet_wave_one_players WHERE account_id=$1 FOR SHARE',
      [accountId],
    )).rows[0];
    const coins=coinsRow?safeNonNegative(coinsRow.coins,'coins'):0;
    const currentDiamonds=safeNonNegative(walletRow.premium_diamonds,'premium_diamonds');
    const currentStones=safeNonNegative(walletRow.luminous_stones,'luminous_stones');
    const step=computeDiamondConversion(
      currentDiamonds,currentStones,input.premiumDiamonds,policy.diamondToLuminousStoneRate,
    );
    if(!step.ok){
      if(step.reason==='INSUFFICIENT_PREMIUM_DIAMONDS'){
        throw new DomainError('INSUFFICIENT_PREMIUM_DIAMONDS',409,'Not enough Premium Diamonds');
      }
      if(step.reason==='OVERFLOW'){
        throw new DomainError('REQUEST_CONFLICT',409,'Wallet luminous stones balance exceeds safe limit');
      }
      throw new DomainError('INVALID_REQUEST',422,'Invalid diamond conversion request');
    }
    const energy=computeLazyEnergy(
      walletRow.energy_current,walletRow.energy_updated_at.getTime(),nowMs,policy.energyMax,policy.energyRegenSeconds,
    );
    const wallet=buildFourResourceWallet({
      energyCurrent:energy.current,
      policy,
      nextRegenSeconds:energy.nextRegenSeconds,
      premiumDiamonds:step.nextDiamonds,
      coins,
      luminousStones:step.nextStones,
    });
    const receiptId=randomUUID();
    const receipt=WalletConvertReceiptSchema.parse({
      receiptId,
      requestId:input.requestId,
      debitedPremiumDiamonds:input.premiumDiamonds,
      creditedLuminousStones:step.credited,
      wallet,
    });
    const at=new Date(nowMs);
    await tx.query(
      `UPDATE pet_wallet_accounts
          SET premium_diamonds=$2,luminous_stones=$3,energy_current=$4,energy_updated_at=$5,
              revision=revision+1,updated_at=$6
        WHERE account_id=$1`,
      [accountId,step.nextDiamonds,step.nextStones,energy.current,new Date(energy.nextUpdatedAtMs),at],
    );
    await tx.query(
      `INSERT INTO pet_wallet_ledger(
         id,account_id,request_id,payload_sha256,kind,
         delta_energy,delta_premium_diamonds,delta_coins,delta_luminous_stones,
         balance_after,receipt,created_at
       ) VALUES($1,$2,$3,$4,'diamond_to_stone_conversion',$5,$6,0,$7,$8::jsonb,$9::jsonb,$10)`,
      [
        receiptId,accountId,input.requestId,payloadSha,
        energy.gained,-input.premiumDiamonds,step.credited,
        JSON.stringify({energy:energy.current,premiumDiamonds:step.nextDiamonds,coins,luminousStones:step.nextStones}),
        JSON.stringify(receipt),at,
      ],
    );
    return receipt;
  }

  async exportAccount(tx:Queryable,accountId:string,nowMs:number){
    const row=(await tx.query<WalletRow>(
      'SELECT premium_diamonds,luminous_stones,energy_current,energy_updated_at,revision FROM pet_wallet_accounts WHERE account_id=$1 FOR SHARE',
      [accountId],
    )).rows[0];
    if(!row)return;
    const policy=await readActiveEconomyPolicy(tx);
    const coinsRow=(await tx.query<{coins:number}>('SELECT coins FROM pet_wave_one_players WHERE account_id=$1 FOR SHARE',[accountId])).rows[0];
    const coins=coinsRow?safeNonNegative(coinsRow.coins,'coins'):0;
    const premiumDiamonds=safeNonNegative(row.premium_diamonds,'premium_diamonds');
    const luminousStones=safeNonNegative(row.luminous_stones,'luminous_stones');
    const energy=computeLazyEnergy(row.energy_current,row.energy_updated_at.getTime(),nowMs,policy.energyMax,policy.energyRegenSeconds);
    const ledger=(await tx.query<{kind:string;delta_energy:number;delta_premium_diamonds:string;delta_coins:string;delta_luminous_stones:string;created_at:Date}>(
      'SELECT kind,delta_energy,delta_premium_diamonds,delta_coins,delta_luminous_stones,created_at FROM pet_wallet_ledger WHERE account_id=$1 ORDER BY sequence DESC LIMIT 50',
      [accountId],
    )).rows;
    return {
      schemaVersion:1,
      initialized:true,
      revision:row.revision,
      wallet:buildFourResourceWallet({
        energyCurrent:energy.current,
        policy,
        nextRegenSeconds:energy.nextRegenSeconds,
        premiumDiamonds,
        coins,
        luminousStones,
      }),
      recentLedger:ledger.map(entry=>({
        kind:entry.kind,
        deltaEnergy:entry.delta_energy,
        deltaPremiumDiamonds:Number(entry.delta_premium_diamonds),
        deltaCoins:Number(entry.delta_coins),
        deltaLuminousStones:Number(entry.delta_luminous_stones),
        createdAt:entry.created_at.toISOString(),
      })),
    };
  }
}
