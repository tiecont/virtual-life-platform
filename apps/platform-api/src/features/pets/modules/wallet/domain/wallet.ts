import {createHash} from 'node:crypto';

export const MAX_CONVERSION_DIAMONDS=1_000_000_000;
export const MAX_SAFE_BALANCE=Number.MAX_SAFE_INTEGER;

export type LazyEnergyResult=Readonly<{
  current:number;
  gained:number;
  nextUpdatedAtMs:number;
  nextRegenSeconds:number;
}>;

export function computeLazyEnergy(
  storedCurrent:number,
  updatedAtMs:number,
  nowMs:number,
  max:number,
  regenSeconds:number,
):LazyEnergyResult{
  if(!Number.isSafeInteger(storedCurrent)||storedCurrent<0)throw new Error('Invalid wallet energy');
  if(!Number.isFinite(updatedAtMs)||!Number.isFinite(nowMs))throw new Error('Invalid wallet timestamp');
  if(!Number.isSafeInteger(max)||max<1)throw new Error('Invalid energy max policy');
  if(!Number.isSafeInteger(regenSeconds)||regenSeconds<10)throw new Error('Invalid energy regen policy');
  if(storedCurrent>=max){
    return Object.freeze({
      current:storedCurrent,
      gained:0,
      nextUpdatedAtMs:Math.max(updatedAtMs,nowMs),
      nextRegenSeconds:0,
    });
  }
  const elapsedMs=Math.max(0,nowMs-updatedAtMs);
  const stepMs=regenSeconds*1000;
  const rawTicks=Math.floor(elapsedMs/stepMs);
  const gained=Math.min(max-storedCurrent,rawTicks);
  const current=storedCurrent+gained;
  if(current>=max){
    return Object.freeze({
      current,
      gained,
      nextUpdatedAtMs:nowMs,
      nextRegenSeconds:0,
    });
  }
  const nextUpdatedAtMs=updatedAtMs+gained*stepMs;
  const remMs=Math.max(0,nowMs-nextUpdatedAtMs);
  const nextRegenSeconds=Math.max(1,Math.min(regenSeconds,Math.ceil((stepMs-remMs)/1000)));
  return Object.freeze({current,gained,nextUpdatedAtMs,nextRegenSeconds});
}

export type DiamondConversionResult=
  | Readonly<{ok:true;nextDiamonds:number;nextStones:number;credited:number}>
  | Readonly<{ok:false;reason:'INVALID'|'INSUFFICIENT_PREMIUM_DIAMONDS'|'OVERFLOW'}>;

export function computeDiamondConversion(
  currentDiamonds:number,
  currentStones:number,
  amount:number,
  rate:number,
):DiamondConversionResult{
  if(rate!==1||!Number.isSafeInteger(amount)||amount<1||amount>MAX_CONVERSION_DIAMONDS){
    return Object.freeze({ok:false,reason:'INVALID'});
  }
  if(!Number.isSafeInteger(currentDiamonds)||currentDiamonds<0||!Number.isSafeInteger(currentStones)||currentStones<0){
    return Object.freeze({ok:false,reason:'OVERFLOW'});
  }
  if(currentDiamonds<amount){
    return Object.freeze({ok:false,reason:'INSUFFICIENT_PREMIUM_DIAMONDS'});
  }
  const credited=amount*rate;
  if(currentStones>MAX_SAFE_BALANCE-credited){
    return Object.freeze({ok:false,reason:'OVERFLOW'});
  }
  return Object.freeze({
    ok:true,
    nextDiamonds:currentDiamonds-amount,
    nextStones:currentStones+credited,
    credited,
  });
}

export function conversionPayloadSha256(premiumDiamonds:number):string{
  return createHash('sha256').update(JSON.stringify({
    operation:'diamond_to_stone_conversion',
    premiumDiamonds,
  })).digest('hex');
}
