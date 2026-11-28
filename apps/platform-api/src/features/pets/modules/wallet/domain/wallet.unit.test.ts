import {describe,expect,it} from 'vitest';
import {
  computeDiamondConversion,
  computeLazyEnergy,
  conversionPayloadSha256,
  MAX_CONVERSION_DIAMONDS,
  MAX_SAFE_BALANCE,
} from './wallet';

describe('wallet pure domain rules',()=>{
  it('computes lazy energy regeneration with capped upper bound and remainder preservation',()=>{
    const start=1_700_000_000_000;
    expect(computeLazyEnergy(180,start,start+900_000,180,300)).toEqual({
      current:180,gained:0,nextUpdatedAtMs:start+900_000,nextRegenSeconds:0,
    });
    expect(computeLazyEnergy(240,start,start+900_000,180,300)).toEqual({
      current:180,gained:0,nextUpdatedAtMs:start+900_000,nextRegenSeconds:0,
    });
    expect(computeLazyEnergy(100,start,start+450_000,180,300)).toEqual({
      current:101,gained:1,nextUpdatedAtMs:start+300_000,nextRegenSeconds:150,
    });
    expect(computeLazyEnergy(179,start,start+600_000,180,300)).toEqual({
      current:180,gained:1,nextUpdatedAtMs:start+600_000,nextRegenSeconds:0,
    });
  });

  it('enforces 1:1 diamond-to-stone conversion bounds, balances and overflow limits',()=>{
    expect(computeDiamondConversion(500,120,200,1)).toEqual({
      ok:true,nextDiamonds:300,nextStones:320,credited:200,
    });
    expect(computeDiamondConversion(50,0,51,1)).toEqual({ok:false,reason:'INSUFFICIENT_PREMIUM_DIAMONDS'});
    expect(computeDiamondConversion(100,MAX_SAFE_BALANCE-5,6,1)).toEqual({ok:false,reason:'OVERFLOW'});
    expect(computeDiamondConversion(100,0,0,1)).toEqual({ok:false,reason:'INVALID'});
    expect(computeDiamondConversion(MAX_CONVERSION_DIAMONDS+10,0,MAX_CONVERSION_DIAMONDS+1,1)).toEqual({ok:false,reason:'INVALID'});
    expect(computeDiamondConversion(100,0,10,2)).toEqual({ok:false,reason:'INVALID'});
  });

  it('produces distinct sha256 payload fingerprints for distinct amounts',()=>{
    expect(conversionPayloadSha256(10)).toBe(conversionPayloadSha256(10));
    expect(conversionPayloadSha256(10)).not.toBe(conversionPayloadSha256(11));
  });
});
