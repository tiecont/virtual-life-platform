'use client';
import {useEffect,useRef,useState} from 'react';
import {
 GameplayConfigAuditSchema,GameplayConfigMutationSchema,GameplayConfigOverviewSchema,
 GameplayConfigPublishResultSchema,GameplayConfigRollbackResultSchema,GameplayConfigValidationSchema,GameplayConfigVersionViewSchema,
 gameplayEngineBinding,GameplaySimulationPolicySchema,GameplaySimulationResultSchema,type EngineGameplaySimulationReport,type GameplayBundle,type GameplaySimulationPolicy,type GameplaySimulationParty,
} from '@aetheria/contracts';
import {SkillTrainingEditor} from './skill-training-editor';
import {initialParty,SimulationParty} from './simulation-party';
import {bundleDifferences,type BundleDifference} from './bundle-diff';

type Overview=ReturnType<typeof GameplayConfigOverviewSchema.parse>;
type Version=ReturnType<typeof GameplayConfigVersionViewSchema.parse>;
type Audit=ReturnType<typeof GameplayConfigAuditSchema.parse>;
type Request=(action:string,body?:unknown,signal?:AbortSignal)=>Promise<unknown>;
type SimulationResult=ReturnType<typeof GameplaySimulationResultSchema.parse>;
const RULESET='arena8-coop-pve';

function read(source:unknown,path:readonly string[]):unknown{
 let current=source;
 for(const key of path){
  if(!current||typeof current!=='object')return undefined;
  current=Array.isArray(current)?current[Number(key)]:(current as Record<string,unknown>)[key];
 }
 return current;
}
function display(source:unknown,...path:string[]){
 const value=read(source,path);
 return typeof value==='string'||typeof value==='number'?String(value):'—';
}
function write(source:GameplayBundle,path:readonly string[],value:unknown):GameplayBundle{
 const copy=structuredClone(source) as Record<string,unknown>;
 const parent=read(copy,path.slice(0,-1));
 if(!parent||typeof parent!=='object'||Array.isArray(parent))return source;
 const key=path[path.length-1]!;
 if(value===undefined)delete (parent as Record<string,unknown>)[key];
 else (parent as Record<string,unknown>)[key]=value;
 return copy;
}
function Num({label,value,onChange,step=1,min=0,max}:{label:string;value:unknown;onChange:(value:number)=>void;step?:number;min?:number;max?:number}){
 const number=typeof value==='number'?value:0;
 return <label>{label}<input className="aetheria-field" type="number" step={step} min={min} max={max} value={number} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=min&&(max===undefined||next<=max))onChange(next);}}/></label>;
}

const functionalTileLabels={
 sword:'Strike',mana:'Mana',rage:'Rage',heart:'Vitality',shield:'Aegis',special:'Soul',
 nature:'Nature',frost:'Frost',astral:'Astral',
};
const functionalTargets=[
 ['self','Acting Pet'],
 ['lowest-hp-ally','Living ally with lowest HP percentage'],
 ['all-allies','All living allies'],
] as const;

function AdvancedJewelEditor({bundle,editable,change}:{
 bundle:GameplayBundle;editable:boolean;change:(path:readonly string[],value:unknown)=>void;
}){
 const policy=read(bundle,['advancedJewels']);
 const historical=bundle.schemaVersion===5;
 if((!historical&&bundle.schemaVersion!==6)||!policy)return null;
 const control=(key:string,label:string)=>{
  const value=read(policy,[key]);
  return typeof value==='number' && <Num label={label} value={value} onChange={n=>change(['advancedJewels',key],n)}/>;
 };
 const tierControls=(key:string,label:string)=>{
  const values=read(policy,[key]);
  if(!Array.isArray(values)||values.length!==3)return null;
  return values.map((value,index)=><Num key={index} label={label+' · match '+['3','4','5+'][index]}
   value={value} onChange={n=>change(['advancedJewels',key],values.map((old,j)=>index===j?n:old))}/>);
 };
 const encounters=read(policy,['encounters']);
 function conversion(path:string[],label:string){
  const data=read(bundle,path),kind=read(data,['kind']),count=read(data,['count']);
  if(typeof kind!=='string'||typeof count!=='number')return null;
  return <div className="fields"><label>{label} jewel<select className="aetheria-field" value={kind}
   onChange={event=>change([...path,'kind'],event.target.value)}>
   {['nature','frost','astral'].map(id=><option key={id}>{id}</option>)}</select></label>
   <Num label={label+' conversion count'} value={count} onChange={n=>change([...path,'count'],n)}/></div>;
 }
 return <section><h3>{historical?'Advanced jewel experiment':'Advanced jewel effects'}</h3>
  <fieldset disabled={!editable}><legend>{historical?'Authored conversions and match effects':'Natural jewel match effects'}</legend>
   <div className="fields">{historical&&control('occupancyLimit','Maximum advanced jewels on board')}
    {control('natureAllyLimitAtFive','Nature ally cleanse limit at match 5+')}
    {tierControls('natureActorLimits','Nature self cleanse limit')}
    {tierControls('frostReductionPm','Frost damage reduction (‰)')}
    {tierControls('astralUpgradeLimits','Astral upgrade count')}</div>
   {historical&&Array.isArray(encounters)&&encounters.map((encounter,i)=>{
    const id=display(encounter,'encounterId'),path=['advancedJewels','encounters',String(i)];
    const skills=read(encounter,['skills']);
    return <details key={id}><summary>{id}</summary>{conversion([...path,'opening'],'Opening')}
     {Array.isArray(skills)&&skills.map((skill,j)=><div key={j}>{conversion([...path,'skills',String(j),'conversion'],display(skill,'skillId'))}</div>)}</details>;
   })}
  </fieldset></section>;
}

function FunctionalBoardEditor({bundle,editable,change}:{
 bundle:GameplayBundle;editable:boolean;change:(path:readonly string[],value:unknown)=>void;
}){
 const sharedSpawn=bundle.schemaVersion===6;
 const path=['board','functionalTiles'];
 const tiles=read(bundle,[...path,'spawnWeights']);
 const weightTotal=Array.isArray(tiles)?tiles.reduce((sum,row)=>sum+Number(read(row,['weight'])??0),0):0;
 const manaCap=read(bundle,['resources','manaCap']),rageCap=read(bundle,['resources','rageCap']);
 const manaBound={min:1,max:typeof manaCap==='number'?manaCap:undefined};
 const rageBound={min:1,max:typeof rageCap==='number'?rageCap:undefined};
 const number=(label:string,field:string[],options?:{min?:number;max?:number})=>{
  const value=read(bundle,[...path,...field]);
  return typeof value==='number'
   ? <Num label={label} value={value} {...options} onChange={next=>change([...path,...field],next)}/>
   : null;
 };
 const target=(kind:'heart'|'shield')=>{
  const value=read(bundle,[...path,kind,'target']);
  return typeof value==='string'&&<label>{functionalTileLabels[kind]} target
   <select className="aetheria-field" value={value} onChange={event=>change([...path,kind,'target'],event.target.value)}>
    {functionalTargets.map(([id,label])=><option key={id} value={id}>{label}</option>)}
   </select>
  </label>;
 };
 return <section>
  <h3>Functional board tiles</h3>
  <p className="small muted">{sharedSpawn
   ?'All nine jewel types use the same natural distribution for every Pet.'
   :'Six basic jewel types spawn naturally. Strike uses the acting Pet’s elemental attack. Utility jewels apply their configured effects.'}</p>
  <fieldset disabled={!editable}>
   <legend>Spawn weights</legend>
   <p className="small muted">Each kind’s base spawn chance is its weight divided by the total weight.</p>
   <div className="fields">{Array.isArray(tiles)&&tiles.map((row,index)=>{
    const kind=read(row,['kind']),weight=read(row,['weight']);
    if(typeof kind!=='string'||!Object.hasOwn(functionalTileLabels,kind)||typeof weight!=='number')return null;
    const name=functionalTileLabels[kind as keyof typeof functionalTileLabels];
    const probability=weightTotal>0?(100*weight/weightTotal).toFixed(2)+'%':'—';
    return <div key={kind}>
     {number(name+' spawn weight',['spawnWeights',String(index),'weight'],{min:1})}
     <span className="small muted">{probability}</span>
    </div>;
   })}</div>
  </fieldset>
  <fieldset disabled={!editable}>
   <legend>Yield per matched tile</legend>
   <div className="fields">
    {number('Strike attack contribution (‰)',['swordContributionPm'],{min:1,max:10000})}
    {number('Mana from Mana',['manaPerTile'],manaBound)}
    {number('Rage from Rage',['ragePerTile'],rageBound)}
    {number('HP from Vitality',['heart','amount'],{min:1,max:100000})}
    {target('heart')}
    {number('Barrier from Aegis',['shield','amount'],{min:1,max:100000})}
    {target('shield')}
    {number('Barrier cap relative to target max HP (‰)',['shield','shieldCapPm'],{min:1,max:1000})}
    {number('Barrier duration (turns)',['shield','durationTurns'],{min:1,max:32})}
    {read(bundle,[...path,'special','kind'])==='resource-combo'&&<>
     {number('Mana from Soul',['special','mana'],manaBound)}
     {number('Rage from Soul',['special','rage'],rageBound)}
    </>}
   </div>
  </fieldset>
 </section>;
}

const elementNames={fire:'Fire',water:'Water',electric:'Electric',ghost:'Ghost',ground:'Ground',light:'Light'};
const elementIds=Object.keys(elementNames) as (keyof typeof elementNames)[];

function SharedElementMatrix({elements,editable,change}:{
 elements:unknown[];editable:boolean;change:(path:readonly string[],value:unknown)=>void;
}){
 return <>
  <p className="small muted" id="element-effectiveness-note">
   Attackers are rows and defenders are columns. The engine requires 100% for same-element pairs.
  </p>
  <div className="audit" tabIndex={0} role="region" aria-label="Elemental damage matrix">
   <table className="element-effectiveness">
    <caption className="aetheria-sr-only">Elemental effectiveness in percent</caption>
    <thead><tr><th scope="col">Attacker / Defender</th>
     {elementIds.map(id=><th key={id} scope="col">{elementNames[id]}</th>)}
    </tr></thead>
    <tbody>{elementIds.map(attacker=>{
     const index=elements.findIndex(profile=>read(profile,['element'])===attacker);
     const rows=read(elements[index],['effectiveness']);
     return <tr key={attacker}><th scope="row">{elementNames[attacker]}</th>{elementIds.map(defender=>{
      const column=Array.isArray(rows)?rows.findIndex(row=>read(row,['element'])===defender):-1;
      const coefficient=Array.isArray(rows)?read(rows[column],['permille']):undefined;
      return <td key={defender}>{typeof coefficient==='number'?<input
       aria-label={elementNames[attacker]+' against '+elementNames[defender]+' (%)'}
       aria-describedby="element-effectiveness-note"
       className="aetheria-field" type="number" step={0.1} min={0.1} max={300}
       disabled={!editable} value={coefficient/10}
       onChange={event=>{
        const permille=Math.round(event.target.valueAsNumber*10);
        if(Number.isSafeInteger(permille)&&permille>0&&permille<=3000){
         change(['elements',String(index),'effectiveness',String(column),'permille'],permille);
        }
       }}
      />:'—'}</td>;
     })}</tr>;
    })}</tbody>
   </table>
  </div>
  <fieldset disabled={!editable}><legend>Critical damage bonus against Bosses (%)</legend>
   <div className="fields">{elements.map((profile,index)=>{
    const value=read(profile,['bossCritDamageBonusBp']);
    return typeof value==='number'&&<Num key={index} label={display(profile,'element')}
     min={0.01} max={100} step={0.01} value={value/100}
     onChange={next=>change(['elements',String(index),'bossCritDamageBonusBp'],Math.round(next*100))}/>;
   })}</div>
  </fieldset>
 </>;
}

function MultiplierFactors({schedule,editable,change}:{
 schedule:unknown;editable:boolean;change:(path:readonly string[],value:unknown)=>void;
}){
 if(!Array.isArray(schedule))return null;
 const stages:unknown[]=schedule;
 const tiers=new Map<number,unknown>();
 for(const stage of stages){
  const rows=read(stage,['tiers']);
  if(!Array.isArray(rows))continue;
  for(const tier of rows){
   const multiplier=read(tier,['multiplier']);
   if(typeof multiplier==='number'&&!tiers.has(multiplier))tiers.set(multiplier,tier);
  }
 }
 function update(multiplier:number,key:string,value:number){
  if(!Number.isSafeInteger(value))return;
  change(['multiplier','schedule'],stages.map(stage=>{
   if(!stage||typeof stage!=='object'||Array.isArray(stage))return stage;
   const rows=read(stage,['tiers']);
   if(!Array.isArray(rows))return stage;
   return {...stage,tiers:rows.map(tier=>read(tier,['multiplier'])===multiplier?{...tier,[key]:value}:tier)};
  }));
 }
 return <fieldset disabled={!editable}>
  <legend>Effects per multiplier tier</legend>
  <div className="fields">{[...tiers.entries()].sort(([left],[right])=>left-right).map(([multiplier,tier])=><div key={multiplier}>
   {([['damageWeightPm','attack',100000],['resourceWeightPm','utility',4294967295]] as const).map(([key,purpose,max])=>
    <Num key={key} label={'×'+multiplier+' '+purpose+' factor (‰)'} value={read(tier,[key])} max={max}
     onChange={next=>update(multiplier,key,next)}/>)}
  </div>)}</div>
 </fieldset>;
}

function encounterOptions(bundle:GameplayBundle|undefined){
 const bosses=Array.isArray(bundle?.bosses)?bundle.bosses:[bundle?.boss];
 return bosses.flatMap(boss=>{
  const id=read(boss,['id']),name=read(boss,['name']),map=read(boss,['mapId']);
  if(typeof id!=='string')return [];
  return [{id,label:[typeof name==='string'?name:id,map].filter(Boolean).join(' · ')}];
 });
}
function RecruitmentEditor({bundle,bossPath,editable,change}:{
 bundle:GameplayBundle|null;bossPath:readonly string[];editable:boolean;
 change:(path:readonly string[],value:unknown)=>void;
}){
 const mapId=read(bundle,[...bossPath,'mapId']);
 const pets=Array.isArray(bundle?.pets)&&typeof mapId==='string'?bundle.pets:[];
 const candidates=pets.flatMap(pet=>{
  const id=read(pet,['id']),name=read(pet,['catalog','name']),rarity=read(pet,['rarity']);
  if(typeof id!=='string'||read(pet,['catalog','mapId'])!==mapId||
    (rarity!=='map-regular'&&rarity!=='map-legendary'))return [];
  return [{id,name:typeof name==='string'?name:id,legendary:rarity==='map-legendary'}];
 }).sort((a,b)=>Number(a.legendary)-Number(b.legendary));
 if(!candidates.length)return null;
 const path=[...bossPath,'rewardPolicy','recruitmentPetIds'];
 const configured=read(bundle,path);
 const selected=new Set(Array.isArray(configured)?configured:[]);
 return <fieldset disabled={!editable}><legend>First map clear recruitment</legend>
  <p className="small muted">The first selected Pet the participant does not own is granted after both map encounters are cleared. Regular Pets take priority.</p>
  <div className="fields">{candidates.map(({id,name,legendary})=><label key={id}>
   <input type="checkbox" checked={selected.has(id)} onChange={event=>{
    if(event.target.checked)selected.add(id);else selected.delete(id);
    const ordered=candidates.filter(pet=>selected.has(pet.id)).map(pet=>pet.id);
    change(path,ordered.length?ordered:undefined);
   }}/> {name}{legendary?' (Legendary)':''}
  </label>)}</div>
 </fieldset>;
}

function SimulationResults({result}:{result:SimulationResult}){
 const reports:EngineGameplaySimulationReport[]='reports' in result?result.reports:[result];
 const digest=reports[0]?.contentDigest;
 return <>
  <p className="small muted">Version {result.version} · {result.seeds} seeds per row · <code title={digest}>{digest?.slice(0,16)}</code></p>
  <div className="audit simulation-results" tabIndex={0} role="region" aria-label="Cooperative simulation results"><table>
   <caption>Cooperative simulation results</caption>
   <thead><tr><th>Encounter</th><th>Policy</th><th>Win rate</th><th>Wins</th><th>Losses</th><th>Unresolved</th><th>Phase two reached</th><th>Avg. actions after transformation</th><th>Multiplier seen</th><th>Multiplier swaps</th><th>Critical hits</th><th>Casts</th><th>Mana spent</th><th>Rage spent</th><th>Avg. rounds</th><th>Avg. actions</th><th>Avg. simulated time</th></tr></thead>
   <tbody>{reports.map(row=><tr key={row.bossId+':'+row.policy}>
    <td>{row.bossId}</td><td>{row.policy}</td><td>{(row.wins/row.seeds*100).toFixed(1)}%</td>
    <td>{row.wins}</td><td>{row.losses}</td><td>{row.unresolved}</td><td>{row.phaseTwoReached}</td><td>{row.phaseTwoReached>0&&row.phaseTwoActions!==undefined?(row.phaseTwoActions/row.phaseTwoReached).toFixed(1):"—"}</td><td>{row.matchesWithMultiplier}</td>
    <td>{row.swapsUsingVisibleMultiplier??"—"}</td><td>{row.playerCriticals??"—"}</td><td>{row.abilityCasts??"—"}</td><td>{row.manaSpent??"—"}</td><td>{row.rageSpent??"—"}</td><td>{(row.averageRoundsMilli/1000).toFixed(2)}</td><td>{(row.averageActionsMilli/1000).toFixed(2)}</td><td>{(row.averageLogicalDurationMs/1000).toFixed(2)} s</td>
   </tr>)}</tbody>
  </table></div>
  {reports.some(row=>row.castsBySkill)&&<details><summary>Committed casts by skill</summary><div className="audit"><table>
   <thead><tr><th>Encounter</th><th>Policy</th><th>Skill</th><th>Casts</th></tr></thead>
   <tbody>{reports.flatMap(row=>Object.entries(row.castsBySkill??{}).map(([id,casts])=><tr key={row.bossId+':'+row.policy+':'+id}>
    <td>{row.bossId}</td><td>{row.policy}</td><td>{id}</td><td>{casts}</td>
   </tr>))}</tbody>
  </table></div></details>}
  <details><summary>Contribution totals by seat</summary><div className="audit"><table>
   <thead><tr><th>Encounter</th><th>Policy</th><th>Seat</th><th>Pet</th><th>Damage</th><th>Healing</th><th>Shielding</th></tr></thead>
   <tbody>{reports.flatMap(row=>row.contributions.map((seat,index)=><tr key={row.bossId+':'+row.policy+':'+index}>
    <td>{row.bossId}</td><td>{row.policy}</td><td>{index+1}</td><td>{seat.petId}</td><td>{seat.damage}</td><td>{seat.healing}</td><td>{seat.shielding}</td>
   </tr>))}</tbody>
  </table></div></details>
 </>;
}

// Operator-only Gameplay Configuration workspace. The typed fields edit the
// authored bundle; the Rust engine remains the authority that accepts or
// rejects it, and the digest shown here is the engine's verdict.
export default function GameplayConfig({request}:{request:Request}){
 const [overview,setOverview]=useState<Overview|null>(null),[selected,setSelected]=useState<Version|null>(null),[bundle,setBundle]=useState<GameplayBundle|null>(null),[json,setJson]=useState(''),[audit,setAudit]=useState<Audit|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[comparison,setComparison]=useState<BundleDifference[]|null>(null);
 const [simPolicy,setSimPolicy]=useState<GameplaySimulationPolicy|'all'>('tactical');
 const [party,setParty]=useState<GameplaySimulationParty|null>(null);
 const [simSeeds,setSimSeeds]=useState(12);
 const [simReport,setSimReport]=useState<SimulationResult|null>(null);
 const [baselineReport,setBaselineReport]=useState<SimulationResult|null>(null);
 const [simBossId,setSimBossId]=useState('');
 const [simOtherBossId,setSimOtherBossId]=useState('');
 const [simRunning,setSimRunning]=useState(false);
 const simCancellation=useRef<AbortController|null>(null);
 const [petSearch,setPetSearch]=useState('');
 const [bossIndex,setBossIndex]=useState(0);
 const lock=useRef(false);
 const encounters=encounterOptions(selected?.bundle);
 const encounter=encounters.find(option=>option.id===simBossId)??encounters[0];
 const otherEncounters=encounters.filter(option=>option.id!==encounter?.id);
 const otherEncounter=otherEncounters.find(option=>option.id===simOtherBossId);
 const seedLimit=simPolicy==='all'?25:200;

 async function work(run:()=>Promise<unknown>){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{await run();}catch(error){setMessage(error instanceof Error?error.message:'Gameplay configuration request failed.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function loadOverview(){
  const value=GameplayConfigOverviewSchema.parse(await request('gameplay-config?ruleset='+RULESET));
  setOverview(value);
  return value;
 }
 async function open(version:number){
  const value=GameplayConfigVersionViewSchema.parse(await request('gameplay-config-version?ruleset='+RULESET+'&version='+version));
  setComparison(null);setParty(null);setSelected(value);setBundle(value.bundle);setBossIndex(0);setSimBossId('');setSimOtherBossId('');setSimReport(null);setBaselineReport(null);setJson(JSON.stringify(value.bundle,null,2));setMessage('');
 }
 async function refresh(version?:number){await work(async()=>{const current=await loadOverview();await open(version??current.active?.version??current.versions[0]?.version??0);});}
 useEffect(()=>{void work(async()=>{const current=await loadOverview();if(current.active)await open(current.active.version);else if(current.versions[0])await open(current.versions[0].version);});},[]);
 useEffect(()=>()=>simCancellation.current?.abort(),[]);
 function change(path:readonly string[],value:unknown){
  if(!bundle||selected?.state!=='DRAFT')return;
  const next=write(bundle,path,value);setComparison(null);setBundle(next);setJson(JSON.stringify(next,null,2));
 }
 async function createDraft(){
  if(!overview?.active)return;
  await work(async()=>{
   const active=await request('gameplay-config-version?ruleset='+RULESET+'&version='+overview.active!.version);
   const view=GameplayConfigVersionViewSchema.parse(active);
   const created=GameplayConfigMutationSchema.parse(await request('gameplay-config-draft',{requestId:crypto.randomUUID(),ruleset:RULESET,parentVersion:overview.active!.version,bundle:view.bundle}));
   await loadOverview();await open(created.version);setMessage('Draft '+created.version+' created from published version '+view.version+'.');
  });
 }
 async function saveDraft(activation:'save'|'validate'):Promise<void>{
  if(!selected||!bundle)return;
  if(selected.state!=='DRAFT'){setMessage('Only a draft can be edited; create a new draft from the active version.');return;}
  await work(async()=>{
   const temp=JSON.parse(json) as GameplayBundle;
   const mutation=GameplayConfigMutationSchema.parse(await request('gameplay-config-update',{requestId:crypto.randomUUID(),ruleset:RULESET,version:selected.version,expectedRevision:selected.revision,bundle:temp}));
   if(activation==='save'){await loadOverview();await open(mutation.version);setMessage('Draft saved at revision '+mutation.revision+'. Validate it with the engine before publishing.');return;}
   const validation=GameplayConfigValidationSchema.parse(await request('gameplay-config-validate',{requestId:crypto.randomUUID(),ruleset:RULESET,version:mutation.version,expectedRevision:mutation.revision}));
   await loadOverview();await open(mutation.version);setMessage('Engine validated: '+validation.engineCapability+', digest '+validation.contentDigest.slice(0,12)+'…');
  });
 }
 async function publish(){
  if(!selected||!overview)return;
  await work(async()=>{
   const result=GameplayConfigPublishResultSchema.parse(await request('gameplay-config-publish',{requestId:crypto.randomUUID(),ruleset:RULESET,version:selected.version,expectedRevision:selected.revision,expectedActiveRevision:overview.active?.revision??null}));
   await loadOverview();await open(result.version);setMessage('Version '+result.version+' published at active revision '+result.activeRevision+'. New matches use it; active matches keep their pinned configuration.');
  });
 }
 async function rollback(version:number){
  if(!overview?.active)return;
  await work(async()=>{
   const result=GameplayConfigRollbackResultSchema.parse(await request('gameplay-config-rollback',{requestId:crypto.randomUUID(),ruleset:RULESET,version,expectedActiveRevision:overview.active!.revision}));
   await loadOverview();await open(result.version);setMessage('Active configuration restored to version '+result.version+' at active revision '+result.activeRevision+'.');
  });
 }
 async function runSimulation(compare=false){
  if(!selected||!encounter)return;
  await work(async()=>{
   const cancellation=new AbortController();
   simCancellation.current=cancellation;
   setSimRunning(true);
   setSimReport(null);
   setBaselineReport(null);
   const settings=simPolicy==='all'
    ? {bossIds:otherEncounter?[encounter.id,otherEncounter.id]:[encounter.id]}
    : {policy:simPolicy,bossId:encounter.id};
   const seats=party??initialParty(selected.bundle);
   const simulate=async(version:number)=>{
    const payload={requestId:crypto.randomUUID(),ruleset:RULESET,version,seeds:simSeeds,party:seats,...settings};
    const result=await request('gameplay-config-simulate',payload,cancellation.signal);
    cancellation.signal.throwIfAborted();
    return GameplaySimulationResultSchema.parse(result);
   };
   try{
    const baseline=compare&&overview?.active?await simulate(overview.active.version):null;
    const candidate=await simulate(selected.version);
    setBaselineReport(baseline);
    setSimReport(candidate);
    setMessage('Simulation complete.');
   }catch(error){
    if(!cancellation.signal.aborted)throw error;
    setMessage('Simulation cancelled.');
   }finally{
    simCancellation.current=null;
    setSimRunning(false);
   }
  });
 }
 async function compareWithActive(){
  if(!overview?.active||!bundle)return;
  await work(async()=>{
   const active=GameplayConfigVersionViewSchema.parse(await request('gameplay-config-version?ruleset='+RULESET+'&version='+overview.active!.version));
   const paths=bundleDifferences(active.bundle,bundle);
   setComparison(paths);
   setMessage(paths.length?paths.length+' field'+(paths.length===1?'':'s')+' differ from active version '+active.version+'.':'No field differs from active version '+active.version+'.');
  });
 }
 async function loadAudit(){await work(async()=>{setAudit(GameplayConfigAuditSchema.parse(await request('gameplay-config-audit?ruleset='+RULESET)));});}
 function applyJson(){
  try{const parsed=JSON.parse(json) as GameplayBundle;if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Bundle must be a JSON object');setComparison(null);setBundle(parsed);setMessage('Unsaved JSON applied to the editor. Save the draft to persist.');}
  catch(error){setMessage(error instanceof Error?error.message:'Invalid JSON bundle');}
 }
 const editable=selected?.state==='DRAFT',activatable=selected?.state==='VALIDATED';
 const binding=gameplayEngineBinding(bundle?.schemaVersion);
 const functional=binding?.soloVersion!==undefined;
 const timed=functional && binding.coopVersion>=3;
 const expanded=functional||bundle?.schemaVersion===2;
 const schedule=read(bundle,['multiplier','schedule']);
 const artifactCatalog=Array.isArray(bundle?.artifacts)?bundle.artifacts:[];
 const bossCatalog=Array.isArray(bundle?.bosses)?bundle.bosses:[];
 const bossPath=bossCatalog.length?['bosses',String(Math.min(bossIndex,bossCatalog.length-1))]:['boss'];
 return <><div className="page-heading"><div><p className="eyebrow">Gameplay configuration</p><h1 tabIndex={-1}>Authoritative balance</h1><p className="muted">Drafts are validated by the Rust engine and published atomically to PostgreSQL. Active matches keep their pinned version.</p></div><div><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void refresh(selected?.version)}>{busy?'Refreshing…':'Refresh'}</button>{overview?.active?<button type="button" className="aetheria-button" disabled={busy} onClick={()=>void createDraft()}>New draft from active</button>:null}</div></div>
 {message?<p role="status" aria-live="polite">{message}</p>:null}
 <section className="aetheria-card"><h2>Active configuration</h2>{overview?.active?<dl className="metrics"><div><dt>Version</dt><dd>{overview.active.version}</dd></div><div><dt>State</dt><dd>{overview.active.state}</dd></div><div><dt>Engine</dt><dd>{overview.active.engineCapability}</dd></div><div><dt>Digest</dt><dd title={overview.active.contentDigest}>{overview.active.contentDigest.slice(0,16)}…</dd></div><div><dt>Published</dt><dd>{new Date(overview.active.publishedAt).toLocaleString()}</dd></div><div><dt>Active revision</dt><dd>{overview.active.revision}</dd></div></dl>:<p className="muted">No published gameplay configuration. Install the seed configuration through the reviewed migration/installation workflow before editing.</p>}</section>
 <section className="aetheria-card"><h2>Versions</h2><div className="audit"><table><caption>Draft and published gameplay configurations</caption><thead><tr><th>Version</th><th>State</th><th>Engine digest</th><th>Updated</th><th/></tr></thead><tbody>{(overview?.versions??[]).map(row=><tr key={row.version}><td>{row.version}</td><td>{row.state}</td><td>{row.contentDigest?row.contentDigest.slice(0,12)+'…':'—'}</td><td>{new Date(row.createdAt).toLocaleString()}</td><td><button type="button" className="text-button" disabled={busy} onClick={()=>void work(()=>open(row.version))}>Open</button>{row.publishedAt&&row.version!==overview?.active?.version?<button type="button" className="text-button" disabled={busy} onClick={()=>void rollback(row.version)}>Roll back</button>:null}</td></tr>)}</tbody></table>{!overview?.versions.length?<p className="muted">No versions yet.</p>:null}</div></section>
 {selected?<section className="aetheria-card"><h2>Version {selected.version} · {selected.state}</h2><p className="small muted">Author {selected.createdBy} · revision {selected.revision}{selected.contentDigest?' · engine digest '+selected.contentDigest:''}</p><p><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={()=>void saveDraft('save')}>Save draft</button><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={()=>void saveDraft('validate')}>Save and validate</button><button type="button" className="aetheria-button" disabled={busy||!activatable} onClick={()=>void publish()}>Publish validated version</button><button type="button" className="aetheria-button secondary" disabled={busy||!overview?.active} onClick={()=>void compareWithActive()}>Compare with active</button></p>{comparison?<div className="aetheria-card"><h3>Differences from active</h3>{comparison.length?<div className="audit"><table><thead><tr><th>Field</th><th>Active</th><th>Selected</th></tr></thead>
 <tbody>{comparison.map(({path,before,after})=><tr key={path}><th scope="row">{path}</th>
 <td><code>{JSON.stringify(before)??'Absent'}</code></td><td><code>{JSON.stringify(after)??'Absent'}</code></td></tr>)}</tbody>
 </table></div>:<p className="muted">The selected bundle matches the active version.</p>}</div>:null}
 <h3>Engine simulation</h3>
 <p className="small muted">Uses the saved version and the same Rust reducer as live matches. Seeds start at 1, and the simulation clock advances one second per action.</p>
 <SimulationParty bundle={selected.bundle} party={party??initialParty(selected.bundle)} onChange={setParty}/>
 <div className="fields">
  <label>Encounter<select className="aetheria-field" value={encounter?.id??''} disabled={busy||!encounter} onChange={event=>setSimBossId(event.target.value)}>
   {encounters.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>
  <label>Policy<select className="aetheria-field" value={simPolicy} disabled={busy} onChange={event=>{
   const value=event.target.value as typeof simPolicy;
   setSimPolicy(value);
   if(value==='all')setSimSeeds(current=>Math.min(current,25));
  }}>
   {GameplaySimulationPolicySchema.options.map(policy=><option key={policy} value={policy}>{policy}</option>)}
   <option value="all">Compare all policies</option>
  </select></label>
  {simPolicy==='all'&&otherEncounters.length>0?<label>Compare with<select className="aetheria-field" value={otherEncounter?.id??''} disabled={busy} onChange={event=>setSimOtherBossId(event.target.value)}>
   <option value="">One encounter</option>
   {otherEncounters.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>:null}
  <Num label={'Seeds (1–'+seedLimit+')'} value={simSeeds} min={1} max={seedLimit} onChange={setSimSeeds}/>
  <button type="button" className="aetheria-button secondary" disabled={busy||!encounter||!Number.isInteger(simSeeds)||simSeeds<1||simSeeds>seedLimit} onClick={()=>void runSimulation()}>Run simulation</button>
  {overview?.active&&selected.version!==overview.active.version&&<button type="button" className="aetheria-button secondary"
   disabled={busy||!encounter||!Number.isInteger(simSeeds)||simSeeds<1||simSeeds>seedLimit}
   onClick={()=>void runSimulation(true)}>Simulate active and selected versions</button>}
  {simRunning?<button type="button" className="text-button" onClick={()=>simCancellation.current?.abort()}>Cancel simulation</button>:null}
 </div>
 {baselineReport&&<section><h4>Active version at comparison</h4><SimulationResults result={baselineReport}/></section>}
 {simReport&&<section>{baselineReport&&<h4>Selected version at comparison</h4>}<SimulationResults result={simReport}/></section>}
 <dl className="metrics">
  <div><dt>Publication record schema</dt><dd>{selected.schemaVersion}</dd></div>
  <div><dt>Bundle schema</dt><dd>{display(bundle,'schemaVersion')}</dd></div>
  <div><dt>Content revision</dt><dd>{display(bundle,'contentRevision')}</dd></div>
 </dl>
 {expanded&&bundle&&<label>When the Boss reaches zero HP
  <select className="aetheria-field" disabled={!editable} value={String(bundle.terminalOutcomePolicy??'')}
   onChange={event=>change(['terminalOutcomePolicy'],event.target.value||undefined)}>
   <option value="">Resolve remaining end-of-turn effects</option>
   <option value="boss-defeat-first">Finish the battle immediately</option>
  </select>
 </label>}
 <h3>Pet catalog</h3><label>Find a Pet<input type="search" className="aetheria-field" value={petSearch} onChange={event=>setPetSearch(event.target.value)} /></label>
 <div className="audit"><table><thead><tr><th>Name</th><th>Pet ID</th><th>Element</th><th>Rarity</th><th>Power class</th><th>HP</th><th>Attack</th><th>Defense</th></tr></thead>
 <tbody>{(Array.isArray(bundle?.pets)?bundle.pets:[]).map((pet,index)=>{
  const name=display(pet,'catalog','name'),id=display(pet,'id');
  if(!(name+' '+id).toLowerCase().includes(petSearch.trim().toLowerCase()))return null;
  return <tr key={index}><td>{name}</td><td>{id}</td><td>{display(pet,'element')}</td><td>{display(pet,'rarity')}</td><td>{display(pet,'powerClass')}</td>
   {['maxHp','attack','defense'].map(key=><td key={key}><input aria-label={name+' '+key} className="aetheria-field" type="number" min={0} disabled={!editable} value={display(pet,key)} onChange={event=>{const n=event.target.valueAsNumber;if(Number.isSafeInteger(n)&&n>=0)change(['pets',String(index),key],n);}} /></td>)}</tr>;
 })}</tbody></table></div>
 {selected.catalogReference&&<details><summary>Canonical acquisition and production status</summary><div className="audit"><table>
  <caption>Current roster reference</caption>
  <thead><tr><th>Pet ID</th><th>Catalog rank</th><th>Starter</th><th>Acquisition source</th><th>Acquisition decision</th><th>Catalog gameplay readiness</th><th>Model status</th></tr></thead>
  <tbody>{selected.catalogReference.filter(pet=>pet.id.includes(petSearch.trim().toLowerCase())).map(pet=><tr key={pet.id}>
   <td>{pet.id}</td><td>{pet.catalogRank??'Unassigned'}</td><td>{pet.starter?'Yes':'No'}</td><td>{pet.sourceCategory.replaceAll('_',' ')}</td>
   <td>{pet.acquisitionAuthority.toLowerCase().replaceAll('_',' ')}</td><td>{pet.gameplayReady?'Ready':'Pending'}</td><td>{pet.modelStatus.toLowerCase().replaceAll('_',' ')}</td>
  </tr>)}</tbody>
 </table></div></details>}
 <div>
 {Array.isArray(bundle?.pets)&&bundle.pets.some(pet=>read(pet,['growth']))?<details><summary>Per-Pet growth</summary>
 <p>Rates are basis points per Pet level. A rate of 100 adds 1% of the base stat per level before the growth adjustment.</p>
 {bundle.pets.map((pet,index)=>{
  const growth=read(pet,['growth']),name=display(pet,'catalog','name'),id=display(pet,'id');
  if(!growth||!(name+' '+id).toLowerCase().includes(petSearch.trim().toLowerCase()))return null;
  const path=['pets',String(index),'growth'];
  return <fieldset key={id} disabled={!editable}><legend>{name} · {display(growth,'curve')}</legend><div className="fields">
   {(['healthBp','attackBp','defenseBp','biasPm'] as const).map((key,field)=><Num key={key} label={['HP growth (bp)','Attack growth (bp)','Defense growth (bp)','Growth adjustment (permille)'][field]} value={read(growth,[key])} min={key==='biasPm'?-100:0} max={key==='biasPm'?100:250} onChange={value=>change([...path,key],value)}/>)}
  </div></fieldset>;
 })}</details>:null}
 {artifactCatalog.length?<details><summary>Cooperative Artifact definitions</summary>
 {artifactCatalog.map((artifact,index)=>{
  const path=['artifacts',String(index)];
  return <fieldset key={display(artifact,'id')} disabled={!editable}><legend>{display(artifact,'id')} · {display(artifact,'slot')}</legend>
   <Num label="Minimum Pet level" value={read(artifact,['requiredPetLevel'])} min={1} max={60} onChange={value=>change([...path,'requiredPetLevel'],value)}/>
   {['modifiers','perLevel'].map(group=><div key={group} className="fields">{['hp','attack','defense'].map(stat=><Num key={stat} label={(group==='modifiers'?'Base ':'Per upgrade ')+stat} value={read(artifact,[group,stat])} onChange={value=>change([...path,group,stat],value)}/>)}</div>)}
  </fieldset>;
 })}</details>:null}
 <h3>Combat resources</h3><fieldset disabled={!editable} className="fields">{([
  ['manaCap','Mana cap'],['rageCap','Rage cap'],
  ...(!functional?[
   ['manaPerTile','Mana per tile'],['manaOwnBonus','Matching-element mana bonus'],['ragePerTile','Rage per tile'],
  ]:[]),
  ['ragePerGuard','Rage from guard'],['ragePerDamageTaken','Rage from incoming damage'],
 ] as [string,string][]).map(([key,label])=><Num key={key} label={label} value={read(bundle,['resources',key])} onChange={value=>change(['resources',key],value)}/>)}</fieldset>
 <h3>Party and board</h3>
 {expanded&&<label>Opening board generation
  <select className="aetheria-field" disabled={!editable} value={String(read(bundle,['board','initialBoardPolicy'])??'')}
   onChange={event=>change(['board','initialBoardPolicy'],event.target.value||undefined)}>
   <option value="">Sample boards up to the generation limit</option>
   <option value="constructive">Build a stable board with a legal swap</option>
  </select>
 </label>}
 <div className="fields">{timed?<p>Unlimited rounds · Turn duration {display(bundle,'party','turnTimeoutMs')} ms</p>:<Num label="Max rounds" value={read(bundle,['party','maxRounds'])} onChange={value=>change(['party','maxRounds'],value)}/>}<Num label="Max cascades" value={read(bundle,['party','maxCascades'])} onChange={value=>change(['party','maxCascades'],value)}/><Num label="Board generation attempts" value={read(bundle,['board','generationAttempts'])} onChange={value=>change(['board','generationAttempts'],value)}/></div>
 {functional&&bundle&&<FunctionalBoardEditor bundle={bundle} editable={editable} change={change}/>}
 {bundle&&<AdvancedJewelEditor bundle={bundle} editable={editable} change={change}/>}
 <h3>Boss phase configuration</h3>{bossCatalog.length?<label>Boss<select className="aetheria-field" value={bossPath[1]} onChange={event=>setBossIndex(Number(event.target.value))}>{bossCatalog.map((value,index)=>{
  const id=display(value,'id'),name=display(value,'name'),map=display(value,'mapId');
  return <option key={index} value={index}>{name==='—'?id:name}{map==='—'?'':' · '+map}</option>;
 })}</select></label>:null}
 {bossCatalog.length>0&&typeof read(bundle,[...bossPath,'mapId'])==='string'&&<label>Map clear required to host
  <select className="aetheria-field" disabled={!editable} value={String(read(bundle,[...bossPath,'requiredMapClear'])??'')}
   onChange={event=>change([...bossPath,'requiredMapClear'],event.target.value||undefined)}>
   <option value="">No prior map clear</option>
   {bossCatalog.flatMap(other=>{
    const mapId=read(other,['mapId']);
    if(typeof mapId!=='string'||mapId===read(bundle,[...bossPath,'mapId']))return [];
    return [<option key={mapId} value={mapId}>{mapId}</option>];
   })}
  </select>
 </label>}
 {expanded&&<label>Boss attack target priority
  <select className="aetheria-field" disabled={!editable} value={String(read(bundle,[...bossPath,'attackModel','targetPriority'])??'')}
   onChange={event=>change([...bossPath,'attackModel','targetPriority'],event.target.value||undefined)}>
   <option value="">Lowest remaining HP percentage</option>
   <option value="highest-mana">Highest current mana</option>
  </select>
 </label>}
 {bundle?.schemaVersion===6&&<fieldset disabled={!editable}><Num label="Boss attack" min={1} value={read(bundle,[...bossPath,'attack'])} onChange={value=>change([...bossPath,'attack'],value)}/></fieldset>}
 <div className="fields"><Num label="Achievement Points to host" value={read(bundle,[...bossPath,'requiredRoomPoints'])} onChange={value=>change([...bossPath,'requiredRoomPoints'],value)}/><Num label="Boss max HP" value={read(bundle,[...bossPath,'maxHp'])} onChange={value=>change([...bossPath,'maxHp'],value)}/>{(['baseDamage','perRoundDamage','minimumDamage','defenseDivisor'] as const).map((key,i)=><Num key={key} label={['Boss base damage','Additional damage per round','Minimum incoming damage','Party defense divisor'][i]} min={key==='perRoundDamage'?0:1} value={read(bundle,[...bossPath,'attackModel',key])} onChange={value=>change([...bossPath,'attackModel',key],value)}/>)}<Num label="Boss defense" value={read(bundle,[...bossPath,'defense'])} onChange={value=>change([...bossPath,'defense'],value)}/><Num label="Critical rate (bp)" value={read(bundle,[...bossPath,'critRateBp'])} onChange={value=>change([...bossPath,'critRateBp'],value)}/><Num label="Critical damage (bp)" value={read(bundle,[...bossPath,'critDamageBp'])} onChange={value=>change([...bossPath,'critDamageBp'],value)}/><Num label="Telegraph turns" value={read(bundle,[...bossPath,'telegraphTurns'])} onChange={value=>change([...bossPath,'telegraphTurns'],value)}/><Num label="Phase threshold (bp)" value={read(bundle,[...bossPath,'phase','thresholdBp'])} onChange={value=>change([...bossPath,'phase','thresholdBp'],value)}/><Num label="Phase max HP growth (bp)" value={read(bundle,[...bossPath,'phase','maxGrowthBp'])} onChange={value=>change([...bossPath,'phase','maxGrowthBp'],value)}/><Num label="Phase two current HP (bp)" value={read(bundle,[...bossPath,'phase','currentBp'])} onChange={value=>change([...bossPath,'phase','currentBp'],value)}/><Num label="Phase two attack (pm)" value={read(bundle,[...bossPath,'phase','phase2AttackPm'])} onChange={value=>change([...bossPath,'phase','phase2AttackPm'],value)}/><Num label="Attack targets" value={read(bundle,[...bossPath,'phase','attackTargets'])} onChange={value=>change([...bossPath,'phase','attackTargets'],value)}/></div>
 <h3>Pet elements and effectiveness</h3>
 {bundle?.schemaVersion===6&&Array.isArray(bundle.elements)
  ?<SharedElementMatrix elements={bundle.elements} editable={editable} change={change}/>
  :<><p className="small muted">Damage against each defending element. 100% is normal damage and 0% is immunity.</p>
 {Array.isArray(bundle?.elements)&&bundle.elements.map((profile,i)=>{
  const defenderRows=read(profile,['effectiveness']);
  return <fieldset key={i} disabled={!editable}><legend>{display(profile,'element')} attack</legend><div className="fields">
   {Array.isArray(defenderRows)&&defenderRows.map((row,j)=><Num key={j} label={'Against '+display(row,'element')+' (%)'} min={0} max={300} step={0.1} value={Number(read(row,['permille']))/10} onChange={n=>change(['elements',String(i),'effectiveness',String(j),'permille'],Math.round(n*10))}/>)}
   {read(profile,['bossCritDamageBonusBp'])!==undefined&&<Num label="Bonus critical damage against Bosses (%)" min={0.01} max={100} step={0.01} value={Number(read(profile,['bossCritDamageBonusBp']))/100} onChange={n=>change(['elements',String(i),'bossCritDamageBonusBp'],Math.round(n*100))}/>}
  </div></fieldset>;
 })}</>}
 <h3>Multiplier schedule</h3>
 <p className="small muted">Each refill rolls from the current stage. A tier’s probability is its weight divided by the total weight for that stage.</p>
 {functional&&<p className="small muted">Strike uses the attack factor. Mana, Rage, Vitality, Aegis and Soul use the utility factor. A factor applies to the same tier wherever it appears.</p>}
 <div className="audit"><table><thead><tr><th>From turn</th><th>Tier weights</th></tr></thead>
 <tbody>{Array.isArray(schedule)&&schedule.map((stage,index)=>{
  const path=['multiplier','schedule',String(index)],tiers=read(stage,['tiers']);
  if(!Array.isArray(tiers))return null;
  const weightTotal=tiers.reduce((sum,tier)=>sum+Number(read(tier,['weight'])??0),0);
  return <tr key={index}>
   <td><fieldset disabled={!editable||index===0}><Num label={'Stage '+(index+1)+' start '+String(read(bundle,['multiplier','clockUnit'])??'turn')} value={read(stage,['from'])} onChange={next=>change([...path,'from'],next)}/></fieldset></td>
   <td><fieldset disabled={!editable} className="fields">{tiers.map((tier,tierIndex)=>{
    const multiplier=read(tier,['multiplier']),weight=read(tier,['weight']);
    const probability=weightTotal>0?(100*Number(weight)/weightTotal).toFixed(2)+'%':'—';
    return <div key={tierIndex}>
     <Num label={'Stage '+(index+1)+' ×'+String(multiplier)+' weight'} value={weight} min={1}
      onChange={next=>change([...path,'tiers',String(tierIndex),'weight'],next)}/>
     <span className="small muted">{probability}</span>
    </div>;
   })}</fieldset></td>
  </tr>;
 })}</tbody></table></div>
 {functional&&<MultiplierFactors schedule={schedule} editable={editable} change={change}/>}
 <h3>Settlement rewards</h3>
 {read(bundle,[...bossPath,'rewardPolicy'])?<RecruitmentEditor bundle={bundle} bossPath={bossPath} editable={editable} change={change}/>:null}
 {read(bundle,[...bossPath,'rewardPolicy'])?<fieldset disabled={!editable}><legend>Minimum committed combat actions per participant</legend>
 <p className="small muted">Healing, guarding and board moves count. Starting the battle does not. Zero includes all seated participants.</p>
 {(['victory','defeat'] as const).map(outcome=>{
  const path=[...bossPath,'rewardPolicy','minimumActions'];
  const values=read(bundle,path) as Record<string,number>|undefined;
  return <Num key={outcome} label={outcome==='victory'?'Victory actions':'Defeat actions'} min={0} max={4096} value={values?.[outcome]??0} onChange={value=>{
   if(Number.isInteger(value))change(path,{victory:0,defeat:0,...values,[outcome]:value});
  }}/>;
 })}</fieldset>:null}
 {read(bundle,[...bossPath,'rewardPolicy'])?<div>{(['firstClear','repeatClear','defeat'] as const).map((kind,i)=><fieldset key={kind}><legend>{['First Boss victory','Repeat Boss victory','Defeat'][i]}</legend><div className="fields">{(['achievementPoints','coins','exp','materials'] as const).map((key,j)=>{
  const path=[...bossPath,'rewardPolicy',kind,key];return <Num key={key} label={['Achievement Points','Coins','Pet EXP','Artifact materials'][j]} value={read(bundle,path)} onChange={value=>change(path,value)}/>;
 })}</div></fieldset>)}</div>:<><p className="small muted">Paid exactly once per seated participant from this published bundle; losses use the loss values.</p><div className="fields">{([['clearAchievementPoints','Clear Achievement Points'],['clearCoins','Clear coins'],['clearExp','Clear Pet EXP'],['lossAchievementPoints','Loss Achievement Points'],['lossCoins','Loss coins'],['lossExp','Loss Pet EXP']] as const).map(([key,label])=><Num key={key} label={label} value={read(bundle,['rewards',key])} onChange={value=>change(['rewards',key],value)}/>)}</div></>}

 <h3>Skill configuration</h3>{bundle&&<SkillTrainingEditor key={selected.version} bundle={bundle} editable={editable} change={change}/>}<div className="audit"><table><thead><tr><th>Skill</th><th>Mana</th><th>Rage</th><th>Cooldown</th><th>Power (pm)</th></tr></thead><tbody>{(Array.isArray(bundle?.skills)?bundle!.skills as unknown[]:[]).map((skill,index)=>{const row=skill as Record<string,unknown>;return <tr key={index}><td>{String(row.id)}</td>{['manaCost','rageCost','cooldownTurns','powerPm'].map(key=><td key={key}><input className="aetheria-field" type="number" min={0} disabled={!editable} value={typeof row[key]==='number'?row[key] as number:0} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)change(['skills',String(index),key],next);}}/></td>)}</tr>;})}</tbody></table></div>
 </div>
 <h3>Raw bundle (advanced)</h3><textarea className="aetheria-field" rows={14} value={json} onChange={event=>setJson(event.target.value)} disabled={!editable} /><p><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={applyJson}>Apply JSON to editor</button></p>
 </section>:null}
 <section className="aetheria-card"><h2>Publication audit</h2><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void loadAudit()}>Load audit</button>{audit?<div className="audit"><table><thead><tr><th>Seq</th><th>Action</th><th>Version</th><th>Actor</th><th>When</th></tr></thead><tbody>{audit.events.map(event=><tr key={event.sequence}><td>{event.sequence}</td><td>{event.action}</td><td>{event.version}</td><td>{event.actor}</td><td>{new Date(event.occurredAt).toLocaleString()}</td></tr>)}</tbody></table></div>:null}</section>
 </>;
}
