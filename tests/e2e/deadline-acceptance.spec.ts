import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import { test,expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { guest } from '../support/deadline-safety-fixtures';

// Separate one-browser rendering profile. API40actor/30seat measurements are
// recorded by bench:deadline and are not a40browser rendering claim.
test('Deadline keyboard focus,timer actions,reduced motion and readable controls remain accessible without canvas input',async({page,context},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await guest(context,'Deadline keyboard');await page.goto('/worlds/deadline');
 // Native Tab skips unavailable controls; start the keyboard path after async entry readiness.
 const enter=page.getByRole('button',{name:'Enter cafe',exact:true});await expect(enter).toBeEnabled();
 const skip=page.getByRole('link',{name:'Skip to room controls',exact:true});await skip.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('complementary',{name:'Your room',exact:true})).toBeFocused();await page.keyboard.press('Tab');
 await expect(enter).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Walk around',exact:true})).toBeFocused();
 const canvas=page.locator('canvas[data-scene="deadline"]');await expect(canvas).toHaveAttribute('data-reduced-motion','true');
 await expect(page.getByLabel('Reduce room motion',{exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Deadline desk 30',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Deadline desk 30, your seat',exact:true})).toBeVisible();
 const timer=page.getByRole('region',{name:'Private focus timer',exact:true});
 for(const [name,state] of [['Start focus','Focus in progress'],['Cancel timer','Timer cancelled']]){
  const button=timer.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.focus();await page.keyboard.press('Enter');await expect(timer.getByText(state,{exact:true})).toBeVisible();
 }
 await expect(timer.getByRole('button',{name:'Pause timer',exact:true})).toHaveCount(0);
 await expect(timer.getByRole('timer')).toHaveAttribute('aria-live','off');
 await expect(canvas).toHaveAttribute('data-active-animations','0');const frames=await canvas.getAttribute('data-render-count');await page.waitForTimeout(350);await expect(canvas).toHaveAttribute('data-render-count',frames!);
 const contrast=await page.evaluate(()=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);
  const luminance=(values:number[])=>values.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  return Array.from(document.querySelectorAll('.cafe-note,.cafe-scene-caption,.cafe-eyebrow,.cafe-occupancy,.cafe-seat-grid small,.focus-timer p,.focus-timer label,.focus-private')).filter(e=>e.getClientRects().length>0&&!e.closest('button:disabled')).map(e=>{
   let parent:Element|null=e,background='rgb(248, 250, 249)';while(parent){const color=getComputedStyle(parent).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){background=color;break;}parent=parent.parentElement;}
   const foreground=getComputedStyle(e).color,a=luminance(rgb(foreground)),b=luminance(rgb(background));return {selector:e.className||e.tagName,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
 });expect(contrast.length).toBeGreaterThan(10);expect(contrast.every(row=>row.ratio>=4.5)).toBe(true);
 const targets=await page.locator('main button:visible').evaluateAll(elements=>elements.map(e=>({label:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 expect(targets.every(t=>t.width>=44&&t.height>=44)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const dir=evidenceOutput('docs/agent/evidence/m15-deadline-accessibility');await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/${info.project.name}-deadline.png`,fullPage:true});
 await page.getByRole('link',{name:'Back to visit controls',exact:true}).focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
 await expect(page.getByRole('button',{name:'Leave cafe',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(enter).toBeFocused();
 await writeFile(`${dir}/${info.project.name}-deadline.json`,JSON.stringify({nativeEntrySeatTimerAndExit:true,systemReducedMotion:true,noIdleFrames:true,timerLiveRegionOff:true,contrast,targets},null,2));
});
