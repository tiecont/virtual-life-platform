import {afterEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
import {publicSitePreview,operatorPath} from './public-site';
afterEach(()=>vi.unstubAllEnvs());
describe('prelaunch release isolation',()=>{
 it('never enables production/test through a preview flag and defaults closed',()=>{
  for(const NODE_ENV of ['production','test',undefined])expect(publicSitePreview({NODE_ENV,AETHERIA_SITE_PREVIEW:'1'})).toBe(false);
  expect(publicSitePreview({NODE_ENV:'development'})).toBe(false);
  expect(publicSitePreview({NODE_ENV:'development',AETHERIA_SITE_PREVIEW:'true'})).toBe(false);
  expect(publicSitePreview({NODE_ENV:'development',AETHERIA_SITE_PREVIEW:'1'})).toBe(true);
 });
 it('classifies operator paths on boundaries, never by a permissive prefix',()=>{
  for(const path of ['/admin','/admin/prelaunch','/api/admin/session'])expect(operatorPath(path)).toBe(true);
  for(const path of ['/administrator','/admin-public','/api/administrator','/'])expect(operatorPath(path)).toBe(false);
 });
 it('blocks public HTML/RSC in production even when preview is set while retaining nonce-protected operator login',()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('AETHERIA_SITE_PREVIEW','1');
  for(const path of ['/','/preregister','/world','/administrator'])for(const rsc of ['0','1']){
   const response=proxy(new NextRequest('https://site.invalid'+path,{headers:{rsc,'x-aetheria-locale':'en'}}));
   expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  }
  const first=proxy(new NextRequest('https://site.invalid/admin')),second=proxy(new NextRequest('https://site.invalid/admin'));
  expect(first.status).toBe(200);expect(first.headers.get('cache-control')).toBe('private, no-store');
  expect(first.headers.get('content-security-policy')).toContain("'strict-dynamic'");
  expect(first.headers.get('content-security-policy')).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(first.headers.get('content-security-policy')).not.toBe(second.headers.get('content-security-policy'));
 });
 it('ignores caller language hints and gives preview a distinct media policy',()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('AETHERIA_SITE_PREVIEW','1');
  for(const [path,locale] of [['/','vi'],['/?lang=en','en'],['/?lang=en&lang=vi','vi'],['/?lang=other','vi'],['/admin?lang=vi','en']]){
   const response=proxy(new NextRequest('http://localhost'+path,{headers:{'x-aetheria-locale':'untrusted'}}));
   expect(response.headers.get('x-middleware-request-x-aetheria-locale')).toBe(locale);
   expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
   expect(response.headers.get('content-security-policy')).toContain(path.startsWith('/admin')?"media-src 'none'":"media-src 'self'");
  }
 });
});
