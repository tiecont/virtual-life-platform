import {useState} from 'react';
import type {GameplayBundle} from '@aetheria/contracts';

type Row={materials:number;powerPm:number};

export function SkillTrainingEditor({bundle,editable,change}:{bundle:GameplayBundle;editable:boolean;change:(path:string[],value:unknown)=>void}) {
 const [petSelection,setPet]=useState(''),[skillSelection,setSkill]=useState('');
 const [materialInput,setMaterials]=useState(''),[powerInput,setPower]=useState('');
 if(bundle.schemaVersion!==2||!Array.isArray(bundle.skills)||!Array.isArray(bundle.pets))return null;
 const pets=bundle.pets as Record<string,unknown>[],skills=bundle.skills as Record<string,unknown>[];
 const pet=pets.find(p=>p.id===petSelection)??pets[0];
 if(!pet)return null;
 const slots=['skill','signature','ultimate','guard','fireZone'].map(key=>pet[key]).filter(id=>typeof id==='string');
 const id=slots.includes(skillSelection)?skillSelection:slots[0];
 const index=skills.findIndex(skill=>skill.id===id);
 const skill=skills[index];
 if(!skill)return null;
 const rows=Array.isArray(skill.upgradeLevels)?skill.upgradeLevels as Row[]:[];
 const effect=skill.effect as Record<string,unknown>;
 const kind=String(effect?.kind??''),target=String(effect?.target??'');
 const timedPartyStatus=(kind==='buff'||kind==='debuff')&&target!=='boss';
 function effectField(key:string,label:string,min:number,max:number){
  return <label>{label}<input className="aetheria-field" type="number" min={min} max={max} step={1} value={Number(effect[key])}
   onChange={event=>{
    const value=event.target.valueAsNumber;
    if(Number.isSafeInteger(value)&&value>=min&&value<=max)change(['skills',String(index),'effect',key],value);
   }}/></label>;
 }
 const last=rows.at(-1)?.powerPm??Number(skill.powerPm);
 const materials=Number(materialInput),powerPm=Number(powerInput);
 const valid=Number.isInteger(materials)&&materials>=1&&materials<=1000000&&Number.isInteger(powerPm)&&powerPm>last&&powerPm<=10000;
 function save(next:Row[]){change(['skills',String(index),'upgradeLevels'],next.length?next:undefined);}
 function clearInput(){setMaterials('');setPower('');}
 return <details><summary>Skill training costs and levels</summary>
  <label>Training Pet<select value={String(pet.id)} onChange={e=>{setPet(e.target.value);setSkill('');clearInput();}}>{pets.map(p=><option key={String(p.id)}>{String(p.id)}</option>)}</select></label>
  <label>Training skill<select value={id} onChange={e=>{setSkill(e.target.value);clearInput();}}>{slots.map(value=><option key={value}>{value}</option>)}</select></label>
  {effect&&<fieldset disabled={!editable}><legend>{kind} · {target}</legend><div className="fields">
   {kind!=='cleanse'&&effectField('value','Base effect value',1,4294967295)}
   {(timedPartyStatus||kind==='damage-over-time'||kind==='curse')&&effectField('durationTurns','Effect duration (turns)',1,32)}
   {kind==='chain-damage'&&effectField('hits','Hits per cast',2,8)}
   {timedPartyStatus&&effectField('stackingPm','Reapplication scaling (‰)',1,10000)}
  </div></fieldset>}
  <p>Level 1 power {String(skill.powerPm)}‰ · Maximum skill level {rows.length+1}</p>
  <fieldset disabled={!editable}>{rows.map((row,i)=><div key={i} className="fields">
   <strong>Level {i+2}</strong>{(['materials','powerPm'] as const).map(key=><label key={key}>{key==='materials'?'Materials':'Power (‰)'}<input className="aetheria-field" type="number" min={1} value={row[key]} onChange={e=>{
    const n=e.target.valueAsNumber;
    if(Number.isInteger(n)&&n>=1&&n<=(key==='materials'?1000000:10000))save(rows.map((r,j)=>i===j?{...r,[key]:n}:r));
   }}/></label>)}
  </div>)}
  {rows.length>0&&<button type="button" className="text-button" onClick={()=>save(rows.slice(0,-1))}>Remove highest level</button>}
  {rows.length<9&&effect?.kind!=='cleanse'&&<div className="fields">
   <label>New level material cost<input className="aetheria-field" type="number" min={1} max={1000000} value={materialInput} onChange={e=>setMaterials(e.target.value)}/></label>
   <label>New level power (‰)<input className="aetheria-field" type="number" min={last+1} max={10000} value={powerInput} onChange={e=>setPower(e.target.value)}/></label>
   <button type="button" disabled={!valid} onClick={()=>{save([...rows,{materials,powerPm}]);clearInput();}}>Add level {rows.length+2}</button>
  </div>}
  </fieldset></details>;
}
