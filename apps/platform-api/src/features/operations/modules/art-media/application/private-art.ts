import {PrivateArtDraftSchema,PrivateArtIntakeSchema,PrivateArtQuerySchema} from '@virtual-city/contracts';
import type {OperatorService} from '../../../../identity/modules/operators/application/operator-service';
import {DomainError} from '../../../../../shared/common/errors';

type Row={id:string;fingerprint:string;metadata:unknown;created_at:Date;publication:string;art_gate:string;content_verification:string};
const view=(row:Row)=>PrivateArtDraftSchema.parse({draftId:row.id,metadata:row.metadata,createdAt:row.created_at.toISOString(),publication:row.publication,artGate:row.art_gate,contentVerification:row.content_verification});
export class PrivateArtIntake {
 constructor(private operator:OperatorService,private now=Date.now){}
 async read(token:string,input:unknown){const {draftId}=PrivateArtQuerySchema.parse(input);return this.operator.controlRead(token,async db=>{
  const row=(await db.query<Row>('SELECT * FROM operator_art_drafts WHERE id=$1',[draftId])).rows[0];
  if(!row)throw new DomainError('NOT_FOUND',404,'Private art draft unavailable');return view(row);
 });}
 async intake(token:string,csrf:unknown,input:unknown){const value=PrivateArtIntakeSchema.parse(input);return this.operator.controlWrite(token,csrf,async(db,subject,seal)=>{
  const fingerprint=seal('private-art-intake',value.metadata),prior=(await db.query<Row>('SELECT * FROM operator_art_drafts WHERE id=$1',[value.requestId])).rows[0];
  if(prior){if(prior.fingerprint!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409,'Intake request changed');return view(prior);}
  const budget=(await db.query<{hour:number;total:number}>("SELECT count(*) FILTER(WHERE created_at>clock_timestamp()-interval '1 hour')::int AS hour,count(*)::int AS total FROM operator_art_drafts")).rows[0];
  if(budget.hour>=30||budget.total>=10000)throw new DomainError('RATE_LIMITED',429,'Private art intake capacity reached');
  const row=(await db.query<Row>('INSERT INTO operator_art_drafts(id,fingerprint,operator_ref,metadata,created_at) VALUES($1,$2,$3,$4,$5) RETURNING *',[value.requestId,fingerprint,seal('private-art-operator',subject),value.metadata,new Date(this.now())])).rows[0];
  return view(row);
 });}
}
