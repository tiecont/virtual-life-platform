import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {request} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {io,type Socket} from 'socket.io-client';
import {MeSchema,RoomAckSchema,GameLobbyViewSchema,type RoomSnapshot} from '@virtual-city/contracts';
const origin='http://127.0.0.1:3300',api='http://127.0.0.1:4300',route='/worlds/lantern-lodge',runId=process.env.UX_EVIDENCE_RUN??randomUUID().slice(0,8);let serial=0;const peers:Socket[]=[];
if(!/^[a-f0-9]{8}$/.test(runId))throw Error('Invalid evidence run');
async function guest(context?:BrowserContext){const n=++serial,payload=JSON.stringify({requestId:randomUUID(),displayName:'Lodge browser visitor '+n,avatarKey:'mint'}),result=await new Promise<{cookie:string;body:unknown}>((ok,no)=>{const req=request(api+'/v1/session/guest',{method:'POST',localAddress:'127.140.0.'+n,headers:{origin,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{expect(res.statusCode).toBe(201);ok({cookie:res.headers['set-cookie']![0].split(';')[0],body:JSON.parse(body)});}catch(error){no(error);}});});req.on('error',no);req.end(payload);});if(context){const at=result.cookie.indexOf('=');await context.addCookies([{name:result.cookie.slice(0,at),value:result.cookie.slice(at+1),url:origin,httpOnly:true,sameSite:'Lax'}]);}return {me:MeSchema.parse(result.body),cookie:result.cookie};}
async function capture(page:Page,name:string){const dir='artifacts/lantern-lodge/n15-03/browser-'+runId+'/'+test.info().project.name;await mkdir(dir,{recursive:true});const lobby=panel(page);if(await lobby.isVisible())await lobby.getByRole('heading',{name:'The lantern table',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});if(await lobby.isVisible()){await lobby.getByRole('button',{name:'Spectate unavailable',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+name+'-controls.png',fullPage:true});}await writeFile(dir+'/'+name+'.yml',await page.locator('body').ariaSnapshot());}
const panel=(page:Page)=>page.getByRole('region',{name:'Lantern table lobby'});
async function enter(page:Page){await page.goto(route);const canvas=page.locator('canvas[data-engine="three-webgl2"]');await expect(canvas).toBeVisible({timeout:20000});await page.getByRole('button',{name:'Enter lounge',exact:true}).click();await expect(page.getByRole('button',{name:'Leave lounge',exact:true})).toBeVisible();const actions=page.getByRole('dialog',{name:'Room actions',exact:true});await expect(actions).toBeVisible();await page.getByRole('button',{name:'Close room actions',exact:true}).click();await expect(canvas).toHaveAttribute('data-entity-count','1');await capture(page,'entered-3d');await page.getByRole('button',{name:'Room actions',exact:true}).click();await expect(panel(page)).toBeVisible();}
type Visitor=Awaited<ReturnType<typeof guest>>;
const source=(room:RoomSnapshot)=>({epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId});
async function post(v:Visitor,path:string,data:unknown){const response=await fetch(api+'/v1/'+path,{method:'POST',headers:{origin,cookie:v.cookie,'x-csrf-token':v.me.csrfToken,'idempotency-key':randomUUID(),'content-type':'application/json'},body:JSON.stringify(data)});expect(response.status).toBe(200);return response.json();}
async function peer(roomId:string){const v=await guest(),socket=io(api,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:'127.141.0.'+serial}},extraHeaders:{origin,cookie:v.cookie},auth:{schemaVersion:1,csrfToken:v.me.csrfToken}});peers.push(socket);await new Promise<void>((ok,no)=>{socket.once('connect',()=>ok());socket.once('connect_error',no);socket.connect();});const ack=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'lantern-lodge',worldVersion:'1.0.0',sceneVersion:'1.0.0',roomId}));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Peer visit unavailable');return {...v,room:ack.result};}
test.setTimeout(60000);
test.beforeEach(async({page},info)=>{await page.setViewportSize(info.project.name==='mobile'?{width:844,height:390}:{width:1280,height:720});});
test.afterEach(async({page})=>{for(const socket of peers.splice(0))socket.close();const actions=page.getByRole('dialog',{name:'Room actions',exact:true});if(await actions.isVisible())await page.getByRole('button',{name:'Close room actions',exact:true}).click();const people=page.getByRole('dialog',{name:'People and safety',exact:true});if(await people.isVisible())await page.getByRole('button',{name:'Close people and safety',exact:true}).click();const leave=page.getByRole('button',{name:'Leave lounge',exact:true});if(await leave.isVisible()&&await leave.isEnabled())await leave.click();});
test('signed-out 3D Lodge retains identity controls without creating a game or socket',async({page})=>{let sockets=0;page.on('websocket',()=>sockets++);await page.goto(route);await expect(page.locator('canvas[data-engine="three-webgl2"]')).toBeVisible({timeout:20000});await expect(page.getByRole('link',{name:'Open identity',exact:true})).toBeVisible();expect(sockets).toBe(0);await capture(page,'signed-out');});
test('keyboard consent, confirmed readiness, periodic sync and leave use real API',async({page,context})=>{
 let observedSync!:()=>void;const periodicSync=new Promise<void>(ok=>observedSync=ok);page.on('websocket',socket=>socket.on('framesent',event=>{if(typeof event.payload==='string'&&event.payload.includes('"room.snapshot"'))observedSync();}));
 await guest(context);await enter(page);const lobby=panel(page);await lobby.getByRole('button',{name:'Refresh table',exact:true}).focus();await page.keyboard.press('Enter');await expect(lobby.getByRole('heading',{name:'No table is open',exact:true})).toBeVisible();await expect(lobby.getByRole('button',{name:'Open table',exact:true})).toBeDisabled();await capture(page,'empty');
 await lobby.getByRole('checkbox').focus();await page.keyboard.press('Space');await lobby.getByRole('button',{name:'Open table',exact:true}).focus();await page.keyboard.press('Enter');await expect(lobby.getByText('Your seat',{exact:true})).toBeVisible();await expect(lobby.getByRole('button',{name:'Spectate unavailable',exact:true})).toBeDisabled();
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(ok=>release=ok),observed=new Promise<void>(ok=>seen=ok);await page.route('**/v1/games/lobby',async route=>{if(route.request().postDataJSON().op!=='ready'){await route.continue();return;}const actual=await route.fetch();seen();await gate;await route.fulfill({response:actual});});const ready=lobby.getByRole('button',{name:'Ready',exact:true});await ready.click();await observed;await expect(ready).toHaveText('Ready');await expect(ready).toBeDisabled();release();await expect(lobby.getByRole('button',{name:'Not ready',exact:true})).toBeEnabled();await page.unrouteAll({behavior:'wait'});await capture(page,'ready-confirmed');
 await periodicSync;await expect(lobby.getByRole('button',{name:'Not ready',exact:true})).toBeEnabled();await capture(page,'real-periodic-sync-retains-consent');
 await lobby.getByRole('button',{name:'Leave table',exact:true}).click();await expect(lobby.getByRole('status')).toHaveText('You left the table.');
});
for(const [width,height]of [[844,390],[740,360],[1280,720],[360,740]]){
 test(`ready table controls fit ${width}x${height} with200percent text`,async({page,context})=>{
  await guest(context);await enter(page);const lobby=panel(page);
  await lobby.getByRole('button',{name:'Refresh table',exact:true}).click();
  await expect(lobby.getByRole('heading',{name:'No table is open',exact:true})).toBeVisible();
  await lobby.getByRole('checkbox').check();
  await lobby.getByRole('button',{name:'Open table',exact:true}).click();
  await expect(lobby.getByText('Your seat',{exact:true})).toBeVisible();
  await lobby.getByRole('button',{name:'Ready',exact:true}).click();
  await expect(lobby.getByRole('button',{name:'Not ready',exact:true})).toBeEnabled();
  await page.setViewportSize({width,height});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  try{
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   const leave=lobby.getByRole('button',{name:'Leave table',exact:true});
   await leave.scrollIntoViewIfNeeded();const box=await leave.boundingBox();
   expect(box).not.toBeNull();expect(box!.height).toBeGreaterThanOrEqual(44);
   await capture(page,'ready-'+width+'-'+height+'-text200');
  }finally{await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));}
  await lobby.getByRole('button',{name:'Leave table',exact:true}).click();
  await expect(lobby.getByRole('status')).toHaveText('You left the table.');
 });
}
test('full and blocked table states reveal no peer identity and offer no implicit join',async({page,context})=>{
 const own=await guest(context);await enter(page);const room=(await(await context.request.get('/v1/me/room')).json()).snapshot as RoomSnapshot,first=await peer(room.roomId);let table=GameLobbyViewSchema.parse(await post(first,'games/lobby',{schemaVersion:1,op:'open',source:source(first.room),mode:'lantern-colors',consent:true})).table!;
 for(let n=0;n<5;n++){const next=await peer(room.roomId);table=GameLobbyViewSchema.parse(await post(next,'games/lobby',{schemaVersion:1,op:'join',source:source(next.room),tableId:table.tableId,generation:table.generation,consent:true})).table!;}
 const lobby=panel(page);await lobby.getByRole('button',{name:'Refresh table',exact:true}).click();await expect(lobby.getByText(/6 \/ 6 seats/)).toBeVisible();await lobby.getByRole('checkbox').check();await expect(lobby.getByRole('button',{name:'Join table',exact:true})).toBeDisabled();await expect(lobby.getByText(first.me.profile.displayName,{exact:true})).toHaveCount(0);await capture(page,'full');
 await post(own,'blocks',{targetId:first.me.profile.id,blocked:true});await post(first,'games/lobby',{schemaVersion:1,op:'join',source:source(first.room),tableId:table.tableId,generation:table.generation,consent:true});await lobby.getByRole('button',{name:'Refresh table',exact:true}).click();await expect(lobby.getByRole('status')).toHaveText('This table is unavailable or your visit changed. Refresh before continuing.');await expect(lobby.getByRole('button',{name:'Join table',exact:true})).toHaveCount(0);await expect(lobby.getByText(/6 \/ 6 seats/)).toHaveCount(0);await capture(page,'blocked-private');
});
