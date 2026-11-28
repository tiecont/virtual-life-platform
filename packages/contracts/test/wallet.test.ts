import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {
  EconomyPolicyPublishSchema,
  FourResourceWalletSchema,
  WalletConvertInputSchema,
  WalletConvertReceiptSchema,
} from '../src';

describe('wave D4 wallet and economy authority contracts',()=>{
  it('validates four-resource wallet, strict conversion input, and rejects non-1:1 rates',()=>{
    expect(FourResourceWalletSchema.safeParse({
      schemaVersion:1,
      energy:{current:180,max:180,regenSeconds:300,nextRegenSeconds:0},
      premiumDiamonds:250,
      coins:8000,
      luminousStones:120,
      conversionPolicy:{enabled:true,from:'premiumDiamonds',to:'luminousStones',inputUnit:1,outputUnit:1},
    }).success).toBe(true);

    const requestId=randomUUID();
    expect(WalletConvertInputSchema.safeParse({requestId,premiumDiamonds:50}).success).toBe(true);
    for(const bad of [0,-1,1.5,1_000_000_001,Number.NaN,Number.POSITIVE_INFINITY]){
      expect(WalletConvertInputSchema.safeParse({requestId,premiumDiamonds:bad}).success).toBe(false);
    }
    expect(WalletConvertInputSchema.safeParse({requestId,premiumDiamonds:10,rate:2}).success).toBe(false);

    const validPublish={
      requestId,
      expectedActiveRevision:1,
      reason:'TUNE_ENERGY_MAX',
      policy:{
        energyMax:180,
        energyRegenSeconds:300,
        activityEnergyCost:0,
        diamondToLuminousStoneRate:1,
        firstClearLuminousStones:60,
        bossFirstClearLuminousStones:120,
        gachaSingleCostCoins:100,
        gachaSingleCostLuminousStones:160,
        gachaDisclosure:{
          featuredPetId:'pet-v3-fire-icarus',
          softPityAt:60,
          hardPityAt:80,
          baseSProbabilityPpm:8000,
          featuredProbabilityPpm:500000,
          guaranteedFeaturedAfterOffRate:true,
          duplicateExp:200,
          missExp:25,
          realMoneyPurchasesEnabled:false,
          summary:'Base S rate 0.8%, soft pity 60, hard pity 80.',
        },
      },
    };
    expect(EconomyPolicyPublishSchema.safeParse(validPublish).success).toBe(true);
    expect(EconomyPolicyPublishSchema.safeParse({
      ...validPublish,
      policy:{...validPublish.policy,diamondToLuminousStoneRate:2},
    }).success).toBe(false);
    expect(EconomyPolicyPublishSchema.safeParse({
      ...validPublish,
      policy:{...validPublish.policy,gachaDisclosure:{...validPublish.policy.gachaDisclosure,realMoneyPurchasesEnabled:true}},
    }).success).toBe(false);
  });

  it('validates a conversion receipt and rejects invalid or private balances',()=>{
    const receipt={
      receiptId:randomUUID(),
      requestId:randomUUID(),
      debitedPremiumDiamonds:40,
      creditedLuminousStones:40,
      wallet:{
        schemaVersion:1,
        energy:{current:180,max:180,regenSeconds:300,nextRegenSeconds:0},
        premiumDiamonds:60,
        coins:8000,
        luminousStones:40,
        conversionPolicy:{enabled:true,from:'premiumDiamonds',to:'luminousStones',inputUnit:1,outputUnit:1},
      },
    };
    expect(WalletConvertReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(WalletConvertReceiptSchema.safeParse({...receipt,creditedLuminousStones:0}).success).toBe(false);
    expect(WalletConvertReceiptSchema.safeParse({...receipt,wallet:{...receipt.wallet,premiumDiamonds:-1}}).success).toBe(false);
    expect(WalletConvertReceiptSchema.safeParse({...receipt,wallet:{...receipt.wallet,accountId:randomUUID()}}).success).toBe(false);
  });
});
