import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {SceneManifest} from '@virtual-city/contracts';
export const TILE_METERS=.5;
export function createRoomArt(manifest?:SceneManifest){
 const group=new T.Group(),geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 function woodMap(){const w=128,data=new Uint8Array(w*w*4);for(let y=0;y<w;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,grain=Math.sin(x*.22+Math.sin(y*.037)*2)*.035+Math.sin(x*1.8+Math.sin(y*.065)*2)*.015,knots=Math.sin(x*.13+Math.sin(y*.08))*.02;data[i]=Math.round(156*(1+grain+knots));data[i+1]=Math.round(138*(1+grain));data[i+2]=Math.round(115*(1+grain));data[i+3]=255;}const texture=new T.DataTexture(data,w,w);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2,1);texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.needsUpdate=true;textures.add(texture);return texture;}
 function material(options:T.MeshStandardMaterialParameters){const value=new T.MeshStandardMaterial(options);materials.add(value);return value;}
 const wood=material({color:'#cdbda5',map:woodMap(),roughness:.80}),darkWood=material({color:'#725d49',roughness:.86}),cream=material({color:'#e7ddca',roughness:.97}),fabric=material({color:'#69847a',roughness:1}),leaf=material({color:'#647e49',roughness:.85}),clay=material({color:'#b88365',roughness:.92}),brass=material({color:'#c7aa69',metalness:.65,roughness:.35}),ceramic=material({color:'#f4ede1',roughness:.24});
 function mesh(geometry:T.BufferGeometry,mat:T.Material,x=0,y=0,z=0){geometries.add(geometry);const object=new T.Mesh(geometry,mat);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;group.add(object);return object;}
 function box(w:number,h:number,d:number,mat:T.Material,x=0,y=0,z=0){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z);}
 function table(x:number,z:number,r=.5){mesh(new T.CylinderGeometry(r,r,.07,40),wood,x,.61,z);mesh(new T.CylinderGeometry(.06,.1,.55,20),darkWood,x,.3,z);mesh(new T.CylinderGeometry(.30,.34,.04,24),darkWood,x,.04,z);mesh(new T.CylinderGeometry(.075,.07,.10,24),ceramic,x-.14,.70,z);const handle=mesh(new T.TorusGeometry(.045,.012,8,20),ceramic,x-.22,.715,z);handle.rotation.y=Math.PI/2;const coffee=mesh(new T.CircleGeometry(.063,24),material({color:'#5d3c27',roughness:.2}),x-.14,.753,z);coffee.rotation.x=-Math.PI/2;mesh(new T.CylinderGeometry(.10,.10,.012,28),ceramic,x-.14,.66,z);}
 function chair(x:number,z:number,angle=0){const start=group.children.length;box(.38,.055,.38,wood,x,.46,z);box(.33,.035,.32,fabric,x,.505,z);for(const dx of [-.145,.145])for(const dz of [-.145,.145])box(.04,.45,.04,darkWood,x+dx,.225,z+dz);for(const dx of [-.16,.16])box(.035,.50,.035,darkWood,x+dx,.72,z-.17);box(.35,.15,.035,wood,x,.89,z-.17);if(angle){const pivot=new T.Group();pivot.position.set(x,0,z);for(const object of group.children.slice(start)){group.remove(object);object.position.x-=x;object.position.z-=z;pivot.add(object);}pivot.rotation.y=angle;group.add(pivot);}}
 function plant(x:number,z:number,scale=1){mesh(new T.CylinderGeometry(.12*scale,.09*scale,.20*scale,20),clay,x,.10*scale,z);const stem=new T.CylinderGeometry(.012*scale,.014*scale,.45*scale,8);mesh(stem,darkWood,x,.40*scale,z);for(let i=0;i<10;i++){const a=i*2.4,level=.30+(i%4)*.085;const petal=mesh(new T.SphereGeometry(1,12,8),leaf,x+Math.cos(a)*.13*scale,level*scale,z+Math.sin(a)*.13*scale);petal.scale.set(.14*scale,.025*scale,.065*scale);petal.rotation.set(Math.sin(a)*.3,a,Math.cos(a)*.4);}}
 const width=manifest?manifest.columns*TILE_METERS:6,depth=manifest?manifest.rows*TILE_METERS:5,centerX=manifest?width/2:0,centerZ=manifest?depth/2:0;
 box(width,.06,depth,wood,centerX,-.035,centerZ);
 // Thin gaps and alternating planks give scale without hundreds of materials.
 const gap=material({color:'#816b52',roughness:1});for(let i=0;i<Math.ceil(width/.28);i++)box(.007,.002,depth,gap,centerX-width/2+i*.28,.001,centerZ);
 if(manifest){
  for(const zone of manifest.collisionZones){const x=(zone.x+zone.width/2)*TILE_METERS,z=(zone.y+zone.height/2)*TILE_METERS,w=zone.width*TILE_METERS,d=zone.height*TILE_METERS;
   if(zone.kind==='wall'){const h=zone.y<2?2.1:zone.x<2?1.6:.08;box(w,h,d,cream,x,h/2,z);}
   else if(zone.kind==='table'){box(w,.07,d,wood,x,.63,z);for(const dx of [-w*.32,w*.32])for(const dz of [-d*.32,d*.32])box(.05,.60,.05,darkWood,x+dx,.30,z+dz);}
   else if(zone.kind==='counter'){box(w,.8,d,darkWood,x,.4,z);box(w+.035,.05,d+.04,wood,x,.825,z);}
   else if(zone.kind==='planter')plant(x,z,Math.min(w,d)/.30);
   else if(zone.kind==='stage')box(w,.16,d,wood,x,.08,z);
  }
  for(const seat of manifest.seats)chair((seat.x+.5)*TILE_METERS,(seat.y+.5)*TILE_METERS,seat.facing==='north'?Math.PI:0);
 }else{
  box(6,2.8,.10,cream,0,1.4,-2.5);box(.1,2.8,5,cream,-3,1.4,0);box(6,.12,.09,darkWood,0,.13,-2.42);
  const glass=material({color:'#cbd9d1',emissive:'#b7c9b4',emissiveIntensity:.3,roughness:.3});for(const x of [-1.8,0,1.8]){box(1.22,1.70,.03,darkWood,x,1.65,-2.40);box(1.08,1.54,.035,glass,x,1.65,-2.37);box(.035,1.54,.05,wood,x,1.65,-2.34);box(1.08,.035,.05,wood,x,1.65,-2.34);box(1.34,.065,.24,wood,x,.81,-2.30);}
  chair(0,0);table(1.2,.35,.55);plant(-1.45,-1.65,1.8);plant(2.35,-1.65,1.5);
  box(1.3,.65,.5,darkWood,-1.9,.325,-2.05);box(1.4,.055,.56,wood,-1.9,.68,-2.05);for(let i=0;i<5;i++)box(.12,.25+i*.016,.18,material({color:['#aa8064','#889778','#bca26a','#8b9ba0','#9d8385'][i],roughness:.95}),-2.35+i*.16,.82,-2.04);
  const rug=mesh(new T.CircleGeometry(1.2,48),material({color:'#b9a18b',roughness:1}),.5,.005,.55);rug.rotation.x=-Math.PI/2;
  for(const x of [-1.45,1.35]){mesh(new T.CylinderGeometry(.006,.006,.45,8),brass,x,2.65,-1.0);mesh(new T.ConeGeometry(.18,.15,24,1,true),brass,x,2.35,-1.0);const lamp=new T.PointLight('#ffcf8a',.6,3,2);lamp.position.set(x,2.25,-1);group.add(lamp);}
 }
 // Static props share one draw per material instead of one draw per plank/leaf.
 group.updateMatrixWorld(true);const batches=new Map<T.Material,T.BufferGeometry[]>(),objects:T.Mesh[]=[];group.traverse(object=>{if(object instanceof T.Mesh&&!Array.isArray(object.material)){objects.push(object);const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld),flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();const entries=batches.get(object.material)??[];entries.push(flat);batches.set(object.material,entries);}});
 for(const object of objects){object.removeFromParent();object.geometry.dispose();geometries.delete(object.geometry);}for(const [mat,entries]of batches){const geometry=mergeGeometries(entries,false);if(!geometry)throw Error('Original room batching unavailable');for(const entry of entries)entry.dispose();mesh(geometry,mat);}objects.length=0;
 return {group,center:new T.Vector3(centerX,.65,centerZ),width,depth,dispose(){group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const texture of textures)texture.dispose();}};
}
