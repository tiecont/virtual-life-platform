import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {create,toBinary} from '@bufbuild/protobuf';
import {ClientEnvelopeSchema,ServerEnvelopeSchema,decodeClient,decodeServer,MAX_FRAME_BYTES,MAX_ACTION_BYTES} from '../src';
const fixture=(name:string)=>Uint8Array.from(Buffer.from(readFileSync('proto/native/fixtures/'+name+'-v1.hex','utf8').trim(),'hex'));
it('exchanges frozen Rust-compatible hello frames and preserves u64 as bigint',()=>{
  const bytes=fixture('client-hello'),client=decodeClient(bytes),server=decodeServer(fixture('server-hello'));
  expect(client.sequence).toBe(9n);expect(client.body.case).toBe('hello');
  expect(server.commandId).toEqual(client.commandId);expect(server.canonicalVersion).toBe(9007199254740993n);
  expect(toBinary(ClientEnvelopeSchema,client)).toEqual(bytes);
  expect(toBinary(ServerEnvelopeSchema,server)).toEqual(fixture('server-hello'));
});
it('accepts an additive unknown field without promoting it into an authority context',()=>{
  const original=fixture('client-hello'),additive=Uint8Array.from([...original,0xf8,0x07,1]);
  expect(decodeClient(additive)).toEqual(decodeClient(original));
});
it('rejects oversized, malformed, unsupported and bodyless frames',()=>{
  expect(()=>decodeClient(new Uint8Array(MAX_FRAME_BYTES+1))).toThrow('FRAME_TOO_LARGE');
  expect(()=>decodeClient(Uint8Array.from([0x80]))).toThrow('MALFORMED_FRAME');
  const value=decodeClient(fixture('client-hello'));value.protocolVersion=2;
  expect(()=>decodeClient(toBinary(ClientEnvelopeSchema,value))).toThrow('UNSUPPORTED_VERSION');
  value.protocolVersion=1;value.body={case:undefined};
  expect(()=>decodeClient(toBinary(ClientEnvelopeSchema,value))).toThrow('INVALID_ENVELOPE');
});
it('rejects out-of-bounds movement, excessive action data and forged schema acceptance',()=>{
  const base=decodeClient(fixture('client-hello'));
  base.body={case:'moveIntent',value:{$typeName:'virtuallife.public.v1.MoveIntent',inputSequence:1n,directionX:1001,directionZ:0}};
  expect(()=>decodeClient(toBinary(ClientEnvelopeSchema,base))).toThrow('INVALID_ENVELOPE');
  base.body={case:'gameIntent',value:{$typeName:'virtuallife.public.v1.GameIntent',gameSessionId:new Uint8Array(16),expectedStateVersion:1n,kind:'card.draw',actionPayload:new Uint8Array(MAX_ACTION_BYTES+1)}};
  expect(()=>decodeClient(toBinary(ClientEnvelopeSchema,base))).toThrow('INVALID_ENVELOPE');
  const server=create(ServerEnvelopeSchema,{protocolVersion:2,commandId:new Uint8Array(16)});
  expect(()=>decodeServer(toBinary(ServerEnvelopeSchema,server))).toThrow('UNSUPPORTED_VERSION');
});

it('accepts a genesis game command at version zero',()=>{
 const envelope=create(ClientEnvelopeSchema,{
  protocolVersion:1,commandId:new Uint8Array(16).fill(1),sequence:1n,
  body:{case:'gameIntent',value:{gameSessionId:new Uint8Array(16).fill(2),expectedStateVersion:0n,kind:'fixture.advance.v1',actionPayload:new Uint8Array()}},
 });
 expect(decodeClient(toBinary(ClientEnvelopeSchema,envelope))).toEqual(envelope);
});
