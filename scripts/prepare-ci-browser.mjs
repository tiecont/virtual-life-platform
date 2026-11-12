import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {appendFile, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// Official Playwright 1.64.1 Noble, Linux amd64 manifest (not a mutable tag).
// Extract only browser/font assets; never execute the image or mount the host.
const image='mcr.microsoft.com/playwright@sha256:ee15712262f017b8157421b212b12099146645f44b1bc5c0514cbbe6a229b1d0';
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
const manifest=JSON.parse(await readFile('package.json'));
assert.equal(manifest.devDependencies['@playwright/test'],'1.64.1');
const root=resolve('artifacts/ci-browser'),browsers=resolve(root,'browsers'),fonts=resolve(root,'fonts');
await mkdir(root,{recursive:true});await mkdir(browsers,{recursive:true});await mkdir(fonts,{recursive:true});
function run(command,args){
 const result=spawnSync(command,args,{stdio:'inherit',timeout:180000});
 assert(!result.error&&result.status===0,'Browser dependency preparation failed: '+command);
}
run('docker',['pull',image]);
const container='vl-ci-browser-'+randomUUID();
let created=false;
try{
 run('docker',['create','--name',container,'--network','none',image,'/bin/true']);created=true;
 run('docker',['cp',container+':/ms-playwright/.',browsers]);
 run('docker',['cp',container+':/usr/share/fonts/.',fonts]);
}finally{if(created)run('docker',['rm',container]);}
// Keep font configuration and caches in ignored artifacts, including locally.
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const fontconfig=resolve(root,'fonts.conf');
await writeFile(fontconfig,'<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><include>/etc/fonts/fonts.conf</include><dir>'+xml(fonts)+'</dir><cachedir>'+xml(resolve(root,'font-cache'))+'</cachedir></fontconfig>');
process.env.PLAYWRIGHT_BROWSERS_PATH=browsers;process.env.FONTCONFIG_FILE=fontconfig;
run('fc-cache',['--force',fonts]);
assert((await readdir(fonts)).length>0,'Pinned font assets missing');
// This must run on the host: missing host shared libraries or an unusable
// Chromium installation fail before any application check can claim success.
const {chromium}=await import('@playwright/test');
run('ldd',[chromium.executablePath()]);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><p style="font:24px sans-serif">Browser preflight: A city begins. 012345</p>');
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('p').innerText(),'Browser preflight: A city begins. 012345');
 assert((await page.screenshot()).length>1000);
 await writeFile(resolve(root,'result.json'),JSON.stringify({result:'PASS',image,browser:browser.version(),scope:'Host Chromium launch, fonts and render only; application suites remain required'},null,2));
}finally{await browser.close();}
if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,'PLAYWRIGHT_BROWSERS_PATH='+browsers+'\nFONTCONFIG_FILE='+fontconfig+'\n');
console.log('Pinned Playwright browser/font assets prepared; actual application checks still required.');
