import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {AnimationState,AvatarAppearance} from '@virtual-city/contracts';
import type {AnimalStudyHandle} from '@virtual-city/client-sdk';
import {createAnimal,animalResourceSummary,type Quality} from './animal';
import {createRoomArt} from './room';

export type {AnimalStudyHandle} from '@virtual-city/client-sdk';
export function createAnimalStudy(host:HTMLElement,options:{signal?:AbortSignal;quality?:Quality;onContext?:(available:boolean)=>void}={}):AnimalStudyHandle{
 options.signal?.throwIfAborted();let renderer:T.WebGLRenderer;
 try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{throw Error('3D graphics unavailable. The text controls remain available.');}
 const cleanup:Array<()=>void>=[()=>{renderer.dispose();renderer.forceContextLoss();}];
 try{
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');canvas.dataset.scene3d='original-animal-study';host.appendChild(canvas);cleanup.push(()=>canvas.remove());
 const scene=new T.Scene();scene.background=new T.Color('#e8dfd0');scene.fog=new T.Fog('#e8dfd0',5,14);const room=createRoomArt();cleanup.push(()=>room.dispose());scene.add(room.group);
 const camera=new T.PerspectiveCamera(32,1,.05,30);camera.position.set(1.4,1.35,2.8);const controls=new OrbitControls(camera,canvas);cleanup.push(()=>controls.dispose());controls.target.set(0,.77,.25);controls.minDistance=1.6;controls.maxDistance=5.5;controls.minPolarAngle=.6;controls.maxPolarAngle=1.45;controls.minAzimuthAngle=-Math.PI/2.5;controls.maxAzimuthAngle=Math.PI/2.5;controls.enablePan=false;controls.enableDamping=false;controls.update();
 scene.add(new T.HemisphereLight('#fff3db','#8c8b77',1.25));const sun=new T.DirectionalLight('#ffe1b2',2.1);sun.position.set(-2.5,4.5,3);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-3;sun.shadow.camera.right=3;sun.shadow.camera.top=3;sun.shadow.camera.bottom=-3;sun.shadow.camera.near=.1;sun.shadow.camera.far=12;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;sun.target.position.set(0,.5,0);scene.add(sun,sun.target);const fill=new T.DirectionalLight('#dce6e5',.5);fill.position.set(3,2,-2);scene.add(fill);
 cleanup.push(()=>sun.shadow.dispose());
 let quality:Quality=options.quality??'balanced',outfit:AvatarAppearance['outfit']='casual',animal=createAnimal(quality,'cocoa',outfit),pose:AnimationState='idle',disposed=false,suspended=false,documentActive=document.visibilityState!=='hidden',lost=false,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,frames=0,frame=0,lastFrame:number|null=null,measureAfter=performance.now()+2000;const intervals:number[]=[];cleanup.push(()=>animal.dispose());
 function resetMeasurements(){intervals.length=0;lastFrame=null;measureAfter=performance.now()+2000;}
 scene.add(animal.group);animal.group.position.z=.45;const started=performance.now();
 function render(time=performance.now()){
  if(disposed||suspended||!documentActive||lost)return;animal.update((time-started)/1000,pose,reduced);renderer.render(scene,camera);frames++;canvas.dataset.frames=String(frames);canvas.dataset.pose=pose;canvas.dataset.quality=quality;
 }
 function animate(time:number){frame=0;if(disposed||suspended||!documentActive||lost||reduced)return;if(time>=measureAfter&&lastFrame!==null){intervals.push(time-lastFrame);if(intervals.length>300)intervals.shift();}lastFrame=time;render(time);frame=requestAnimationFrame(animate);}
 function wake(){if(disposed||suspended||!documentActive||lost)return;render();if(!reduced&&!frame)frame=requestAnimationFrame(animate);}
 function resize(){if(disposed||!host.clientWidth||!host.clientHeight)return;const width=host.clientWidth,height=host.clientHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.shadowMap.enabled=quality!=='low';room.group.traverse(object=>{if(object instanceof T.PointLight)object.visible=quality!=='low';});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='high'?2:quality==='balanced'?1.25:1));renderer.setSize(width,height,false);wake();}
 function pause(){cancelAnimationFrame(frame);frame=0;resetMeasurements();}
 const visibility=()=>{documentActive=document.visibilityState!=='hidden';if(!documentActive)pause();else wake();};
 const contextLost=(event:Event)=>{event.preventDefault();lost=true;pause();canvas.dataset.context='lost';options.onContext?.(false);};const contextRestored=()=>{if(disposed)return;lost=false;canvas.dataset.context='restored';options.onContext?.(true);resize();};
 canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);document.addEventListener('visibilitychange',visibility);controls.addEventListener('change',wake);const observer=new ResizeObserver(resize);observer.observe(host);
 cleanup.push(()=>{observer.disconnect();controls.removeEventListener('change',wake);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);});
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');let override=false;const motion=()=>{if(!override){reduced=media.matches;pause();wake();}};media.addEventListener('change',motion);
 cleanup.push(()=>media.removeEventListener('change',motion));
 function destroy(){if(disposed)return;disposed=true;pause();for(const dispose of cleanup.splice(0).reverse())dispose();}
 cleanup.push(()=>options.signal?.removeEventListener('abort',destroy));
 options.signal?.addEventListener('abort',destroy,{once:true});if(options.signal?.aborted){destroy();options.signal.throwIfAborted();}resize();
 return {
  update(snapshot){if(snapshot)throw Error('This labelled local art study is not an authoritative room renderer');suspended=false;wake();},
  suspend(){suspended=true;pause();},setReducedMotion(value){override=true;reduced=value;pause();wake();},destroy,
  setPose(value){pose=value;animal.group.position.z=pose==='sit'?0:.45;wake();},
  setView(view){const angle=Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z);animal.group.rotation.y=angle+{front:0,left:Math.PI/2,back:Math.PI,right:-Math.PI/2}[view];wake();},
  setQuality(value){if(value===quality||disposed)return;const rotation=animal.group.rotation.y,replacement=createAnimal(value,'cocoa',outfit);animal.dispose();quality=value;animal=replacement;animal.group.position.z=pose==='sit'?0:.45;animal.group.rotation.y=rotation;scene.add(animal.group);resetMeasurements();resize();},
  setOutfit(value){if(value===outfit||disposed)return;const rotation=animal.group.rotation.y,replacement=createAnimal(quality,'cocoa',value);animal.dispose();outfit=value;animal=replacement;animal.group.position.z=pose==='sit'?0:.45;animal.group.rotation.y=rotation;scene.add(animal.group);resetMeasurements();wake();},
  zoom(direction){const offset=camera.position.clone().sub(controls.target),length=T.MathUtils.clamp(offset.length()*(direction==='in'?.85:1.18),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(length));controls.update();wake();},resetMeasurements,
  diagnostics(){const sorted=intervals.slice().sort((a,b)=>a-b);return {engine:'three-webgl2',scope:'LOCAL_PROCEDURAL_ART_STUDY_NOT_FINAL_GAMEPLAY_OR_N10_04',frames,geometry:renderer.info.memory.geometries,textures:renderer.info.memory.textures,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frameP95Ms:sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]:null,frameSamples:sorted.length,measuredSeconds:intervals.reduce((sum,value)=>sum+value,0)/1000,timingScope:'RAF_AFTER_2S_WARMUP_NOT_PHYSICAL_ACCEPTANCE',contextLost:lost,resources:animalResourceSummary(),serving:animal.serving()};}
 };
 }catch(error){for(const dispose of cleanup.splice(0).reverse()){try{dispose();}catch{/* Preserve the original initialization failure. */}}throw error;}
}
