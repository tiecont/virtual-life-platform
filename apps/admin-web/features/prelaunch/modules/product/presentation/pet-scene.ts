import * as T from 'three';
export type Motion='idle'|'normal'|'rage'|'skill';
export function createPetScene(canvas:HTMLCanvasElement,kind:string,color:string,accent:string,onLost:()=>void){
 const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(640,420,false);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,640/420,.1,40),root=new T.Group();scene.add(root);
 camera.position.set(0,1.1,6);camera.lookAt(0,0,0);
 scene.add(new T.HemisphereLight(0xeef5ff,0x51416e,3));const light=new T.DirectionalLight(0xffffff,4);light.position.set(3,5,4);scene.add(light);
 const materials=[new T.MeshStandardMaterial({color,roughness:.36,metalness:.22}),new T.MeshStandardMaterial({color:accent,roughness:.25,metalness:.4}),new T.MeshStandardMaterial({color:0x283153}),new T.MeshStandardMaterial({color:0xfff6d4,emissive:0xffdc86,emissiveIntensity:.6})];
 const geometries:T.BufferGeometry[]=[];const moving:T.Mesh[]=[];
 function part(shape:'orb'|'gem'|'cone'|'ring'|'rod',at:number[],size:number[],mat=0){
  const geometry=shape==='orb'?new T.SphereGeometry(1,20,14):shape==='gem'?new T.OctahedronGeometry(1):shape==='cone'?new T.ConeGeometry(1,2,8):shape==='ring'?new T.TorusGeometry(1,.1,8,32):new T.CylinderGeometry(1,1,2,10);
  geometries.push(geometry);const mesh=new T.Mesh(geometry,materials[mat]);mesh.position.set(at[0],at[1],at[2]);mesh.scale.set(size[0],size[1],size[2]);root.add(mesh);return mesh;
 }
 const eyes=()=>{for(const x of [-.2,.2]){part('orb',[x,.2,.64],[.115,.14,.07],2);part('orb',[x+.025,.24,.7],[.035,.04,.025],3);}};
 if(kind==='cindrelis'){
  part('gem',[0,0,0],[.7,.95,.65]);part('gem',[0,0,.57],[.28,.43,.15],3);part('ring',[0,1,0],[.35,.4,.3],1);
  for(let i=0;i<3;i++)moving.push(part('cone',[(i-1)*.35,-1-i*.08,0],[.11,.3+i*.04,.11],1));
 }else if(kind==='marivell'){
  part('orb',[0,.35,0],[.85,.55,.75]);part('ring',[0,.05,0],[.8,.8,.8],1).rotation.x=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;moving.push(part('rod',[Math.cos(a)*.48,-.55,Math.sin(a)*.48],[.065,.58,.065],1));}eyes();
 }else if(kind==='quorion'){
  part('orb',[0,0,0],[.62,.8,.5]);part('orb',[0,.6,0],[.65,.52,.5],1);eyes();part('cone',[0,.2,.74],[.12,.17,.13],1).rotation.x=Math.PI/2;
  for(const side of [-1,1]){const w=part('gem',[side*.85,.1,0],[.45,.8,.13]);w.rotation.z=-side*.4;moving.push(w);part('cone',[side*.37,1.08,0],[.17,.3,.17]);}
 }else if(kind==='vesperyn'){
  part('cone',[0,-.25,0],[.7,.75,.5]);part('orb',[0,.52,0],[.57,.6,.45],1);eyes();
  for(const side of [-1,1])moving.push(part('gem',[side*.85,0,0],[.22,.55,.17],1));part('ring',[0,.95,-.25],[.75,.75,.75]);
 }else if(kind==='gravorn'){
  part('gem',[0,0,0],[.95,.65,.65]);part('gem',[0,.1,.65],[.42,.4,.3],1);eyes();
  for(let i=0;i<6;i++){const side=i<3?-1:1,z=(i%3-1)*.5;const m=part('rod',[side*.8,-.5,z],[.14,.5,.14],1);m.rotation.z=side*.5;moving.push(m);}part('gem',[0,.6,0],[.3,.45,.3],3);
 }else{
  part('orb',[0,-.15,0],[.55,.45,.85]);part('rod',[0,.35,.45],[.25,.45,.25]);part('orb',[0,.85,.55],[.35,.4,.4]);
  for(const x of [-.32,.32])for(const z of [-.48,.48])moving.push(part('rod',[x,-.8,z],[.1,.5,.1],1));
  for(const side of [-1,1]){part('gem',[side*.3,1.5,.5],[.1,.5,.1],1).rotation.z=-side*.3;part('gem',[side*.48,1.65,.5],[.09,.3,.1],3).rotation.z=-side*.8;part('orb',[side*.22,.94,.87],[.07,.08,.04],2);}
 }
 const ring=part('ring',[0,-1.36,0],[1.3,1.3,1.3],1);ring.rotation.x=Math.PI/2;
 const effect=part('ring',[0,0,.2],[1.3,1.3,1.3],3);effect.visible=false;
 let disposed=false,paused=true,visible=true,angle=0,zoom=6,motion:Motion='idle',elapsed=0,frame=0,last=0,started=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function render(time:number){if(disposed)return;frame=requestAnimationFrame(render);if(time-last<33||!visible||document.hidden)return;const dt=Math.min((time-last)/1000,.05);last=time;
  if(!paused&&!reduced.matches)elapsed+=dt;
  root.rotation.y=angle;root.position.y=paused||reduced.matches?0:Math.sin(elapsed*1.8)*.07;
  moving.forEach((m,i)=>{m.rotation.x=paused||reduced.matches?0:Math.sin(elapsed*2+i*.7)*.16;});
  const phase=(elapsed-started)/1.8,active=motion!=='idle'&&!paused&&!reduced.matches&&phase<1;
  effect.visible=active;effect.scale.setScalar(1.1+Math.sin(Math.max(0,phase)*Math.PI)*.8);effect.rotation.z=elapsed;
  root.rotation.z=active&&motion==='normal'?Math.sin(phase*Math.PI*2)*.12:0;
  if(active&&motion==='rage')root.position.y+=Math.sin(phase*Math.PI)*.35;
  camera.position.z=zoom;renderer.render(scene,camera);
 }
 const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});observer.observe(canvas);
 const resize=new ResizeObserver(()=>{const width=Math.min(canvas.clientWidth,960),height=Math.min(canvas.clientHeight,600);if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}});resize.observe(canvas);
 const lost=(event:Event)=>{event.preventDefault();onLost();};canvas.addEventListener('webglcontextlost',lost);
 frame=requestAnimationFrame(render);
 return {rotate:(value:number)=>{angle+=value;},zoom:(value:number)=>{zoom=T.MathUtils.clamp(zoom+value,3.8,8);},reset:()=>{angle=0;zoom=6;},motion:(value:Motion)=>{motion=value;started=elapsed;paused=false;},pause:()=>{paused=true;},dispose:()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();canvas.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}
