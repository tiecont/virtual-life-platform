import type {PoolClient} from 'pg';
import {
  EconomyPolicyAuditSchema,
  EconomyPolicyOverviewSchema,
  EconomyPolicyValuesSchema,
  EconomyPolicyVersionSchema,
  type EconomyPolicyAudit,
  type EconomyPolicyOverview,
  type EconomyPolicyValues,
  type EconomyPolicyVersion,
} from '@aetheria/contracts';

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

type ActiveRow={
  version:unknown;
  revision:unknown;
  updated_by:string;
  updated_at:Date;
};

type AuditRow={
  sequence:unknown;
  version:unknown;
  action:'publish'|'rollback';
  actor:string;
  reason:string;
  before_version:unknown;
  after_version:unknown;
  snapshot:unknown;
  occurred_at:Date;
  previous_hash:string;
  event_hash:string;
};

const numeric=(value:unknown,label:string):number=>{
  const parsed=Number(value as string|number);
  if(!Number.isSafeInteger(parsed)||parsed<0)throw new Error(`${label} is invalid`);
  return parsed;
};

function mapVersion(row:PolicyRow):EconomyPolicyVersion{
  return EconomyPolicyVersionSchema.parse({
    version:numeric(row.version,'economy policy version'),
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
}

export function policyValuesOf(version:EconomyPolicyVersion):EconomyPolicyValues{
  return EconomyPolicyValuesSchema.parse({
    energyMax:version.energyMax,
    energyRegenSeconds:version.energyRegenSeconds,
    activityEnergyCost:version.activityEnergyCost,
    diamondToLuminousStoneRate:version.diamondToLuminousStoneRate,
    firstClearLuminousStones:version.firstClearLuminousStones,
    bossFirstClearLuminousStones:version.bossFirstClearLuminousStones,
    gachaSingleCostCoins:version.gachaSingleCostCoins,
    gachaSingleCostLuminousStones:version.gachaSingleCostLuminousStones,
    gachaDisclosure:version.gachaDisclosure,
  });
}

export class EconomyPolicyStore{
  async activeRow(tx:Queryable,lock=false){
    const row=(await tx.query<ActiveRow>(
      `SELECT version,revision,updated_by,updated_at FROM pet_economy_policy_active WHERE singleton=true${lock?' FOR UPDATE':''}`,
    )).rows[0];
    if(!row)return undefined;
    return Object.freeze({
      version:numeric(row.version,'active economy policy version'),
      revision:numeric(row.revision,'active economy policy revision'),
      updatedBy:row.updated_by,
      updatedAt:row.updated_at,
    });
  }

  async readVersion(tx:Queryable,version:number):Promise<EconomyPolicyVersion|undefined>{
    const row=(await tx.query<PolicyRow>(
      `SELECT version,energy_max,energy_regen_seconds,activity_energy_cost,
              diamond_to_luminous_stone_rate,first_clear_luminous_stones,
              boss_first_clear_luminous_stones,gacha_single_cost_coins,
              gacha_single_cost_luminous_stones,gacha_disclosure,reason,published_by,published_at
         FROM pet_economy_policy WHERE version=$1`,
      [version],
    )).rows[0];
    return row?mapVersion(row):undefined;
  }

  async overview(tx:Queryable):Promise<EconomyPolicyOverview>{
    const activeRow=await this.activeRow(tx);
    if(!activeRow)return EconomyPolicyOverviewSchema.parse({
      schemaVersion:1,activeVersion:null,activeRevision:0,updatedBy:null,updatedAt:null,active:null,versions:[],
    });
    const rows=(await tx.query<PolicyRow>(
      `SELECT version,energy_max,energy_regen_seconds,activity_energy_cost,
              diamond_to_luminous_stone_rate,first_clear_luminous_stones,
              boss_first_clear_luminous_stones,gacha_single_cost_coins,
              gacha_single_cost_luminous_stones,gacha_disclosure,reason,published_by,published_at
         FROM pet_economy_policy ORDER BY version DESC LIMIT 200`,
    )).rows.map(mapVersion);
    const active=rows.find(row=>row.version===activeRow.version)??await this.readVersion(tx,activeRow.version);
    if(!active)throw new Error('Active economy policy version row is missing');
    return EconomyPolicyOverviewSchema.parse({
      schemaVersion:1,
      activeVersion:activeRow.version,
      activeRevision:activeRow.revision,
      updatedBy:activeRow.updatedBy,
      updatedAt:activeRow.updatedAt.toISOString(),
      active,
      versions:rows,
    });
  }

  async nextVersion(tx:Queryable):Promise<number>{
    const row=(await tx.query<{next:unknown}>('SELECT COALESCE(MAX(version),0)+1 AS next FROM pet_economy_policy')).rows[0];
    if(!row)throw new Error('Next economy policy version is missing');
    return numeric(row.next,'next economy policy version');
  }

  async insertVersion(tx:Queryable,input:Readonly<{
    version:number;
    policy:EconomyPolicyValues;
    reason:string;
    actor:string;
  }>):Promise<EconomyPolicyVersion>{
    const {policy}=input;
    const row=(await tx.query<PolicyRow>(
      `INSERT INTO pet_economy_policy(
         version,energy_max,energy_regen_seconds,activity_energy_cost,
         diamond_to_luminous_stone_rate,first_clear_luminous_stones,
         boss_first_clear_luminous_stones,gacha_single_cost_coins,
         gacha_single_cost_luminous_stones,gacha_disclosure,reason,published_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
       RETURNING version,energy_max,energy_regen_seconds,activity_energy_cost,
                 diamond_to_luminous_stone_rate,first_clear_luminous_stones,
                 boss_first_clear_luminous_stones,gacha_single_cost_coins,
                 gacha_single_cost_luminous_stones,gacha_disclosure,reason,published_by,published_at`,
      [
        input.version,policy.energyMax,policy.energyRegenSeconds,policy.activityEnergyCost,
        policy.diamondToLuminousStoneRate,policy.firstClearLuminousStones,
        policy.bossFirstClearLuminousStones,policy.gachaSingleCostCoins,
        policy.gachaSingleCostLuminousStones,JSON.stringify(policy.gachaDisclosure),
        input.reason,input.actor,
      ],
    )).rows[0];
    if(!row)throw new Error('Failed to insert economy policy version');
    return mapVersion(row);
  }

  async setActive(tx:Queryable,input:Readonly<{version:number;expectedRevision:number;actor:string}>):Promise<number|undefined>{
    if(input.expectedRevision===0){
      const inserted=(await tx.query<{revision:unknown}>(
        `INSERT INTO pet_economy_policy_active(singleton,version,revision,updated_by)
         VALUES(true,$1,1,$2) ON CONFLICT(singleton) DO NOTHING RETURNING revision`,
        [input.version,input.actor],
      )).rows[0];
      return inserted?numeric(inserted.revision,'active economy policy revision'):undefined;
    }
    const updated=(await tx.query<{revision:unknown}>(
      `UPDATE pet_economy_policy_active
          SET version=$1,revision=revision+1,updated_by=$2,updated_at=clock_timestamp()
        WHERE singleton=true AND revision=$3
       RETURNING revision`,
      [input.version,input.actor,input.expectedRevision],
    )).rows[0];
    return updated?numeric(updated.revision,'active economy policy revision'):undefined;
  }

  async replayByFingerprint(tx:Queryable,fingerprint:string){
    const row=(await tx.query<{payload_sha256:string;result:unknown}>(
      'SELECT payload_sha256,result FROM pet_economy_policy_audit WHERE fingerprint=$1',
      [fingerprint],
    )).rows[0];
    return row;
  }

  async appendAudit(tx:Queryable,input:Readonly<{
    version:number;
    action:'publish'|'rollback';
    actor:string;
    fingerprint:string;
    payloadSha256:string;
    reason:string;
    beforeVersion:number|null;
    afterVersion:number;
    snapshot:EconomyPolicyValues;
    result:unknown;
    seal:(purpose:string,value:unknown)=>string;
  }>):Promise<void>{
    const prevRow=(await tx.query<{event_hash:string}>('SELECT event_hash FROM pet_economy_policy_audit ORDER BY sequence DESC LIMIT 1')).rows[0];
    const previousHash=prevRow?.event_hash??'0'.repeat(64);
    const occurredAt=(await tx.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0]!.at;
    const event=[
      input.version,input.action,input.actor,input.fingerprint,input.payloadSha256,
      input.reason,input.beforeVersion,input.afterVersion,input.snapshot,
      occurredAt.toISOString(),previousHash,
    ];
    const eventHash=input.seal('economy-policy-audit',event);
    await tx.query(
      `INSERT INTO pet_economy_policy_audit(
         version,action,actor,fingerprint,payload_sha256,reason,
         before_version,after_version,snapshot,result,occurred_at,previous_hash,event_hash
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,
      [
        input.version,input.action,input.actor,input.fingerprint,input.payloadSha256,
        input.reason,input.beforeVersion,input.afterVersion,
        JSON.stringify(input.snapshot),JSON.stringify(input.result),
        occurredAt,previousHash,eventHash,
      ],
    );
  }

  async audit(tx:Queryable,limit=50):Promise<EconomyPolicyAudit>{
    const rows=(await tx.query<AuditRow>(
      `SELECT sequence,version,action,actor,reason,before_version,after_version,
              snapshot,occurred_at,previous_hash,event_hash
         FROM pet_economy_policy_audit ORDER BY sequence DESC LIMIT $1`,
      [Math.min(Math.max(limit,1),100)],
    )).rows;
    return EconomyPolicyAuditSchema.parse({
      events:rows.map(row=>({
        sequence:String(row.sequence),
        version:numeric(row.version,'economy audit version'),
        action:row.action,
        actor:row.actor,
        reason:row.reason,
        beforeVersion:row.before_version===null||row.before_version===undefined?null:numeric(row.before_version,'economy audit beforeVersion'),
        afterVersion:numeric(row.after_version,'economy audit afterVersion'),
        snapshot:row.snapshot,
        occurredAt:row.occurred_at.toISOString(),
        previousHash:row.previous_hash,
        eventHash:row.event_hash,
      })),
    });
  }
}
