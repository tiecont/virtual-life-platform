import type {GameplayBundle,GameplaySimulationParty} from '@aetheria/contracts';

function records(value:unknown):Record<string,unknown>[] {
 return Array.isArray(value)?value.filter((row):row is Record<string,unknown>=>row!==null&&typeof row==='object'&&typeof row.id==='string'):[];
}
export function initialParty(bundle:GameplayBundle):GameplaySimulationParty {
 const pets=records(bundle.pets);
 return pets.length?Array.from({length:4},(_,index)=>({petId:String(pets[index%pets.length]!.id),level:1,skillLevels:[],artifacts:[]})):[];
}

export function SimulationParty({bundle,party,onChange}:{bundle:GameplayBundle;party:GameplaySimulationParty;onChange:(party:GameplaySimulationParty)=>void}) {
 const pets=records(bundle.pets),skills=records(bundle.skills),artifacts=records(bundle.artifacts);
 function update(index:number,patch:Partial<GameplaySimulationParty[number]>) {
  onChange(party.map((seat,i)=>i===index?{...seat,...patch}:seat));
 }
 return <details><summary>Simulation party</summary>{party.map((seat,index)=>{
  const pet=pets.find(p=>p.id===seat.petId);
  const ownedSkills=['skill','signature','ultimate','guard','fireZone'].map(key=>pet?.[key]);
  return <fieldset key={index}><legend>Seat {index+1}</legend><div className="fields">
   <label>Pet<select value={seat.petId} onChange={e=>update(index,{petId:e.target.value,skillLevels:[]})}>
    {pets.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.id)}</option>)}
   </select></label>
   <label>Pet level<input type="number" min={1} max={100} value={seat.level} onChange={e=>{
    const level=e.target.valueAsNumber;
    if(Number.isInteger(level)&&level>=1&&level<=100)update(index,{level,artifacts:seat.artifacts.filter(item=>Number(artifacts.find(a=>a.id===item.definitionId)?.requiredPetLevel)<=level)});
   }}/></label>
   {skills.filter(s=>ownedSkills.includes(s.id)&&Array.isArray(s.upgradeLevels)&&s.upgradeLevels.length).map(s=>{
    const id=String(s.id),cap=1+(s.upgradeLevels as unknown[]).length;
    return <label key={id}>{id} level<select value={seat.skillLevels.find(v=>v.skillId===id)?.level??1} onChange={e=>{
     const level=Number(e.target.value),others=seat.skillLevels.filter(v=>v.skillId!==id);
     update(index,{skillLevels:level===1?others:[...others,{skillId:id,level}]});
    }}>{Array.from({length:cap},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>;
   })}
   {artifacts.length>0&&(['core','aegis','rune'] as const).map(slot=>{
    const item=seat.artifacts.find(a=>a.slot===slot),others=seat.artifacts.filter(a=>a.slot!==slot);
    return <div key={slot}><label>{slot}<select value={item?.definitionId??''} onChange={e=>{
     const definitionId=e.target.value;
     update(index,{artifacts:definitionId?[...others,{slot,artifactId:crypto.randomUUID(),definitionId,upgradeLevel:1}]:others});
    }}><option value="">Unequipped</option>{artifacts.filter(a=>a.slot===slot&&Number(a.requiredPetLevel)<=seat.level).map(a=><option key={String(a.id)}>{String(a.id)}</option>)}</select></label>
    {item&&<label>{slot} upgrade level<select value={item.upgradeLevel} onChange={e=>update(index,{artifacts:[...others,{...item,upgradeLevel:Number(e.target.value)}]})}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>}</div>;
   })}
  </div></fieldset>;
 })}</details>;
}
