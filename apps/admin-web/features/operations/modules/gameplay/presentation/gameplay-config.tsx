'use client';
import {useEffect,useRef,useState} from 'react';
import {
 GameplayConfigAuditSchema,GameplayConfigMutationSchema,GameplayConfigOverviewSchema,
 GameplayConfigPublishResultSchema,GameplayConfigRollbackResultSchema,GameplayConfigValidationSchema,GameplayConfigVersionViewSchema,
 GameplaySimulationReportSchema,type GameplayBundle,
} from '@aetheria/contracts';
import {bundleDifferences} from './bundle-diff';

type Overview=ReturnType<typeof GameplayConfigOverviewSchema.parse>;
type Version=ReturnType<typeof GameplayConfigVersionViewSchema.parse>;
type Audit=ReturnType<typeof GameplayConfigAuditSchema.parse>;
type Request=(action:string,body?:unknown)=>Promise<unknown>;
const RULESET='arena8-coop-pve';

function read(source:unknown,path:readonly string[]):unknown{
 let current=source;
 for(const key of path){
  if(!current||typeof current!=='object'||Array.isArray(current))return undefined;
  current=(current as Record<string,unknown>)[key];
 }
 return current;
}
function write(source:GameplayBundle,path:readonly string[],value:unknown):GameplayBundle{
 const copy=structuredClone(source) as Record<string,unknown>;
 let current=copy;
 for(const key of path.slice(0,-1)){
  const next=current[key];
  if(!next||typeof next!=='object'||Array.isArray(next))return source;
  current=next as Record<string,unknown>;
 }
 current[path[path.length-1]!]=value;
 return copy;
}
function Num({label,value,onChange,step=1}:{label:string;value:unknown;onChange:(value:number)=>void;step?:number}){
 const number=typeof value==='number'?value:0;
 return <label>{label}<input className="aetheria-field" type="number" step={step} min={0} value={number} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)onChange(next);}}/></label>;
}

// Operator-only Gameplay Configuration workspace. The typed fields edit the
// authored bundle; the Rust engine remains the authority that accepts or
// rejects it, and the digest shown here is the engine's verdict.
export default function GameplayConfig({request}:{request:Request}){
 const [overview,setOverview]=useState<Overview|null>(null),[selected,setSelected]=useState<Version|null>(null),[bundle,setBundle]=useState<GameplayBundle|null>(null),[json,setJson]=useState(''),[audit,setAudit]=useState<Audit|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[simPolicy,setSimPolicy]=useState<'random'|'basic'|'tactical'|'coordinated'>('tactical'),[simSeeds,setSimSeeds]=useState(12),[simReport,setSimReport]=useState<ReturnType<typeof GameplaySimulationReportSchema.parse>|null>(null),[comparison,setComparison]=useState<string[]|null>(null);
 const lock=useRef(false);

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
  setSelected(value);setBundle(value.bundle);setJson(JSON.stringify(value.bundle,null,2));setMessage('');
 }
 async function refresh(version?:number){await work(async()=>{const current=await loadOverview();await open(version??current.active?.version??current.versions[0]?.version??0);});}
 useEffect(()=>{void work(async()=>{const current=await loadOverview();if(current.active)await open(current.active.version);else if(current.versions[0])await open(current.versions[0].version);});},[]);
 function change(path:readonly string[],value:unknown){
  if(!bundle)return;
  const next=write(bundle,path,value);setBundle(next);setJson(JSON.stringify(next,null,2));
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
 async function runSimulation(){
  if(!selected)return;
  await work(async()=>{
   const report=GameplaySimulationReportSchema.parse(await request('gameplay-config-simulate',{requestId:crypto.randomUUID(),ruleset:RULESET,version:selected.version,policy:simPolicy,seeds:simSeeds}));
   setSimReport(report);
   setMessage('Simulation complete: '+report.wins+' wins / '+report.losses+' losses / '+report.unresolved+' unresolved across '+report.seeds+' seeds.');
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
  try{const parsed=JSON.parse(json) as GameplayBundle;if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Bundle must be a JSON object');setBundle(parsed);setMessage('Unsaved JSON applied to the editor. Save the draft to persist.');}
  catch(error){setMessage(error instanceof Error?error.message:'Invalid JSON bundle');}
 }
 const editable=selected?.state==='DRAFT',activatable=selected?.state==='VALIDATED';
 const schedule=read(bundle,['multiplier','schedule']);
 return <><div className="page-heading"><div><p className="eyebrow">Gameplay configuration</p><h1 tabIndex={-1}>Authoritative balance</h1><p className="muted">Drafts are validated by the Rust engine and published atomically to PostgreSQL. Active matches keep their pinned version.</p></div><div><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void refresh(selected?.version)}>{busy?'Refreshing…':'Refresh'}</button>{overview?.active?<button type="button" className="aetheria-button" disabled={busy} onClick={()=>void createDraft()}>New draft from active</button>:null}</div></div>
 {message?<p role="status" aria-live="polite">{message}</p>:null}
 <section className="aetheria-card"><h2>Active configuration</h2>{overview?.active?<dl className="metrics"><div><dt>Version</dt><dd>{overview.active.version}</dd></div><div><dt>State</dt><dd>{overview.active.state}</dd></div><div><dt>Engine</dt><dd>{overview.active.engineCapability}</dd></div><div><dt>Digest</dt><dd title={overview.active.contentDigest}>{overview.active.contentDigest.slice(0,16)}…</dd></div><div><dt>Published</dt><dd>{new Date(overview.active.publishedAt).toLocaleString()}</dd></div><div><dt>Active revision</dt><dd>{overview.active.revision}</dd></div></dl>:<p className="muted">No published gameplay configuration. Install the seed configuration through the reviewed migration/installation workflow before editing.</p>}</section>
 <section className="aetheria-card"><h2>Versions</h2><div className="audit"><table><caption>Draft and published gameplay configurations</caption><thead><tr><th>Version</th><th>State</th><th>Engine digest</th><th>Updated</th><th/></tr></thead><tbody>{(overview?.versions??[]).map(row=><tr key={row.version}><td>{row.version}</td><td>{row.state}</td><td>{row.contentDigest?row.contentDigest.slice(0,12)+'…':'—'}</td><td>{new Date(row.createdAt).toLocaleString()}</td><td><button type="button" className="text-button" disabled={busy} onClick={()=>void work(()=>open(row.version))}>Open</button>{row.publishedAt&&row.version!==overview?.active?.version?<button type="button" className="text-button" disabled={busy} onClick={()=>void rollback(row.version)}>Roll back</button>:null}</td></tr>)}</tbody></table>{!overview?.versions.length?<p className="muted">No versions yet.</p>:null}</div></section>
 {selected?<section className="aetheria-card"><h2>Version {selected.version} · {selected.state}</h2><p className="small muted">Author {selected.createdBy} · revision {selected.revision}{selected.contentDigest?' · engine digest '+selected.contentDigest:''}</p><p><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={()=>void saveDraft('save')}>Save draft</button><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={()=>void saveDraft('validate')}>Save and validate</button><button type="button" className="aetheria-button" disabled={busy||!activatable} onClick={()=>void publish()}>Publish validated version</button><button type="button" className="aetheria-button secondary" disabled={busy||!overview?.active} onClick={()=>void compareWithActive()}>Compare with active</button></p>{comparison?<div className="aetheria-card"><h3>Differences from active</h3>{comparison.length?<ul>{comparison.slice(0,40).map(path=><li key={path}><code>{path}</code></li>)}</ul>:<p className="muted">The selected bundle matches the active version.</p>}{comparison.length>40?<p className="small muted">Plus {comparison.length-40} more fields.</p>:null}</div>:null}
 <h3>Engine simulation</h3><p className="small muted">Runs the same Rust reducer with public-information policies on the authored bundle; it never mutates progression.</p><div className="fields"><label>Policy<select className="aetheria-field" value={simPolicy} onChange={event=>setSimPolicy(event.target.value as typeof simPolicy)}><option value="tactical">Tactical</option><option value="coordinated">Coordinated</option><option value="basic">Basic</option><option value="random">Random</option></select></label><Num label="Seeds (1-200)" value={simSeeds} onChange={value=>setSimSeeds(value)}/><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void runSimulation()}>Run simulation</button></div>{simReport?<dl className="metrics"><div><dt>Wins</dt><dd>{simReport.wins}</dd></div><div><dt>Losses</dt><dd>{simReport.losses}</dd></div><div><dt>Unresolved</dt><dd>{simReport.unresolved}</dd></div><div><dt>Phase two</dt><dd>{simReport.phaseTwoReached}</dd></div><div><dt>Average rounds</dt><dd>{(simReport.averageRoundsMilli/1000).toFixed(2)}</dd></div><div><dt>Average actions</dt><dd>{(simReport.averageActionsMilli/1000).toFixed(2)}</dd></div><div><dt>Total actions</dt><dd>{simReport.totalActions}</dd></div></dl>:null}
 <h3>Party and board</h3><div className="fields"><Num label="Max rounds" value={read(bundle,['party','maxRounds'])} onChange={value=>change(['party','maxRounds'],value)}/><Num label="Max cascades" value={read(bundle,['party','maxCascades'])} onChange={value=>change(['party','maxCascades'],value)}/><Num label="Turn timeout (ms)" value={read(bundle,['party','turnTimeoutMs'])} step={1000} onChange={value=>change(['party','turnTimeoutMs'],value)}/><Num label="Board generation attempts" value={read(bundle,['board','generationAttempts'])} onChange={value=>change(['board','generationAttempts'],value)}/></div>
 <h3>Boss phase configuration</h3><div className="fields"><Num label="Boss max HP" value={read(bundle,['boss','maxHp'])} onChange={value=>change(['boss','maxHp'],value)}/><Num label="Boss attack" value={read(bundle,['boss','attack'])} onChange={value=>change(['boss','attack'],value)}/><Num label="Boss defense" value={read(bundle,['boss','defense'])} onChange={value=>change(['boss','defense'],value)}/><Num label="Critical rate (bp)" value={read(bundle,['boss','critRateBp'])} onChange={value=>change(['boss','critRateBp'],value)}/><Num label="Critical damage (bp)" value={read(bundle,['boss','critDamageBp'])} onChange={value=>change(['boss','critDamageBp'],value)}/><Num label="Telegraph turns" value={read(bundle,['boss','telegraphTurns'])} onChange={value=>change(['boss','telegraphTurns'],value)}/><Num label="Phase threshold (bp)" value={read(bundle,['boss','phase','thresholdBp'])} onChange={value=>change(['boss','phase','thresholdBp'],value)}/><Num label="Phase max HP growth (bp)" value={read(bundle,['boss','phase','maxGrowthBp'])} onChange={value=>change(['boss','phase','maxGrowthBp'],value)}/><Num label="Phase two current HP (bp)" value={read(bundle,['boss','phase','currentBp'])} onChange={value=>change(['boss','phase','currentBp'],value)}/><Num label="Phase two attack (pm)" value={read(bundle,['boss','phase','phase2AttackPm'])} onChange={value=>change(['boss','phase','phase2AttackPm'],value)}/><Num label="Attack targets" value={read(bundle,['boss','phase','attackTargets'])} onChange={value=>change(['boss','phase','attackTargets'],value)}/></div>
 <h3>Elemental stat profiles</h3><div className="audit"><table><thead><tr><th>Element</th><th>HP</th><th>ATK</th><th>DEF</th><th>Crit rate</th><th>Crit damage</th></tr></thead><tbody>{(Array.isArray(read(bundle,['elements']))?read(bundle,['elements']) as unknown[]:[]).map((element,index)=>{const row=element as Record<string,unknown>;return <tr key={String(row.element)}><td>{String(row.element)}</td>{['maxHp','attack','defense','critRateBp','critDamageBp'].map(key=><td key={key}><input className="aetheria-field" type="number" min={0} disabled={!editable} value={typeof row[key]==='number'?row[key] as number:0} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)change(['elements',String(index),key],next);}}/></td>)}</tr>;})}</tbody></table></div>
 <h3>Multiplier schedule</h3><p className="small muted">Stage boundaries and tier weights are authored values; the engine derives the roll. Values are permille weights within the stage.</p><div className="audit"><table><thead><tr><th>From turn</th><th>Tier weights</th></tr></thead><tbody>{(Array.isArray(schedule)?schedule as unknown[]:[]).map((stage,index)=>{const row=stage as Record<string,unknown>,tiers=Array.isArray(row.tiers)?row.tiers as Record<string,unknown>[]:[];return <tr key={index}><td><input className="aetheria-field" type="number" min={0} disabled={!editable} value={typeof row.from==='number'?row.from as number:0} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)change(['multiplier','schedule',String(index),'from'],next);}}/></td><td>{tiers.map((tier,tierIndex)=><label key={tierIndex} className="small">x{String(tier.multiplier)} <input className="aetheria-field" type="number" min={0} disabled={!editable} value={typeof tier.weight==='number'?tier.weight as number:0} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)change(['multiplier','schedule',String(index),'tiers',String(tierIndex),'weight'],next);}}/></label>)}</td></tr>;})}</tbody></table></div>
 <h3>Settlement rewards</h3><p className="small muted">Paid exactly once per seated participant from this published bundle; losses use the loss values.</p><div className="fields">{([['clearAchievementPoints','Clear Achievement Points'],['clearCoins','Clear coins'],['clearExp','Clear Pet EXP'],['lossAchievementPoints','Loss Achievement Points'],['lossCoins','Loss coins'],['lossExp','Loss Pet EXP']] as const).map(([key,label])=><Num key={key} label={label} value={read(bundle,['rewards',key])} onChange={value=>change(['rewards',key],value)}/>)}</div>
 <h3>Skills</h3><div className="audit"><table><thead><tr><th>Skill</th><th>Mana</th><th>Rage</th><th>Cooldown</th><th>Power (pm)</th></tr></thead><tbody>{(Array.isArray(bundle?.skills)?bundle!.skills as unknown[]:[]).map((skill,index)=>{const row=skill as Record<string,unknown>;return <tr key={index}><td>{String(row.id)}</td>{['manaCost','rageCost','cooldownTurns','powerPm'].map(key=><td key={key}><input className="aetheria-field" type="number" min={0} disabled={!editable} value={typeof row[key]==='number'?row[key] as number:0} onChange={event=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=0)change(['skills',String(index),key],next);}}/></td>)}</tr>;})}</tbody></table></div>
 <h3>Raw bundle (advanced)</h3><textarea className="aetheria-field" rows={14} value={json} onChange={event=>setJson(event.target.value)} disabled={!editable} /><p><button type="button" className="aetheria-button secondary" disabled={busy||!editable} onClick={applyJson}>Apply JSON to editor</button></p>
 </section>:null}
 <section className="aetheria-card"><h2>Publication audit</h2><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void loadAudit()}>Load audit</button>{audit?<div className="audit"><table><thead><tr><th>Seq</th><th>Action</th><th>Version</th><th>Actor</th><th>When</th></tr></thead><tbody>{audit.events.map(event=><tr key={event.sequence}><td>{event.sequence}</td><td>{event.action}</td><td>{event.version}</td><td>{event.actor}</td><td>{new Date(event.occurredAt).toLocaleString()}</td></tr>)}</tbody></table></div>:null}</section>
 </>;
}
