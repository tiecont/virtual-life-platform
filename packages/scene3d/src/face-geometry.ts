import * as T from 'three';
import {indexGeometry} from './index-geometry';

// Preserve skin/morph seams when indexing the original technical face batches.
// Three's ordinary mergeVertices key includes base attributes only.
export function compactFaceGeometry(geometry:T.BufferGeometry,maximumDimension=2048):T.BufferGeometry[]{
 const indexed=indexGeometry(geometry,1e-12);
 const stride=indexed.morphAttributes.color?3:indexed.morphAttributes.normal?2:1,maximumVertices=Math.floor(maximumDimension/stride);
 if(indexed.getAttribute('position').count<=maximumVertices)return[indexed];
 // Only the closeup High ear batch currently needs splitting. Preserve the
 // triangle stream and all morph attributes; gameplay retains one face draw.
 const expanded=indexed.toNonIndexed(),chunks:T.BufferGeometry[]=[],step=Math.floor(maximumVertices/3)*3;
 if(step<3){expanded.dispose();indexed.dispose();throw Error('Face texture limit cannot hold one triangle');}
 function slice(attribute:T.BufferAttribute|T.InterleavedBufferAttribute,start:number,end:number){if(!(attribute instanceof T.BufferAttribute))throw Error('Technical face attributes must be non-interleaved');const result=new T.BufferAttribute(attribute.array.slice(start*attribute.itemSize,end*attribute.itemSize),attribute.itemSize,attribute.normalized);result.setUsage(attribute.usage);result.gpuType=attribute.gpuType;return result;}
 for(let start=0;start<expanded.getAttribute('position').count;start+=step){const end=Math.min(start+step,expanded.getAttribute('position').count),chunk=new T.BufferGeometry();for(const [name,attribute]of Object.entries(expanded.attributes))chunk.setAttribute(name,slice(attribute,start,end));for(const [name,targets]of Object.entries(expanded.morphAttributes))chunk.morphAttributes[name as keyof typeof chunk.morphAttributes]=targets.map(target=>slice(target,start,end));chunk.morphTargetsRelative=expanded.morphTargetsRelative;chunks.push(chunk);}
 expanded.dispose();indexed.dispose();return chunks;
}
