import {fromBinary} from '@bufbuild/protobuf';
import {ClientEnvelopeSchema,ServerEnvelopeSchema,type ClientEnvelope,type ServerEnvelope} from './generated/public_pb.js';
export {ClientEnvelopeSchema,ServerEnvelopeSchema};
export type {ClientEnvelope,ServerEnvelope};
export const PUBLIC_PROTOCOL_VERSION=1,MAX_FRAME_BYTES=65_536,MAX_ACTION_BYTES=16_384;
const byteLength=(value:string)=>new TextEncoder().encode(value).length;
function decode<T>(bytes:Uint8Array,read:()=>T):T {
  if(bytes.length>MAX_FRAME_BYTES)throw Error('FRAME_TOO_LARGE');
  try{return read();}catch{throw Error('MALFORMED_FRAME');}
}
export function decodeClient(bytes:Uint8Array):ClientEnvelope {
  const value=decode(bytes,()=>fromBinary(ClientEnvelopeSchema,bytes,{readUnknownFields:false}));
  if(value.protocolVersion!==PUBLIC_PROTOCOL_VERSION)throw Error('UNSUPPORTED_VERSION');
  if(value.commandId.length!==16)throw Error('INVALID_ENVELOPE');
  const body=value.body;let valid=false;
  if(body.case==='hello') {
    const x=body.value;
    valid=byteLength(x.ticket)>0&&byteLength(x.ticket)<=4096&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(x.clientBuild)
      &&x.contentHash.length===32&&(x.platformLabel===undefined||/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(x.platformLabel));
  } else if(body.case==='gameIntent') {
    const x=body.value;
    valid=x.gameSessionId.length===16&&x.expectedStateVersion>0n&&/^[a-z][a-z0-9._-]{0,63}$/.test(x.kind)&&x.actionPayload.length<=MAX_ACTION_BYTES;
  } else if(body.case==='moveIntent') {
    const x=body.value;valid=x.inputSequence>0n&&Math.abs(x.directionX)<=1000&&Math.abs(x.directionZ)<=1000;
  } else if(body.case==='resync') {
    valid=true;
  }
  if(!valid)throw Error('INVALID_ENVELOPE');
  return value;
}
export function decodeServer(bytes:Uint8Array):ServerEnvelope {
  const value=decode(bytes,()=>fromBinary(ServerEnvelopeSchema,bytes,{readUnknownFields:false}));
  if(value.protocolVersion!==PUBLIC_PROTOCOL_VERSION)throw Error('UNSUPPORTED_VERSION');
  if(value.commandId.length!==16||value.body.case===undefined)throw Error('INVALID_ENVELOPE');
  if(value.body.case==='hello'&&(value.body.value.contentHash.length!==32||value.body.value.stateSchemaVersion!==1))throw Error('INVALID_ENVELOPE');
  const snapshot=value.body.case==='snapshot'?value.body.value:value.body.case==='hello'?value.body.value.snapshot:undefined;
  if(snapshot&&(snapshot.authorityEpoch===0n||!snapshot.ownActor||Math.abs(snapshot.ownActor.xMm)>100000||Math.abs(snapshot.ownActor.zMm)>100000))throw Error('INVALID_ENVELOPE');
  if(value.body.case==='snapshot'&&!snapshot)throw Error('INVALID_ENVELOPE');
  if(value.body.case==='hello'&&value.body.value.runtimeBootId.length!==0&&value.body.value.runtimeBootId.length!==16)throw Error('INVALID_ENVELOPE');
  if(value.body.case==='receipt'&&value.body.value.authorizedProjection.length>MAX_ACTION_BYTES)throw Error('INVALID_ENVELOPE');
  return value;
}
