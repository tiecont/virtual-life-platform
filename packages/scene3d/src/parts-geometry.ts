import * as T from 'three';
import {indexGeometry} from './index-geometry';
import type {AvatarParts} from '@virtual-city/contracts';
import {TORSO_PROFILE} from './surfaces';
const coatColors={fern:['#a99d7e','#f0e5cf'],amber:['#c49a65','#f5dfba'],indigo:['#7a879c','#e0e5ec'],rose:['#bb928c','#f5dfd5'],cloud:['#c6cccb','#f8f3e7'],cocoa:['#927563','#ebd5be'],mint:['#8da89c','#e5eee1'],plum:['#a48a9e','#efe1e8']} as const;
export const partCoatColor=(parts:AvatarParts)=>coatColors[parts.fur][0];
// Same rig and authority footprint. Deformation is confined to presentation
// buffers;both base and blink targets follow the same transform.
export function shapePartGeometry(geometry:T.BufferGeometry,parts:AvatarParts,coat=false){
 const indices=geometry.getAttribute('skinIndex'),p=new T.Vector3();
 const deform=(point:T.Vector3,bone:number)=>{
  if(bone===6||bone===7){const side=bone===6?-1:1,pivot=new T.Vector3(side*.135,1.19,-.025),delta=point.sub(pivot);
   if(parts.ears==='long'||parts.ears==='bent'){delta.y*=1.7;delta.x*=.8;if(parts.ears==='bent'&&delta.y>.22)delta.x+=side*(delta.y-.22)*1.25;}
   if(parts.ears==='tufted')delta.y*=1.14;
   if(parts.ears==='floppy')delta.applyAxisAngle(new T.Vector3(0,0,1),side*-1.55).multiplyScalar(1.15);
   if(parts.ears==='upright')delta.x*=1.12;
   return point.add(pivot);
  }
  if(bone>=20){if(parts.tail==='plume')point.x*=1.5;if(parts.tail==='curl'){const dy=point.y-.48,dz=point.z+.11;point.y=.48+dy*.65;point.z=-.11+dz*.55+.12*Math.sin(dy*7);}if(parts.tail==='wag')point.x+=Math.sin((point.y-.48)*5)*.07;return point;}
  if(bone===5){if(parts.head==='wide')point.x*=1.13;const muzzle=T.MathUtils.smoothstep(point.z,.10,.17)*(1-T.MathUtils.smoothstep(point.y,1.04,1.10));point.z+=muzzle*(parts.species==='dog'?.065:parts.species==='rabbit'?.018:0);if(parts.muzzle==='small')point.z-=muzzle*.025;}
  // Body shape may narrow the torso/hips,not move paws/feet away from the
  // shared serving and floor anchors owned by the unchanged24bone rig.
  else if(parts.body==='slender'&&bone<=3)point.x*=.84;
  return point;
 };
 for(const attribute of [geometry.getAttribute('position'),...(geometry.morphAttributes.position??[])])for(let i=0;i<attribute.count;i++){p.fromBufferAttribute(attribute,i);deform(p,indices.getX(i));attribute.setXYZ(i,p.x,p.y,p.z);}
 if(coat){const primary=new T.Color(coatColors[parts.fur][0]),cream=new T.Color(coatColors[parts.fur][1]),colors=geometry.getAttribute('color'),position=geometry.getAttribute('position');
  for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i);const bib=T.MathUtils.smoothstep(p.z,.07,.14)*(1-T.MathUtils.smoothstep(p.y,.82,.91))*(1-T.MathUtils.smoothstep(Math.abs(p.x),.08,.15)),face=T.MathUtils.smoothstep(p.y,.94,1.02)*T.MathUtils.smoothstep(p.z,.10,.17),socks=1-T.MathUtils.smoothstep(p.y,.12,.18);let mask=Math.max(bib,face,socks);
   if(parts.marking==='patch'&&p.y>.96&&p.x<-.025)mask*=.1;
   const color=primary.clone().lerp(cream,mask*.9);if(parts.marking==='freckles'&&p.y>.94&&p.z>.11&&Math.sin(p.x*185)*Math.sin(p.y*170)>.72)color.multiplyScalar(.55);color.toArray(colors.array,i*3);
  }
 }
 geometry.computeBoundingSphere();return geometry;
}
// Modular variants must not multiply the legacy unindexed buffers by20.
// Quantize only the v2 path;legacy rig/visual streams remain unchanged.
export function packPartGeometry(input:T.BufferGeometry,recomputeNormals=false){
 const geometry=input.clone();
 for(const [name,attribute]of Object.entries(geometry.attributes)){
  if(name==='position')continue;
  if(name==='skinIndex'){const data=Uint8Array.from(attribute.array);geometry.setAttribute(name,new T.Uint8BufferAttribute(data,attribute.itemSize));continue;}
  if(name==='skinWeight'){
   const data=new Uint8Array(attribute.count*4);for(let i=0;i<attribute.count;i++){let sum=0,largest=0;for(let j=0;j<4;j++){const value=Math.round(Number(attribute.array[i*4+j])*255);data[i*4+j]=value;sum+=value;if(value>data[i*4+largest])largest=j;}data[i*4+largest]+=255-sum;}
   geometry.setAttribute(name,new T.Uint8BufferAttribute(data,4,true));continue;
  }
  if(name==='normal')geometry.setAttribute(name,new T.Int16BufferAttribute(Int16Array.from(attribute.array,v=>Math.round(T.MathUtils.clamp(Number(v),-1,1)*32767)),attribute.itemSize,true));
  if(name==='color')geometry.setAttribute(name,new T.Uint8BufferAttribute(Uint8Array.from(attribute.array,v=>Math.round(T.MathUtils.clamp(Number(v),0,1)*255)),attribute.itemSize,true));
  if(name==='uv')geometry.setAttribute(name,new T.Uint16BufferAttribute(Uint16Array.from(attribute.array,v=>Math.round(T.MathUtils.clamp(Number(v),0,1)*65535)),attribute.itemSize,true));
 }
 // Include morphs in the vertex key,as in the established face compressor.
 const packed=indexGeometry(geometry,1e-10);geometry.dispose();if(recomputeNormals)packed.computeVertexNormals();packed.computeBoundingSphere();return packed;
}
function torsoRadius(y:number){for(let i=1;i<TORSO_PROFILE.length;i++){const [r0,y0]=TORSO_PROFILE[i-1],[r1,y1]=TORSO_PROFILE[i];if(y<=y1)return T.MathUtils.lerp(r0,r1,T.MathUtils.clamp((y-y0)/(y1-y0),0,1));}return TORSO_PROFILE.at(-1)![0];}
// Include the roots just beyond a hem:their downward tips can otherwise cross
// the fabric even when roots directly beneath it have already been hidden.
export function coveredByGarment(point:T.Vector3,parts?:AvatarParts){return parts?.outfit==='knit'&&point.y>.60&&point.y<.90&&Math.abs(point.x)<.20||parts?.outfit==='overalls'&&point.y>.55&&point.y<.84&&point.z>.03&&Math.abs(point.x)<.16;}
export function addPartDetails(parts:AvatarParts,quality:'low'|'balanced'|'high',add:(geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D)=>T.Mesh,bones:T.Bone[],cloth:T.Material,dark:T.Material,hair:T.Material){
 const segments=quality==='low'?8:quality==='balanced'?12:20;
 if(parts.hair==='tuft')for(let i=0;i<3;i++){const tuft=add(new T.ConeGeometry(.027-i*.004,.09-i*.008,quality==='low'?5:8),hair,bones[5]);tuft.position.set((i-1)*.031,.19+i*.004,.025);tuft.rotation.z=(1-i)*.24;}
 if(parts.outfit==='knit'){
  const points=[.62,.70,.81,.86].map(y=>new T.Vector2(torsoRadius(y)+.012,y-.66));const shirt=add(new T.LatheGeometry(points,segments).scale(1,1,.8),cloth,bones[2]);shirt.name='Woven knit';
 }
 if(parts.outfit==='overalls'){
  const panel=new T.PlaneGeometry(.245,.21,quality==='low'?4:6,4),position=panel.getAttribute('position');for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i)+.685,radius=torsoRadius(y),z=Math.sqrt(Math.max(0,1-(x/radius)**2))*radius*.8+.014;position.setXYZ(i,x,y-.66,z);}panel.computeVertexNormals();const bib=add(panel,cloth,bones[2]);bib.name='Overalls bib';for(const side of [-1,1]){const strap=add(new T.BoxGeometry(.029,.18,.018),cloth,bones[3]);strap.position.set(side*.085,-.008,.14);strap.rotation.z=side*.13;}
 }
 if(parts.accessory==='scarf'){const scarf=add(new T.TorusGeometry(.11,.025,quality==='low'?4:6,segments),cloth,bones[4]);scarf.rotation.x=Math.PI/2;const end=add(new T.BoxGeometry(.045,.13,.018),cloth,bones[3]);end.position.set(.065,-.045,.18);end.rotation.z=-.18;}
 if(parts.accessory==='glasses'){
  for(const side of [-1,1]){const frame=add(new T.TorusGeometry(.065,.006,4,segments),dark,bones[5]);frame.position.set(side*.096,.029,.207);frame.scale.y=1.06;}
  const bridge=add(new T.BoxGeometry(.075,.009,.01),dark,bones[5]);bridge.position.set(0,.029,.207);
 }
 if(parts.accessory==='cap'){const cap=add(new T.SphereGeometry(.209,segments,quality==='low'?4:8,0,Math.PI*2,0,Math.PI/2.2).scale(1,.5,.88),cloth,bones[5]);cap.position.y=.135;const brim=add(new T.BoxGeometry(.27,.014,.13),cloth,bones[5]);brim.position.set(0,.14,.16);}
}
