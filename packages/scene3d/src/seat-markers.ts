import * as T from 'three';
import type {SceneManifest,RoomSnapshot} from '@virtual-city/contracts';
import {TILE_METERS} from './room';

// The circles are coplanar and never overlap: one double-sided pass preserves
// their appearance. Two opacity groups keep the current visitor's highlight.
export function createSeatMarkers(seats:SceneManifest['seats']){
 const group=new T.Group(),geometry=new T.CircleGeometry(.21,20);
 const materials=[.22,.45].map(opacity=>new T.MeshBasicMaterial({transparent:true,opacity,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}));
 const meshes=materials.map(material=>new T.InstancedMesh(geometry,material,Math.max(1,seats.length)));
 const slots=meshes.map(()=>[] as string[]),matrices=new Map<string,T.Matrix4>(),dummy=new T.Object3D();
 const available=new T.Color('#d9bd83'),occupied=new T.Color('#828b83'),mine=new T.Color('#45847a');
 for(const seat of seats){dummy.position.set((seat.x+.5)*TILE_METERS,.54,(seat.y+.5)*TILE_METERS);dummy.rotation.x=-Math.PI/2;dummy.updateMatrix();matrices.set(seat.seatId,dummy.matrix.clone());}
 for(const mesh of meshes){mesh.count=0;group.add(mesh);}group.visible=false;
 let disposed=false,previous:RoomSnapshot['seats']|null=null,shown=false;
 function update(state:RoomSnapshot['seats']|null,visible:boolean){
  if(disposed)return;
  const show=visible&&state!==null;
  // RoomProjection replaces parsed state on each accepted snapshot; animation
  // frames with the same state do not need new matrices, colours or buffers.
  if(state===previous&&show===shown)return;previous=state;shown=show;group.visible=show;
  for(let index=0;index<meshes.length;index++){meshes[index].count=0;slots[index].length=0;}
  if(show)for(const seat of state){const matrix=matrices.get(seat.seatId);if(!matrix)continue;const index=seat.mine?1:0,mesh=meshes[index],slot=mesh.count++;mesh.setMatrixAt(slot,matrix);mesh.setColorAt(slot,seat.mine?mine:seat.state==='available'?available:occupied);slots[index].push(seat.seatId);}
  for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
 }
 function raycast(raycaster:T.Raycaster){
  if(disposed||!shown)return null;
  const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit||hit.instanceId===undefined)return null;
  const index=meshes.indexOf(hit.object as typeof meshes[number]);return slots[index]?.[hit.instanceId]??null;
 }
 function dispose(){if(disposed)return;disposed=true;shown=false;previous=null;group.visible=false;group.removeFromParent();for(const mesh of meshes)mesh.dispose();group.clear();geometry.dispose();for(const material of materials)material.dispose();}
 return{group,update,raycast,dispose};
}
