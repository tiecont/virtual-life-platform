import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,relative} from 'node:path';

const root=process.cwd();
const base='assets/characters/icarus/white-gold-study';
const out=join(root,base,'round5-bindings');
const authoring=join(out,'authoring');
const actions=[
  ['idle','intro'],
  ['world_walk_or_hover','intro'],
  ['world_follow','intro'],
  ['emote','intro'],
  ['summon','intro'],
  ['normal_sword_hit','normal'],
  ['damage_reaction','normal'],
  ['defend','normal'],
  ['status_affected','normal'],
  ['rage_sword_100','rage'],
  ['victory','rage'],
  ['defeat','rage'],
  ['signature_skill_windup','signature'],
  ['signature_skill_cast','signature'],
  ['ultimate_cut_in','signature'],
  ['ultimate_impact','signature'],
];

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const textBytes=text=>Buffer.from(text,'utf8');
const portablePath=file=>relative(root,file).split('\\').join('/');

function anim(action,family,index){
  const duration=family==='intro'?1.2:family==='normal'?.65:family==='rage'?1.05:1.4;
  const lift=(index+1)*0.0025;
  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!74 &7400000
AnimationClip:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: Icarus_${action}
  serializedVersion: 7
  m_Legacy: 0
  m_Compressed: 0
  m_UseHighQualityCurve: 1
  m_RotationCurves: []
  m_CompressedRotationCurves: []
  m_EulerCurves:
  - curve:
      serializedVersion: 2
      m_Curve:
      - serializedVersion: 3
        time: 0
        value: {x: 0, y: 0, z: 0}
        inSlope: {x: 0, y: 0, z: 0}
        outSlope: {x: 0, y: 0, z: 0}
        tangentMode: 0
        weightedMode: 0
        inWeight: 0.33333334
        outWeight: 0.33333334
      - serializedVersion: 3
        time: ${duration.toFixed(3)}
        value: {x: 0, y: 0, z: ${lift.toFixed(4)}}
        inSlope: {x: 0, y: 0, z: 0}
        outSlope: {x: 0, y: 0, z: 0}
        tangentMode: 0
        weightedMode: 0
        inWeight: 0.33333334
        outWeight: 0.33333334
    path: ''
  m_PositionCurves: []
  m_ScaleCurves: []
  m_FloatCurves: []
  m_PPtrCurves: []
  m_SampleRate: 60
  m_WrapMode: 0
  m_Bounds:
    m_Center: {x: 0, y: 0, z: 0}
    m_Extent: {x: 0, y: 0, z: 0}
  m_ClipBindingConstant:
    genericBindings: []
    pptrCurveMapping: []
  m_AnimationClipSettings:
    serializedVersion: 2
    m_AdditiveReferencePoseClip: {fileID: 0}
    m_AdditiveReferencePoseTime: 0
    m_StartTime: 0
    m_StopTime: ${duration.toFixed(3)}
    m_OrientationOffsetY: 0
    m_Level: 0
    m_CycleOffset: 0
    m_HasAdditiveReferencePose: 0
    m_LoopTime: ${family==='intro'||family==='normal' ? 1 : 0}
    m_LoopBlend: 0
    m_LoopBlendOrientation: 0
    m_LoopBlendPositionY: 0
    m_LoopBlendPositionXZ: 0
    m_KeepOriginalOrientation: 0
    m_KeepOriginalPositionY: 1
    m_KeepOriginalPositionXZ: 0
    m_HeightFromFeet: 0
    m_Mirror: 0
  m_EditorCurves: []
  m_EulerEditorCurves: []
  m_HasGenericRootTransform: 0
  m_HasMotionFloatCurves: 0
  m_Events: []
`;
}

function vfx(action,family,index){
  return JSON.stringify({
    schemaVersion:1,
    assetType:'icarus-presentation-vfx',
    action,
    family,
    cue:family==='signature'?'FIRE_ZONE':`ICARUS_${family.toUpperCase()}`,
    intensity:family==='intro'?0.25:family==='normal'?0.55:family==='rage'?0.8:1,
    durationSeconds:family==='intro'?1.2:family==='normal'?.65:family==='rage'?1.05:1.4,
    palette:family==='signature'?'phoenix-gold':'warm-fire',
    authoredIndex:index,
    rights:'PENDING_REVIEW',
    runtimeEnabled:false,
    productionReady:false,
  },null,2)+'\n';
}

function wav(action,index){
  const sampleRate=48000;
  const samples=Math.floor(sampleRate*0.12);
  const data=Buffer.alloc(samples*2);
  const frequency=260+(index*23);
  for(let i=0;i<samples;i++){
    const envelope=Math.min(1,i/2400,(samples-i)/2400);
    const sample=Math.round(Math.sin(2*Math.PI*frequency*i/sampleRate)*envelope*2200);
    data.writeInt16LE(sample,i*2);
  }
  const header=Buffer.alloc(44);
  header.write('RIFF',0);header.writeUInt32LE(36+data.length,4);header.write('WAVE',8);
  header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);
  header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*2,28);
  header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
  return Buffer.concat([header,data]);
}

async function write(path,bytes){
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,bytes);
  return {path:portablePath(path),sha256:sha256(bytes)};
}

const sourcePath=join(authoring,'round5-binding-source.json');
const importPath=join(authoring,'round5-import-settings.json');
const sourceFile=await write(sourcePath,textBytes(JSON.stringify({
  schemaVersion:1,
  assetType:'icarus-round5-binding-source',
  petId:'pet-v3-fire-icarus',
  signatureOpcode:'FIRE_ZONE',
  canonicalProfile:'specs/pet-arena/v3.1/data/limited_animation_profiles.json',
  sourceModel:'assets/characters/icarus/white-gold-study/icarus-blockout.blend',
  authoredBy:'Codex local authoring pack',
  actionFamilies:Object.fromEntries(actions.map(([action,family])=>[action,family])),
  rights:'PENDING_REVIEW',
  runtimeEnabled:false,
  productionReady:false,
},null,2)+'\n'));
const importSettingsFile=await write(importPath,textBytes(JSON.stringify({
  schemaVersion:1,
  importer:'Unity 6000.3.14f1 / Generic AnimationClip and local presentation descriptors',
  source:portablePath(sourcePath),
  actions:actions.map(([action])=>action),
  vfxFormat:'JSON cue descriptor consumed by presentation binding review',
  audioFormat:'PCM 16-bit mono WAV, 48kHz, locally authored tone cues',
  rights:'PENDING_REVIEW',
  runtimeEnabled:false,
  productionReady:false,
},null,2)+'\n'));
const source={
  path:sourceFile.path,
  sha256:sourceFile.sha256,
  origin:'generated',
  author:'Codex local authoring pack',
  provenanceRef:'assets/characters/icarus/white-gold-study/README.md',
  rights:'PENDING_REVIEW',
};
const importSettings={path:importSettingsFile.path,sha256:importSettingsFile.sha256};

const assets=[];
for(let index=0;index<actions.length;index++){
  const [action,family]=actions[index];
  const clip=await write(join(out,'clips',`${action}.anim`),textBytes(anim(action,family,index)));
  const effect=await write(join(out,'vfx',`${action}.vfx.json`),textBytes(vfx(action,family,index)));
  const audio=await write(join(out,'audio',`${action}.wav`),wav(action,index));
  for(const [kind,entry] of [['clip',clip],['vfx',effect],['audio',audio]]){
    assets.push({
      id:`icarus-${action.replaceAll('_','-')}-${kind}`,
      kind,
      path:entry.path,
      sha256:entry.sha256,
      source,
      importSettings,
    });
  }
}
const bindingsPath=join(root,base,'bindings.json');
const bindings=JSON.parse(await readFile(bindingsPath,'utf8'));
const pet=bindings.pets.find(entry=>entry.petId==='pet-v3-fire-icarus');
if(!pet) throw new Error('Icarus binding entry missing');
const byAction=new Map();
for(let index=0;index<actions.length;index++){
  const action=actions[index][0];
  byAction.set(action,{
    clip:`icarus-${action.replaceAll('_','-')}-clip`,
    vfx:`icarus-${action.replaceAll('_','-')}-vfx`,
    audio:`icarus-${action.replaceAll('_','-')}-audio`,
  });
}
for(const animation of pet.animations){
  const refs=byAction.get(animation.action);
  if(!refs) throw new Error(`Missing authored action ${animation.action}`);
  Object.assign(animation,refs);
}
const assetIds=new Set(assets.map(asset=>asset.id));
bindings.assets=bindings.assets.filter(asset=>!assetIds.has(asset.id));
bindings.assets.push(...assets);
await writeFile(bindingsPath,JSON.stringify(bindings,null,2)+'\n');
console.log(JSON.stringify({actions:actions.map(([action])=>action),assetsAdded:assets.length,bindingsPath:portablePath(bindingsPath)},null,2));
