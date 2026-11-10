import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='docs/plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First';
export const palette={mistWhite:'#F8FBFF',cloudBlue:'#EAF4FF',auroraBlue:'#4B91FF',irisPurple:'#8168E9',sakuraPink:'#F6A2C1',mintSprout:'#69D7BA',sunshineGold:'#F5CB74',inkNavy:'#1E3153',softSlate:'#50627C',coralAlert:'#C64B55'};
export function contrastRatio(a,b) {
  const luminance=hex=>{
    assert(/^#[0-9a-f]{6}$/i.test(hex),'Expected opaque RGB hex');
    const rgb=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(s=>s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4);
    return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  };
  const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export async function inspectBrand() {
  const paths=['03-design/BRAND-AND-UI.md','08-references/PROVENANCE.md','07-visuals/VirtualLife-logo.svg','07-visuals/VirtualLife-logo-preview.png','07-visuals/VirtualLife-app-icon.svg','07-visuals/VirtualLife-app-icon-512.png','07-visuals/VirtualLife-key-art-concept.webp'];
  const assets=[];for(const path of paths){const bytes=await readFile(root+'/'+path);assets.push({ref:root+'/'+path,sha256:createHash('sha256').update(bytes).digest('hex'),status:'SUPPLIED_CONCEPT_NOT_PRODUCTION_APPROVED'});}
  const logo=await readFile(root+'/07-visuals/VirtualLife-logo.svg','utf8');
  assert(/>Virtual<tspan[^>]*>Life<\/tspan>/.test(logo),'Unexpected logo wordmark spelling');
  const pairs=[];
  for(const background of ['mistWhite','cloudBlue'])for(const foreground of Object.keys(palette)) {
    const ratio=contrastRatio(palette[foreground],palette[background]);
    pairs.push({foreground,background,ratio:Number(ratio.toFixed(4)),normalTextAA:ratio>=4.5,largeTextAA:ratio>=3,opaqueOnly:true});
  }
  return {schemaVersion:1,taskId:'VL-006',result:'CONCEPT_AUDIT_PENDING_OWNER_AND_RIGHTS_REVIEW',acceptanceMet:false,
    wordmark:{exactText:'VirtualLife',svgTextChecked:true,visualOwnerReview:'PENDING'},palette,pairs,assets,
    ownerStyleApproval:false,commercialRightsApproval:false,trademarkClearance:false,
    missingEvidence:['Owner approval of style sheet/logo/icon and light/dark small-size review',
      'Rights/provenance review for commercial logo/key-art/fonts and trademark/domain checks'],
    limitations:['Opaque sRGB palette calculations only; actual alpha/glass/backdrop/focus/disabled states need rendered checks.',
      'Logo/text exemption does not make an accent suitable for body copy or controls.',
      'AI key art and supplied mockups are concepts, not Unity runtime screenshots or licensed production assets.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await inspectBrand(),null,2));
