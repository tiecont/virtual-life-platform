'use client';
import {useEffect,useRef,useState} from 'react';
import {
  EconomyPolicyAuditSchema,
  EconomyPolicyMutationResultSchema,
  EconomyPolicyOverviewSchema,
  EconomyPolicyPublishSchema,
  EconomyPolicyValuesSchema,
  type EconomyPolicyValues,
} from '@aetheria/contracts';

type Overview=ReturnType<typeof EconomyPolicyOverviewSchema.parse>;
type Audit=ReturnType<typeof EconomyPolicyAuditSchema.parse>;
type Request=(action:string,body?:unknown,signal?:AbortSignal)=>Promise<unknown>;

function toDraft(active:NonNullable<Overview['active']>):EconomyPolicyValues{
  return {
    energyMax:active.energyMax,
    energyRegenSeconds:active.energyRegenSeconds,
    activityEnergyCost:active.activityEnergyCost,
    diamondToLuminousStoneRate:1,
    firstClearLuminousStones:active.firstClearLuminousStones,
    bossFirstClearLuminousStones:active.bossFirstClearLuminousStones,
    gachaSingleCostCoins:active.gachaSingleCostCoins,
    gachaSingleCostLuminousStones:active.gachaSingleCostLuminousStones,
    gachaDisclosure:{...active.gachaDisclosure},
  };
}

function IntField({
  label,value,min,max,disabled,onChange,
}:{
  label:string;value:number;min:number;max:number;disabled:boolean;onChange:(next:number)=>void;
}){
  return <label>{label}<input className="aetheria-field" type="number" step={1} min={min} max={max} disabled={disabled} value={value} onChange={event=>{
    const next=event.target.valueAsNumber;
    if(Number.isSafeInteger(next)&&next>=min&&next<=max)onChange(next);
  }}/></label>;
}

// Operator-only PostgreSQL Economy Authority editor: energy policy, locked 1:1
// diamond conversion notice, first-clear Luminous Stone grants, gacha pricing,
// published gacha odds/guarantee/duplicate disclosure, rollback, and audit.
export function EconomyPolicyConfig({request}:{request:Request}){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [draft,setDraft]=useState<EconomyPolicyValues|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [reason,setReason]=useState('');
  const [initialJson,setInitialJson]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const lock=useRef(false);

  async function work(run:()=>Promise<void>){
    if(lock.current)return;
    lock.current=true;setBusy(true);setMessage('');
    try{await run();}
    catch(error){setMessage(error instanceof Error?error.message:'Economy policy request failed.');}
    finally{lock.current=false;setBusy(false);}
  }

  async function load(){
    const response=await request('economy-policy');
    if(response===null){setOverview(null);setDraft(null);return;}
    const current=EconomyPolicyOverviewSchema.parse(response);
    setOverview(current);
    setDraft(current.active?toDraft(current.active):null);
    return current;
  }

  useEffect(()=>{void work(async()=>{await load();});},[]);

  async function publish(){
    if(!overview)return;
    await work(async()=>{
      const policy=draft??EconomyPolicyValuesSchema.parse(JSON.parse(initialJson));
      const payload=EconomyPolicyPublishSchema.parse({
        requestId:crypto.randomUUID(),
        expectedActiveRevision:overview.activeRevision,
        reason:reason.trim(),
        policy,
      });
      const result=EconomyPolicyMutationResultSchema.parse(await request('economy-policy-publish',payload));
      await load();
      setMessage('Published economy policy version '+result.version+' at active revision '+result.activeRevision+'.');
    });
  }

  async function rollback(version:number){
    if(!overview)return;
    await work(async()=>{
      const result=EconomyPolicyMutationResultSchema.parse(await request('economy-policy-rollback',{
        requestId:crypto.randomUUID(),
        version,
        expectedActiveRevision:overview.activeRevision,
        reason:reason.trim()||'OPERATOR_POLICY_ROLLBACK',
      }));
      await load();
      setMessage('Rolled back active economy policy to version '+result.version+' at revision '+result.activeRevision+'.');
    });
  }

  async function loadAudit(){
    await work(async()=>{
      setAudit(EconomyPolicyAuditSchema.parse(await request('economy-policy-audit')));
    });
  }

  if(!overview&&!message)return null;

  return <section className="aetheria-card" aria-labelledby="economy-authority-heading">
    <div className="card-heading">
      <h2 id="economy-authority-heading">Economy authority</h2>
      <button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void work(async()=>{await load();setMessage('Economy policy refreshed.');})}>Refresh economy policy</button>
    </div>
    <p className="small muted">Configure the local wallet. Activity energy costs, first-clear rewards and acquisition settings are stored for future integration. Real-money purchases are disabled.</p>
    {message?<p role="status" aria-live="polite">{message}</p>:null}
    {overview?.active&&draft?<>
      <dl className="metrics">
        <div><dt>Active policy version</dt><dd>{overview.activeVersion}</dd></div>
        <div><dt>Active revision</dt><dd>{overview.activeRevision}</dd></div>
        <div><dt>Diamond to Stone rate</dt><dd>1:1 (locked)</dd></div>
        <div><dt>Real-money purchases</dt><dd>{overview.active.gachaDisclosure.realMoneyPurchasesEnabled?'Enabled':'Disabled'}</dd></div>
        <div><dt>Updated by</dt><dd>{overview.updatedBy}</dd></div>
        <div><dt>Published at</dt><dd>{new Date(overview.active.publishedAt).toLocaleString()}</dd></div>
      </dl>

      <h3>Energy & rewards</h3>
      <div className="fields">
        <IntField label="Energy cap" value={draft.energyMax} min={1} max={10000} disabled={busy} onChange={energyMax=>setDraft({...draft,energyMax})}/>
        <IntField label="Energy regen interval (seconds)" value={draft.energyRegenSeconds} min={10} max={86400} disabled={busy} onChange={energyRegenSeconds=>setDraft({...draft,energyRegenSeconds})}/>
        <IntField label="Authorized activity energy cost" value={draft.activityEnergyCost} min={0} max={1000} disabled={busy} onChange={activityEnergyCost=>setDraft({...draft,activityEnergyCost})}/>
        <IntField label="Solo first-clear Luminous Stones" value={draft.firstClearLuminousStones} min={0} max={1000000} disabled={busy} onChange={firstClearLuminousStones=>setDraft({...draft,firstClearLuminousStones})}/>
        <IntField label="Boss/Co-op first-clear Luminous Stones" value={draft.bossFirstClearLuminousStones} min={0} max={1000000} disabled={busy} onChange={bossFirstClearLuminousStones=>setDraft({...draft,bossFirstClearLuminousStones})}/>
        <IntField label="Gacha single summon cost (Coins)" value={draft.gachaSingleCostCoins} min={1} max={1000000} disabled={busy} onChange={gachaSingleCostCoins=>setDraft({...draft,gachaSingleCostCoins})}/>
        <IntField label="Gacha single summon cost (Luminous Stones)" value={draft.gachaSingleCostLuminousStones} min={1} max={1000000} disabled={busy} onChange={gachaSingleCostLuminousStones=>setDraft({...draft,gachaSingleCostLuminousStones})}/>
        <label>Diamond-to-Luminous Stone conversion<input className="aetheria-field" type="text" value="1:1 one-way (owner authorization locked)" readOnly/></label>
      </div>

      <h3>Published gacha odds, guarantee & duplicate disclosure</h3>
      <div className="fields">
        <label>Featured Pet ID<input className="aetheria-field" type="text" disabled={busy} value={draft.gachaDisclosure.featuredPetId} onChange={event=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,featuredPetId:event.target.value}})}/></label>
        <IntField label="Base S probability (ppm)" value={draft.gachaDisclosure.baseSProbabilityPpm} min={1} max={1000000} disabled={busy} onChange={baseSProbabilityPpm=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,baseSProbabilityPpm}})}/>
        <IntField label="Featured share on S pull (ppm)" value={draft.gachaDisclosure.featuredProbabilityPpm} min={1} max={1000000} disabled={busy} onChange={featuredProbabilityPpm=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,featuredProbabilityPpm}})}/>
        <IntField label="Soft pity start pull" value={draft.gachaDisclosure.softPityAt} min={1} max={draft.gachaDisclosure.hardPityAt} disabled={busy} onChange={softPityAt=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,softPityAt}})}/>
        <IntField label="Hard pity pull" value={draft.gachaDisclosure.hardPityAt} min={draft.gachaDisclosure.softPityAt} max={500} disabled={busy} onChange={hardPityAt=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,hardPityAt}})}/>
        <IntField label="Duplicate Pet EXP" value={draft.gachaDisclosure.duplicateExp} min={0} max={1000000} disabled={busy} onChange={duplicateExp=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,duplicateExp}})}/>
        <IntField label="Miss compensation EXP" value={draft.gachaDisclosure.missExp} min={0} max={1000000} disabled={busy} onChange={missExp=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,missExp}})}/>
        <label><input type="checkbox" disabled={busy} checked={draft.gachaDisclosure.guaranteedFeaturedAfterOffRate} onChange={event=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,guaranteedFeaturedAfterOffRate:event.target.checked}})}/> Guarantee next S is featured after off-rate</label>
      </div>
      <label>Player-facing disclosure summary<textarea className="aetheria-field" rows={2} disabled={busy} maxLength={512} value={draft.gachaDisclosure.summary} onChange={event=>setDraft({...draft,gachaDisclosure:{...draft.gachaDisclosure,summary:event.target.value}})}/></label>
      <div className="fields">
        <label>Change reason<input className="aetheria-field" type="text" disabled={busy} minLength={3} maxLength={256} value={reason} onChange={event=>setReason(event.target.value)}/></label>
        <button type="button" className="aetheria-button" disabled={busy||reason.trim().length<3} onClick={()=>void publish()}>Publish new economy version</button>
      </div>

      <h3>Immutable policy versions</h3>
      <div className="audit"><table><thead><tr><th>Version</th><th>Energy</th><th>First-clear stones</th><th>Gacha coins / stones</th><th>Reason</th><th>Published by</th><th/></tr></thead><tbody>
        {overview.versions.map(version=><tr key={version.version}>
          <td>v{version.version}{version.version===overview.activeVersion?' (active)':''}</td>
          <td>{version.energyMax} / {version.energyRegenSeconds}s (cost {version.activityEnergyCost})</td>
          <td>{version.firstClearLuminousStones} / {version.bossFirstClearLuminousStones}</td>
          <td>{version.gachaSingleCostCoins} / {version.gachaSingleCostLuminousStones}</td>
          <td>{version.reason}</td>
          <td>{version.publishedBy}</td>
          <td>
            <button type="button" className="text-button" disabled={busy} onClick={()=>setDraft(toDraft(version))}>Load into form</button>
            {version.version!==overview.activeVersion?<button type="button" className="text-button" disabled={busy||reason.trim().length<3} onClick={()=>void rollback(version.version)}>Roll back</button>:null}
          </td>
        </tr>)}
      </tbody></table></div>

      <p><button type="button" className="aetheria-button secondary" disabled={busy} onClick={()=>void loadAudit()}>Load economy audit trail</button></p>
      {audit?<div className="audit"><table><thead><tr><th>Seq</th><th>Action</th><th>Transition</th><th>Reason</th><th>Actor</th><th>When</th></tr></thead><tbody>
        {audit.events.map(event=><tr key={event.sequence}>
          <td>{event.sequence}</td>
          <td>{event.action}</td>
          <td>{event.beforeVersion??'—'} → {event.afterVersion}</td>
          <td>{event.reason}</td>
          <td>{event.actor}</td>
          <td>{new Date(event.occurredAt).toLocaleString()}</td>
        </tr>)}
      </tbody></table></div>:null}
    </>:overview?<div className="fields">
      <label>Initial policy JSON<textarea className="aetheria-field" rows={10} value={initialJson} disabled={busy} onChange={event=>setInitialJson(event.target.value)}/></label>
      <label>Change reason<input className="aetheria-field" disabled={busy} minLength={3} maxLength={256} value={reason} onChange={event=>setReason(event.target.value)}/></label>
      <button type="button" className="aetheria-button" disabled={busy||!initialJson.trim()||reason.trim().length<3} onClick={()=>void publish()}>Publish initial economy policy</button>
    </div>:null}
  </section>;
}
