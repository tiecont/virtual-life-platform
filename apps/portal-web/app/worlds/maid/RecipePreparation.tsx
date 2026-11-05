'use client';
import { useEffect,useState } from 'react';
import type { Orders } from '../../components/use-hospitality-orders';
type Ticket=Orders['items'][number];
export default function RecipePreparation({order,blocked,submit,restart}:{order:Ticket;blocked:boolean;submit:(ingredients:string[])=>void;restart:()=>void}){
 const [picked,setPicked]=useState<string[]>([]),[now,setNow]=useState(Date.now());const challenge=order.service?.preparation;
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);
 if(!challenge)return <p>Preparation could not be confirmed. Refresh the service ticket.</p>;
 const expired=now>=Date.parse(challenge.expiresAt),waiting=now<Date.parse(order.service?.readyAt??''),complete=picked.length===challenge.recipe.length&&picked.every((value,i)=>value===challenge.recipe[i]);
 return <section className="maid-recipe" aria-label="Ingredient preparation"><h5>Follow the recipe</h5><p>Recipe: {challenge.recipe.join(' → ')}. Add ingredients in order. Reset to try again.</p>
  {expired?<><p>Preparation expired. Start a fresh attempt to continue.</p><button disabled={blocked} onClick={restart}>Restart preparation</button></>:<><div className="maid-ingredient-choices">{challenge.choices.map(value=><button key={value} disabled={blocked||picked.length>=challenge.recipe.length} onClick={()=>setPicked(current=>[...current,value])}>Add {value}</button>)}</div><ol aria-label="Selected ingredients">{picked.map((value,i)=><li key={i}>{value}</li>)}</ol><button disabled={blocked||picked.length===0} onClick={()=>setPicked([])}>Reset ingredients</button><button disabled={blocked||!complete||waiting} onClick={()=>submit(picked)}>Finish recipe preparation</button>{waiting&&<p>Preparation is still warming up. The server confirms when it is ready.</p>}</>}
  <p>This is virtual service. No score,tip or payment is required.</p>
 </section>;
}
