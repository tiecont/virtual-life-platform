import {it,expect} from 'vitest';
import * as T from 'three';
import type {RoomSnapshot,SceneManifest} from '@virtual-city/contracts';
import {createSeatMarkers} from '../src/seat-markers';
import {TILE_METERS} from '../src/room';

const seats:SceneManifest['seats']=[{seatId:'a',label:'A',x:1,y:1,facing:'south'},{seatId:'b',label:'B',x:100,y:1,facing:'south'},{seatId:'c',label:'C',x:200,y:1,facing:'south'}];
const state=(mine:string|null=null):RoomSnapshot['seats']=>seats.map(seat=>({seatId:seat.seatId,state:mine===seat.seatId?'occupied':'available',mine:mine===seat.seatId}));
function point(markers:ReturnType<typeof createSeatMarkers>,index:number){markers.group.updateMatrixWorld(true);const seat=seats[index];return markers.raycast(new T.Raycaster(new T.Vector3((seat.x+.5)*TILE_METERS,10,(seat.y+.5)*TILE_METERS),new T.Vector3(0,-1,0)));}

it('raycasts the correct seat after sparse slots and a highlight move far outside the previous batch bounds',()=>{
 const markers=createSeatMarkers(seats);
 try{
  markers.update(state('a'),true);for(let i=0;i<seats.length;i++)expect(point(markers,i)).toBe(seats[i].seatId);
  markers.update(state('c'),true);for(let i=0;i<seats.length;i++)expect(point(markers,i)).toBe(seats[i].seatId);
  markers.update([{seatId:'c',state:'available',mine:false}],true);expect(point(markers,0)).toBeNull();expect(point(markers,1)).toBeNull();expect(point(markers,2)).toBe('c');
  markers.update(state('a').reverse(),true);for(let i=0;i<seats.length;i++)expect(point(markers,i)).toBe(seats[i].seatId);
 }finally{markers.dispose();}
});
it('preserves available,held,occupied and own colours/opacity without uploading buffers on animation-only updates',()=>{
 const markers=createSeatMarkers(seats),snapshot=state('c');snapshot[1].state='held';
 try{
  markers.update(snapshot,true);const meshes=markers.group.children as T.InstancedMesh<T.CircleGeometry,T.MeshBasicMaterial>[],colour=new T.Color();
  expect(meshes.map(mesh=>mesh.material.opacity)).toEqual([.22,.45]);expect(meshes.map(mesh=>mesh.count)).toEqual([2,1]);
  for(const [mesh,index,value]of [[meshes[0],0,'#d9bd83'],[meshes[0],1,'#828b83'],[meshes[1],0,'#45847a']] as const){mesh.getColorAt(index,colour);expect(colour.getHexString()).toBe(value.slice(1));}
  const versions=meshes.map(mesh=>[mesh.instanceMatrix.version,mesh.instanceColor!.version]);markers.update(snapshot,true);expect(meshes.map(mesh=>[mesh.instanceMatrix.version,mesh.instanceColor!.version])).toEqual(versions);
  markers.update(snapshot,false);expect(point(markers,2)).toBeNull();markers.update(snapshot,true);expect(point(markers,2)).toBe('c');
  markers.update(null,true);expect(point(markers,2)).toBeNull();
 }finally{markers.dispose();}
});
it('disposes instance buffers,shared geometry and both materials once and leaves a sibling untouched',()=>{
 const markers=createSeatMarkers(seats),sibling=createSeatMarkers(seats),parent=new T.Group();parent.add(markers.group,sibling.group);markers.update(state('a'),true);sibling.update(state(),true);
 const meshes=markers.group.children as T.InstancedMesh[],resources=new Set([...meshes,...meshes.map(mesh=>mesh.geometry),...meshes.flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material])]),counts=new Map<object,number>();
 for(const resource of resources){counts.set(resource,0);const disposed=()=>counts.set(resource,counts.get(resource)!+1);if(resource instanceof T.InstancedMesh)resource.addEventListener('dispose',disposed);else if(resource instanceof T.BufferGeometry)resource.addEventListener('dispose',disposed);else resource.addEventListener('dispose',disposed);}
 const matrixDispose=meshes.map(mesh=>{let count=0;mesh.instanceMatrix.addEventListener('dispose',()=>count++);mesh.instanceColor!.addEventListener('dispose',()=>count++);return()=>count;});
 markers.dispose();markers.dispose();expect([...counts.values()]).toEqual(Array(resources.size).fill(1));expect(matrixDispose.map(count=>count())).toEqual([2,2]);expect(parent.children).toEqual([sibling.group]);expect(point(markers,0)).toBeNull();expect(point(sibling,0)).toBe('a');sibling.dispose();
});
it('does not invent targets for empty or unrecognized seat data',()=>{
 const markers=createSeatMarkers([]);try{markers.update([{seatId:'unknown',state:'available',mine:false}],true);expect(markers.group.children.every(mesh=>(mesh as T.InstancedMesh).count===0)).toBe(true);expect(markers.raycast(new T.Raycaster())).toBeNull();}finally{markers.dispose();}
});
