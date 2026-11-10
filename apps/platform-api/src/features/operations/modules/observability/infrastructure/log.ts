import { ApiErrorSchema } from '@virtual-city/contracts';
import { DomainError } from '../../../../../shared/common/errors';
import { requestLog } from '../../../../../shared/common/request-log';
const codes=new Set<string>(ApiErrorSchema.shape.error.shape.code.options);
export function operationalRequestLog(req:{method:string;url:string;routeOptions?:{url?:string}}){
 const method=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER',pattern=req.routeOptions?.url;
 if(!pattern)return {method,path:'/[unknown]'};
 return requestLog({method,url:pattern.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g,'[redacted]')});
}
export function operationalErrorLog(error:unknown){return {type:'Error',message:'Details omitted',stack:'[redacted]',code:error instanceof DomainError&&codes.has(error.code)?error.code:'INTERNAL_ERROR'};}
