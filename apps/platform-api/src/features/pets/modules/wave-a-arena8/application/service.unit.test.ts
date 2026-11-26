import {describe,expect,it} from 'vitest';
import {encounterPairComplete} from './service';

describe('Arena8 map completion',()=>{
  it('does not clear a map from a regular encounter alone',()=>{
    expect(encounterPairComplete(['cinder-terraces-regular'],'cinder-terraces')).toBe(false);
  });
  it('does not clear a map from a boss encounter alone',()=>{
    expect(encounterPairComplete(['cinder-terraces-boss'],'cinder-terraces')).toBe(false);
  });
  it('clears after regular then boss',()=>{
    expect(encounterPairComplete(['cinder-terraces-regular','cinder-terraces-boss'],'cinder-terraces')).toBe(true);
  });
  it('clears after boss then regular',()=>{
    expect(encounterPairComplete(['cinder-terraces-boss','cinder-terraces-regular'],'cinder-terraces')).toBe(true);
  });
  it('does not let another map satisfy the pair',()=>{
    expect(encounterPairComplete(['tideglass-lagoon-regular','tideglass-lagoon-boss'],'cinder-terraces')).toBe(false);
  });
});
