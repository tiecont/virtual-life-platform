// Server-only release policy. Preview is explicit and development-only.
// Production activation needs a separately reviewed owner-authorized change.
export function publicSitePreview(env:Readonly<{NODE_ENV?:string;AETHERIA_SITE_PREVIEW?:string}>):boolean {
 return env.NODE_ENV==='development' && env.AETHERIA_SITE_PREVIEW==='1';
}
export function operatorPath(path:string):boolean {
 return path==='/admin'||path.startsWith('/admin/')||path==='/api/admin'||path.startsWith('/api/admin/');
}
export function siteLocale(value:string|null):'vi'|'en' {return value==='en'?'en':'vi';}
