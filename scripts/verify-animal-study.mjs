import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
const root='docs/design/vnext/animal-landscape',output='artifacts/vnext/n06-06/study-'+randomUUID().slice(0,8);
const files=new Map([['/',[root+'/index.html','text/html']],...['study.css','study.mjs','catalog.mjs','illustrations.mjs'].map(name=>['/'+name,[root+'/'+name,name.endsWith('.css')?'text/css':'text/javascript']])]);
const server=createServer((req,res)=>{const file=files.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end('Not found');return;}void readFile(file[0]).then(bytes=>{res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});res.end(bytes);},()=>{res.writeHead(500);res.end('Study unavailable');});});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve'))console.log('Local simulated animal/landscape study: '+origin);
else{
 await mkdir(output,{recursive:true,mode:0o700});let browser;const facts={scope:'Original simulated SVG design study only; not game/backend/native/performance/owner-art acceptance',profiles:[],partChanges:[],artifacts:[]};
 try{
  browser=await chromium.launch();
  for(const [name,width,height]of [['landscape-small',740,360],['landscape-phone',844,390],['desktop',1280,720],['desktop-large',1920,1080],['portrait-fallback',360,740],['keyboard-occlusion-fixture',740,240]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const page=await context.newPage(),errors=[],foreign=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:'))foreign.push(r.url());});
   await page.goto(origin);await expect(page.locator('#room-art svg')).toHaveCount(1);await expect(page.locator('#motion')).toHaveAttribute('aria-pressed','true');
   assert.equal((await page.request.get(origin+'/.env')).status(),404);assert.equal((await page.request.get(origin+'/apps/platform-api/src/app.ts')).status(),404);
   const layout=async()=>{const data=await page.evaluate(()=>({width:window.innerWidth,scroll:document.documentElement.scrollWidth}));assert(data.scroll<=data.width,JSON.stringify({name,...data}));};await layout();
   await page.screenshot({path:output+'/'+name+'-ready.png',fullPage:true});
   for(const state of ['loading','empty','full','wait','offline','reconnect','denied']){
    await page.locator('#state').selectOption(state);const unavailable=state!=='empty';if(unavailable)await expect(page.locator('#activity')).toBeDisabled();else await expect(page.locator('#activity')).toBeEnabled();
    for(const id of ['wardrobe','safety','leave'])await expect(page.locator('#'+id)).toBeEnabled();
    await layout();await page.screenshot({path:output+'/'+name+'-'+state+'.png',fullPage:true});
   }
   await page.locator('#safety').focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'Your space, your choice'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#safety')).toBeFocused();
   await page.locator('#state').selectOption('ready');await page.locator('#wardrobe').click();await expect(page.getByRole('dialog',{name:'Make yourself at home.'})).toBeVisible();
   await page.getByRole('combobox',{name:'Animal',exact:true}).selectOption('rabbit');await expect(page.getByRole('combobox',{name:'Ears',exact:true})).toHaveValue('long');await expect(page.getByRole('combobox',{name:'Tail',exact:true})).toHaveValue('puff');
   const before=await page.locator('#avatar-preview').innerHTML();await page.getByRole('combobox',{name:'Ears',exact:true}).selectOption('bent');assert.notEqual(await page.locator('#avatar-preview').innerHTML(),before);
   await page.locator('#rotate').click();await expect(page.getByRole('combobox',{name:'View direction',exact:true})).toHaveValue('right');
   await page.screenshot({path:output+'/'+name+'-creator.png',fullPage:true});
   await page.getByRole('button',{name:'Apply to study',exact:true}).click();await expect(page.locator('#creator')).not.toBeVisible();await expect(page.locator('#wardrobe')).toBeFocused();assert.match(await page.locator('#room-art').innerHTML(),/data-part="ears"/);
   const applied=await page.locator('#room-art').innerHTML();await page.locator('#wardrobe').click();await page.getByRole('combobox',{name:'Animal',exact:true}).selectOption('dog');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('#room-art').innerHTML(),applied);
   await page.locator('#world').selectOption('maid');await expect(page.locator('#place-title')).toHaveText('The afternoon cafe');
   await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await layout();await page.locator('#safety').click();await expect(page.locator('#info')).toBeVisible();await page.keyboard.press('Escape');
   await page.locator('#wardrobe').click();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await layout();await page.screenshot({path:output+'/'+name+'-text-200.png',fullPage:true});
   const contained=await page.locator('.game-dock button').evaluateAll(nodes=>{const f=document.querySelector('.landscape-frame').getBoundingClientRect();return nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,inside:r.left>=f.left&&r.right<=f.right&&r.top>=f.top&&r.bottom<=f.bottom};});});assert(contained.every(n=>n.inside),JSON.stringify({name,contained}));
   const targets=await page.locator('.game-dock button').evaluateAll(nodes=>nodes.map(n=>({id:n.id,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert(targets.every(t=>t.width>=44&&t.height>=44),JSON.stringify(targets));
   await writeFile(output+'/'+name+'-accessibility.yml',await page.locator('body').ariaSnapshot());assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);
   facts.profiles.push({name,width,height,states:8,keyboardModalEscapeFocus:true,bodyPartChange:true,applyCancelLocalOnly:true,text200NoHorizontalOverflow:true,negativeActionsAvailable:true,targets,externalRequests:0,pageErrors:0});await context.close();
  }
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();await page.goto(origin);await page.locator('#wardrobe').click();
  for(const species of ['cat','dog','rabbit']){
   await page.getByRole('combobox',{name:'Animal',exact:true}).selectOption(species);await page.getByRole('combobox',{name:'View direction',exact:true}).selectOption('front');await page.getByRole('combobox',{name:'Accessory',exact:true}).selectOption('none');
   for(const [label,value]of [['Body','slender'],['Head','wide'],['Fur color','sage'],['Markings','patch'],['Eyes','calm'],['Muzzle','small'],['Hair tuft','smooth'],['Clothes','overalls']]){
    const before=await page.locator('#avatar-preview').innerHTML();await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);const changed=before!==await page.locator('#avatar-preview').innerHTML();facts.partChanges.push({species,label,changed});assert(changed,`${species} ${label} must change geometry/layer rather than only a label`);
   }
   for(const pose of ['idle','walk','sit','serve'])for(const facing of ['front','right','back','left']){
    await page.getByRole('combobox',{name:'Pose',exact:true}).selectOption(pose);await page.getByRole('combobox',{name:'View direction',exact:true}).selectOption(facing);await expect(page.locator('#avatar-preview svg')).toHaveAttribute('aria-label',new RegExp(species+', '+facing+', '+pose));
   }
   await page.screenshot({path:output+'/'+species+'-keypose.png',fullPage:true});await page.locator('#reset').click();
  }
  await context.close();facts.result='PASS';
 }catch(e){facts.result='FAIL';facts.error=e.message;process.exitCode=1;}
 finally{
  await browser?.close();await new Promise(ok=>server.close(ok));
  const {readdir}=await import('node:fs/promises');for(const file of await readdir(output)){const ref=output+'/'+file;facts.artifacts.push({ref,sha256:createHash('sha256').update(await readFile(ref)).digest('hex')});}
  await writeFile(output+'/facts.json',JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({result:facts.result,profiles:facts.profiles.length,states:facts.profiles.length*8,partChanges:facts.partChanges.length,error:facts.error,artifactDirectory:output,scope:facts.scope}));
 }
}
