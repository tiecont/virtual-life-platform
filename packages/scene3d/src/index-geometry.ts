import * as T from 'three';
import {mergeVertices,remapAttribute} from 'three/addons/utils/BufferGeometryUtils.js';

// Same quantized equality and first-occurrence order as mergeVertices, including
// morph seams. Numeric buckets avoid a long decimal string for every vertex.
// Hash collisions always compare the complete quantized row before merging.
export function indexGeometry(geometry:T.BufferGeometry,tolerance:number){
 const attributes=[...Object.values(geometry.attributes),...Object.values(geometry.morphAttributes).flat()];
 const getters=['getX','getY','getZ','getW'] as const;
 function fallback(){
  const source=geometry.clone(),temporary:string[]=[];
  for(const targets of Object.values(source.morphAttributes))for(const target of targets){let name='__index_morph_'+temporary.length;while(source.hasAttribute(name))name+='_';source.setAttribute(name,target);temporary.push(name);}
  const result=mergeVertices(source,tolerance);source.dispose();for(const name of temporary)result.deleteAttribute(name);return result;
 }
 if(attributes.some(attribute=>!(attribute instanceof T.BufferAttribute)||attribute.itemSize>4||getters.slice(0,attribute.itemSize).some(getter=>attribute[getter]!==T.BufferAttribute.prototype[getter])))return fallback();
 const plain=attributes as T.BufferAttribute[],count=geometry.getAttribute('position').count,width=plain.reduce((sum,attribute)=>sum+attribute.itemSize,0);
 const safeTolerance=Math.max(tolerance,Number.EPSILON),multiplier=Math.pow(10,Math.log10(1/safeTolerance)),additive=safeTolerance*.5*multiplier,keys=new Float64Array(count*width);
 let offset=0;
 for(const attribute of plain){
  const array=attribute.array,size=attribute.itemSize;let divisor=1,minimum=-Infinity;
  if(attribute.normalized){
   if(array instanceof Uint8Array)divisor=255;else if(array instanceof Uint16Array)divisor=65535;else if(array instanceof Uint32Array)divisor=4294967295;
   else if(array instanceof Int8Array){divisor=127;minimum=-1;}else if(array instanceof Int16Array){divisor=32767;minimum=-1;}else if(array instanceof Int32Array){divisor=2147483647;minimum=-1;}
   else if(!(array instanceof Float32Array))return fallback();
  }
  for(let vertex=0;vertex<count;vertex++)for(let component=0;component<size;component++){const raw=Number(array[vertex*size+component]),value=divisor===1?raw:Math.max(raw/divisor,minimum);keys[vertex*width+offset+component]=Math.trunc(value*multiplier+additive);}
  offset+=size;
 }
 const sourceIndices:number[]=[],newIndices:number[]=[],heads=new Map<number,number>(),next=new Int32Array(count),input=geometry.index;
 function equal(a:number,b:number){for(let component=0;component<width;component++){const x=keys[a*width+component],y=keys[b*width+component];if(x!==y&&!(Number.isNaN(x)&&Number.isNaN(y)))return false;}return true;}
 for(let position=0,total=input?.count??count;position<total;position++){
  const vertex=input?input.getX(position):position;if(!Number.isInteger(vertex)||vertex<0||vertex>=count)return fallback();
  let hash=2166136261;for(let component=0;component<width;component++){const value=keys[vertex*width+component];hash=Math.imul(hash^(value|0),16777619);hash=Math.imul(hash^(Math.trunc(value/4294967296)|0),16777619);}
  const head=heads.get(hash);let index=head??-1;while(index!==-1&&!equal(vertex,sourceIndices[index]))index=next[index];
  if(index===-1){index=sourceIndices.length;sourceIndices.push(vertex);next[index]=head??-1;heads.set(hash,index);}newIndices.push(index);
 }
 const result=geometry.clone(),buffers=new Map();
 for(const [name,attribute]of Object.entries(geometry.attributes))result.setAttribute(name,remapAttribute(attribute,sourceIndices,buffers));
 for(const [name,targets]of Object.entries(geometry.morphAttributes))result.morphAttributes[name as keyof typeof result.morphAttributes]=targets.map(attribute=>remapAttribute(attribute,sourceIndices,buffers));
 result.setIndex(newIndices);return result;
}
