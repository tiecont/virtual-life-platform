import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contrastRatio,palette} from './audit.mjs';
test('opaque contrast endpoints, symmetry and supplied text contrast are reproducible',()=>{
  assert.equal(contrastRatio('#000000','#FFFFFF'),21);assert.equal(contrastRatio('#123456','#123456'),1);
  assert.equal(contrastRatio(palette.inkNavy,palette.mistWhite),contrastRatio(palette.mistWhite,palette.inkNavy));
  assert(contrastRatio(palette.inkNavy,palette.mistWhite)>=4.5);
  assert(contrastRatio(palette.auroraBlue,palette.mistWhite)<4.5);
  assert.throws(()=>contrastRatio('#FFFFFF80','#FFFFFF'));
});
