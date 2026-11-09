import {expect,it} from 'vitest';
import * as T from 'three';
import {starterAvatarParts} from '@virtual-city/contracts';
import {createAnimalVariants,animalCachedGeometries,animalResourceSummary} from '../src/animal';
import {sceneResourceInventory} from '../src/resources';

it('retains both gameplay buffer sets across swaps and disposes each exactly once on final release',()=>{
 const variants=createAnimalVariants('fern','cafe-apron',starterAvatarParts('fern','dog')),models:ReturnType<typeof variants.create>[]=[],disposed=new Map<T.BufferGeometry,number>();
 try{
  const low=variants.create('low');models.push(low);const lowBuffers=animalCachedGeometries();lowBuffers.forEach(g=>{disposed.set(g,0);g.addEventListener('dispose',()=>disposed.set(g,disposed.get(g)!+1));});
  low.dispose();expect(animalResourceSummary()).toEqual({cachedQualityTiers:1,references:0});
  const balanced=variants.create('balanced');models.push(balanced);balanced.dispose();
  for(const quality of ['low','balanced','low','balanced']as const){const model=variants.create(quality);models.push(model);if(quality==='low'){expect(model.body.geometry).toBe(low.body.geometry);expect(model.fur.geometry).toBe(low.fur.geometry);}else expect(model.body.geometry).toBe(balanced.body.geometry);model.dispose();}
  expect(animalResourceSummary()).toEqual({cachedQualityTiers:2,references:0});expect([...disposed.values()]).toEqual(lowBuffers.map(()=>0));
  variants.dispose();variants.dispose();expect([...disposed.values()]).toEqual(lowBuffers.map(()=>1));
 }finally{for(const model of models)model.dispose();variants.dispose();}
 expect(animalCachedGeometries()).toHaveLength(0);expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
});

it('separate active appearances share entries without freeing another scope or live actor',()=>{
 const a=createAnimalVariants('cocoa','casual',starterAvatarParts()),b=createAnimalVariants('cocoa','casual',starterAvatarParts()),first=a.create('low'),second=b.create('low');let disposed=0;first.body.geometry.addEventListener('dispose',()=>disposed++);
 try{expect(first.body.geometry).toBe(second.body.geometry);first.dispose();a.dispose();expect(disposed).toBe(0);b.dispose();expect(disposed).toBe(0);expect(animalResourceSummary().references).toBe(1);expect(()=>b.create('low')).toThrow();second.dispose();expect(disposed).toBe(1);}finally{first.dispose();second.dispose();a.dispose();b.dispose();}
 expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
});

it('captures canonical appearance at creation and refuses a third gameplay tier',()=>{
 const parts=starterAvatarParts(),variants=createAnimalVariants('cocoa','casual',parts),first=variants.create('low');
 try{parts.body='slender';first.dispose();const next=variants.create('low');try{expect(next.body.geometry).toBe(first.body.geometry);expect(()=>variants.create('high' as 'low')).toThrow();expect(animalResourceSummary().references).toBe(1);}finally{next.dispose();}}finally{first.dispose();variants.dispose();}
 expect(animalCachedGeometries()).toHaveLength(0);
});

it('bounds both retained LODs for20distinct active appearances and releases all on departure',()=>{
 const variants:ReturnType<typeof createAnimalVariants>[]=[],models:ReturnType<ReturnType<typeof createAnimalVariants>['create']>[]=[],people=new T.Group(),room=new T.Group(),shadow=new T.DirectionalLight().shadow;shadow.map=new T.WebGLRenderTarget(1024,1024,{depthBuffer:true});
 try{
  for(let i=0;i<20;i++){const species=(['cat','dog','rabbit']as const)[i%3],parts={...starterAvatarParts((['fern','cocoa','plum','amber']as const)[i%4],species),body:i%2?'slender' as const:'round' as const,accessory:(['none','scarf','glasses','cap']as const)[Math.floor(i/4)%4]};variants.push(createAnimalVariants('cocoa','casual',parts));models.push(variants[i].create('low'));people.add(models[i].group);}
  for(const quality of ['balanced','low','balanced','low']as const)for(let i=0;i<20;i++){const previous=models[i],next=variants[i].create(quality);previous.dispose();models[i]=next;people.add(next.group);expect(animalResourceSummary().references).toBe(20);}
  const inventory=sceneResourceInventory(room,people,shadow,2048,animalCachedGeometries());
  expect(inventory.unknownTextures).toBe(0);expect(inventory.geometryBytes).toBeLessThanOrEqual(24*1024**2);expect(inventory.otherTextureBytes).toBeLessThanOrEqual(16*1024**2);expect(inventory.totalTextureBytes).toBeLessThanOrEqual(96*1024**2);
  const firstGeometry=models[0].body.geometry;let disposed=0;firstGeometry.addEventListener('dispose',()=>disposed++);models[0].dispose();variants[0].dispose();expect(disposed).toBe(1);expect(animalResourceSummary().references).toBe(19);
 }finally{for(const model of models)model.dispose();for(const scope of variants)scope.dispose();shadow.dispose();}
 expect(people.children).toHaveLength(0);expect(animalCachedGeometries()).toHaveLength(0);expect(animalResourceSummary()).toEqual({cachedQualityTiers:0,references:0});
},20000);
