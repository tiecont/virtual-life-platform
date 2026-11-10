import type {BrowserContext} from '@playwright/test';

// A declared software renderer with GPU compositing avoids Chromium's
// synchronous software-compositor readback. This is a new measurement context,
// not a revision of the historical default-compositor observations or budgets.
export const sceneRenderingProfile={id:'chromium-swiftshader-compositor-v1',launchArguments:['--enable-gpu','--use-angle=swiftshader']} as const;
export async function assertSceneRenderingProfile(context:BrowserContext){
 const browser=context.browser();if(!browser)throw Error('Scene measurement browser unavailable');
 const cdp=await browser.newBrowserCDPSession();
 try{
  const {gpu}=await cdp.send('SystemInfo.getInfo'),renderer=gpu.auxAttributes?.glRenderer,compositor=gpu.featureStatus?.gpu_compositing;
  if(typeof renderer!=='string'||!renderer.includes('SwiftShader')||compositor!=='enabled')throw Error('Declared scene rendering profile unavailable');
  return{...sceneRenderingProfile,renderer,compositor,browser:browser.version(),scope:'Emulated software renderer;not hardware/GPU throughput or physical-device acceptance'};
 }finally{await cdp.detach();}
}
