import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root='docs/design/vnext/prototype', files=new Map([
 ['/',[root+'/index.html','text/html']],['/prototype.css',[root+'/prototype.css','text/css']],['/prototype.mjs',[root+'/prototype.mjs','text/javascript']],
 ['/tokens.css',['packages/ui/src/tokens.css','text/css']],['/components.css',['packages/ui/src/components.css','text/css']],
]);
const server=createServer((request,response)=>{
 const file=files.get(new URL(request.url,'http://localhost').pathname);
 if(!file){response.writeHead(404);response.end('Not found');return;}
 void readFile(file[0]).then(body=>{response.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});response.end(body);},()=>{response.writeHead(500);response.end('Prototype file unavailable');});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve'))console.log('Local simulated prototype: '+url);
else {
 let browser;
 try {
  const output='artifacts/vnext/n06-02';await mkdir(output,{recursive:true});browser=await chromium.launch();const results=[];
  for(const [name,width,height] of [['desktop',1280,900],['mobile',360,800]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.getByRole('heading',{name:'Deadline Cafe',exact:true}).waitFor();
   assert.equal((await page.request.get(url+'/.env')).status(),404);assert.equal((await page.request.get(url+'/apps/platform-api/src/app.ts')).status(),404);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   await page.screenshot({path:`${output}/${name}-ready.png`,fullPage:true});
   const primary=page.locator('#primary'), choose=page.locator('#seats-trigger');
   await primary.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Choose a seat'}).waitFor();
   await page.getByRole('button',{name:'Desk 30',exact:true}).focus();await page.keyboard.press('Tab');await page.waitForFunction(()=>document.activeElement?.id==='close-sheet');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'Desk 30',exact:true}).evaluate(el=>document.activeElement===el),true);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='primary');
   await choose.click();await page.getByRole('button',{name:'Desk 01',exact:true}).click();assert.equal(await page.locator('#sheet').evaluate(el=>el.open),false);assert.equal(await choose.evaluate(el=>document.activeElement===el),true);
   await page.getByRole('button',{name:'Start focus',exact:true}).click();await page.locator('#timer').waitFor();assert.match(await page.locator('#activity-feedback').textContent(),/Desk 01/);
   for(const state of ['loading','empty','full','wait','offline','reconnect','denied']){
    await page.locator('#preview-state').selectOption(state);assert.ok((await page.locator('#connection').textContent()).length>10);
    assert.equal(await primary.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Leave cafe',exact:true}).isEnabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:`${output}/${name}-${state}.png`,fullPage:true});
   }
   await page.locator('#cancel-activity').click();assert.equal(await page.locator('#timer').isVisible(),false);
   await page.getByRole('button',{name:'Leave cafe',exact:true}).click();await page.locator('#preview-state').selectOption('ready');assert.equal(await primary.textContent(),'Choose a seat');
   await page.locator('#preview-world').selectOption('maid');await page.getByRole('button',{name:'Order a drink',exact:true}).click();await page.getByRole('button',{name:'Take a voluntary shift',exact:true}).click();assert.equal(await primary.textContent(),'Choose an order');
   await primary.click();await page.getByRole('button',{name:'Stop voluntary shift',exact:true}).click();assert.equal(await primary.textContent(),'Order a drink');
   await page.getByRole('button',{name:'Settings',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'Reduce motion'}).isChecked(),true);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='settings-trigger');
   await page.getByRole('button',{name:'Safety and privacy',exact:true}).click();await page.getByRole('button',{name:'Leave this interaction',exact:true}).click();
   const snapshot=await page.locator('body').ariaSnapshot();await writeFile(`${output}/${name}-accessibility.yml`,snapshot);assert.match(snapshot,/navigation "City navigation"/);assert.match(snapshot,/status/);
   await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
   await page.screenshot({path:`${output}/${name}-text-200.png`,fullPage:true});
   const overflow=await page.evaluate(()=>({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>window.innerWidth+1).map(n=>({tag:n.tagName,class:n.getAttribute('class'),text:n.textContent?.trim().slice(0,80),right:n.getBoundingClientRect().right}))}));
   await writeFile(`${output}/${name}-layout.json`,JSON.stringify(overflow,null,2));assert.ok(overflow.scroll<=overflow.viewport,JSON.stringify(overflow));
   await choose.click();await page.getByRole('dialog',{name:'Choose a seat'}).waitFor();
   assert.equal(await page.locator('#sheet').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.screenshot({path:`${output}/${name}-dialog-text-200.png`,fullPage:true});await page.keyboard.press('Escape');
   const targets=await page.locator('button:visible,a:visible,select:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>({label:n.textContent.trim().slice(0,50),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
   assert.ok(targets.every(t=>t.width>=44&&t.height>=44),JSON.stringify(targets));assert.deepEqual(errors,[]);
   results.push({name,width,height,states:8,keyboardDialogEscapeRestore:true,seatFocusCancel:true,negativeActionsDuringUnavailableState:true,voluntaryShiftStartStop:true,semanticAccessibilitySnapshot:true,textScale200:true,noOverflow:true,targets,noPageErrors:true});await context.close();
  }
  await writeFile('artifacts/vnext/n06-02/browser-facts.json',JSON.stringify({urlScope:'Ephemeral loopback allowlisted static server',results,limitations:['Simulated state prototype, no actual gameplay/API/native app','Semantic browser tree and keyboard checks, not human screen-reader certification','Historical scene assets/approvals unchanged']},null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',profiles:results.length,stateProfileExecutions:results.length*8,scope:'Static simulated prototype; no runtime gameplay claim'}));
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
