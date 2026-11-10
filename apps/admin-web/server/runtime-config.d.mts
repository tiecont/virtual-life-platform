export type AdminConfig={origin:string;api:string;production:boolean;metricsToken?:string};
export function adminConfig(env:Record<string,string|undefined>):AdminConfig|undefined;
