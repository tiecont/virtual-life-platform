export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type ReadonlyJson=null|boolean|number|string|readonly ReadonlyJson[]|{readonly[key:string]:ReadonlyJson};
// A bounded plain-data clone isolates reducer inputs,including malformed cyclic
// or prototype-bearing persistence. No system clock,randomness or I/O is used.
export function immutableJson<T>(value:T):T{
 const seen=new Set<object>();let nodes=0;
 function copy(input:unknown,depth:number):Json{
  if(++nodes>30000||depth>32)throw Error('Invalid game data');
  if(input===null||typeof input==='string'||typeof input==='boolean')return input;
  if(typeof input==='number'&&Number.isFinite(input))return input;
  if(typeof input!=='object'||seen.has(input))throw Error('Invalid game data');
  const prototype=Object.getPrototypeOf(input);if(!Array.isArray(input)&&prototype!==Object.prototype&&prototype!==null)throw Error('Invalid game data');
  seen.add(input);let next:Json;const descriptors=Object.getOwnPropertyDescriptors(input);
  if(Object.values(descriptors).some(descriptor=>!Object.hasOwn(descriptor,'value')))throw Error('Invalid game accessor');
  if(Array.isArray(input)){const values:Json[]=[];for(let index=0;index<input.length;index++){const descriptor=descriptors[String(index)];if(!descriptor)throw Error('Invalid sparse game array');values.push(copy(descriptor.value,depth+1));}if(Object.keys(descriptors).some(key=>key!=='length'&&!/^(0|[1-9][0-9]*)$/.test(key)))throw Error('Invalid game array property');next=values;}
  else{const record:Record<string,Json>=Object.create(null);for(const [key,descriptor]of Object.entries(descriptors)){if(['__proto__','prototype','constructor'].includes(key)||!descriptor.enumerable)throw Error('Invalid game data');record[key]=copy(descriptor.value,depth+1);}next=record;}
  seen.delete(input);return Object.freeze(next)as Json;
 }
 return copy(value,0)as T;
}
