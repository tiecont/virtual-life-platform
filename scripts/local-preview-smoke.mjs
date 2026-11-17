import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect,request} from '@playwright/test';
import {readPreviewEnvironment} from './local-preview.mjs';

const env=await readPreviewEnvironment(),root='artifacts/local-preview/smoke';
const origin=key=>'http://127.0.0.1:'+env[key];
const admin=origin('PREVIEW_ADMIN_PORT'),portal=origin('PREVIEW_WEB_PORT');
const facts={result:'RUNNING',profiles:[]};
await mkdir(root,{recursive:true});
const api=await request.newContext(),browser=await chromium.launch();
try{
 assert.equal((await api.get(origin('PREVIEW_API_PORT')+'/health/ready')).status(),200);
 assert.equal((await api.get(origin('PREVIEW_NATIVE_PORT')+'/health/live')).status(),200);
 assert.equal((await api.get(origin('PREVIEW_NATIVE_PORT')+'/health/ready')).status(),503);
 for(const profile of [{name:'desktop',width:1280,height:800},{name:'mobile',width:320,height:800}]){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height}});
  try{
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   // A rejected HMR handshake can leave server-rendered controls inert in dev.
   const sockets=[];page.on('websocket',socket=>{if(new URL(socket.url()).pathname==='/_next/hmr')socket.on('framereceived',()=>sockets.push(socket.url()));});
   assert.equal((await page.goto(portal)).status(),200);
   await expect(page.locator('h1')).toContainText('A city begins');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.screenshot({path:root+'/portal-'+profile.name+'.png',fullPage:true});
   await expect.poll(()=>sockets.length).toBeGreaterThan(0);sockets.length=0;
   for(const lang of ['vi','en']){
    assert.equal((await page.goto(admin+'/?lang='+lang)).status(),200);
    await expect(page.locator('html')).toHaveAttribute('lang',lang);
    await expect(page.locator('h1')).toHaveCount(1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:root+'/aetheria-'+lang+'-'+profile.name+'.png',fullPage:true});
    await page.goto(admin+'/preregister?lang='+lang);await expect(page.locator('input,form')).toHaveCount(0);
   }
   await expect.poll(()=>sockets.length).toBeGreaterThan(0);
   await page.goto(admin+'/pets?lang=en');
   await page.getByLabel('Element',{exact:true}).selectOption('fire');
   await page.getByLabel('Acquisition',{exact:true}).selectOption('standard_gacha');
   await expect(page.getByRole('status')).toContainText('1 / 240');
   await page.getByRole('heading',{name:'Cindrelis',exact:true}).click();
   await expect(page.locator('canvas')).toHaveCount(0);
   await page.getByRole('button',{name:'Open 3D preview',exact:true}).click();
   await expect(page.getByRole('status')).toContainText('3D ready');
   const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
   const png=await canvas.screenshot({path:root+'/canvas-'+profile.name+'.png',style:'canvas, section[aria-label="3D Pet preview"] {background:rgb(1,2,3)!important;}'});
   const pixels=await page.evaluate(async encoded=>{
    const bitmap=await window.createImageBitmap(new Blob([Uint8Array.from(window.atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'}));
    const frame=new window.OffscreenCanvas(bitmap.width,bitmap.height),ctx=frame.getContext('2d');ctx.drawImage(bitmap,0,0);
    const bytes=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;let occupied=0;
    for(let i=0;i<bytes.length;i+=4)if(bytes[i]!==1||bytes[i+1]!==2||bytes[i+2]!==3)occupied++;
    const result={occupied,total:bitmap.width*bitmap.height};bitmap.close();return result;
   },png.toString('base64'));
   assert(pixels.occupied>pixels.total*.02&&pixels.occupied<pixels.total*.8);
   await page.screenshot({path:root+'/concept-'+profile.name+'.png',fullPage:true});
   await page.goto(admin+'/admin');await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
   const denied=await context.request.get(admin+'/api/admin/session');
   assert.equal(denied.status(),401);assert(denied.headers()['cache-control'].includes('no-store'));
   assert.equal((await context.request.post(admin+'/api/admin/login',{headers:{origin:'https://attacker.invalid'},data:{}})).status(),403);
   for(const path of ['/api/signup','/api/preregister','/api/pets/grant'])assert.equal((await context.request.post(admin+path,{data:{}})).status(),404);
   assert.deepEqual(errors,[]);
   facts.profiles.push({name:profile.name,localizedPreview:true,hmr:true,minWidth:profile.width,registrationClosed:true,atlas:true,webglPixels:pixels,operatorDenied:true});
  }finally{await context.close();}
 }
 facts.result='PASS';console.log(JSON.stringify(facts));
}catch(error){facts.result='FAIL';throw error;}
finally{await browser.close();await api.dispose();await writeFile(root+'/result.json',JSON.stringify(facts,null,2)+'\n');}
