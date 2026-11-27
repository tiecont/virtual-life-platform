// JSON values come from the active publication and the selected editor bundle.
export interface BundleDifference {
 path:string;
 before:unknown;
 after:unknown;
}

function record(value:unknown):value is Record<string,unknown>{
 return value!==null && typeof value==='object' && !Array.isArray(value);
}

export function bundleDifferences(before:unknown,after:unknown,path=''):BundleDifference[]{
 if(Object.is(before,after))return [];
 if(Array.isArray(before)&&Array.isArray(after)){
  const changes:BundleDifference[]=[];
  for(let index=0;index<Math.max(before.length,after.length);index++){
   const previous:unknown=before[index],next:unknown=after[index];
   const previousId=record(previous)?previous.id:undefined;
   const nextId=record(next)?next.id:undefined;
   const id=nextId??previousId;
   const itemPath=typeof id==='string'?`${path}[${index}: ${id}]`:`${path}[${index}]`;
   changes.push(...bundleDifferences(previous,next,itemPath));
  }
  return changes;
 }
 if(record(before)&&record(after)){
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  return [...keys].flatMap(key=>bundleDifferences(before[key],after[key],path?path+'.'+key:key));
 }
 return [{path:path||'(root)',before,after}];
}
