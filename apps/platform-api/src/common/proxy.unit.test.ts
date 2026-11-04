import { it,expect } from 'vitest';
import Fastify from 'fastify';
import { clientAddress,isTrustedProxy } from './proxy';

it('trusts one configured IPv4 proxy including mapped peers and never trusts an arbitrary forwarding header',()=>{
 expect(isTrustedProxy('::ffff:127.0.0.1','127.0.0.1')).toBe(true);
 expect(isTrustedProxy('127.0.0.2','127.0.0.1')).toBe(false);
 expect(clientAddress('127.0.0.2','198.51.100.2','127.0.0.1')).toBe('127.0.0.2');
 expect(clientAddress('127.0.0.1','198.51.100.2')).toBe('127.0.0.1');
 expect(clientAddress('::ffff:127.0.0.1','198.51.100.2','127.0.0.1')).toBe('198.51.100.2');
 expect(clientAddress('127.0.0.1','2001:db8::1','127.0.0.1')).toBe('2001:db8::1');
 for(const header of ['198.51.100.2, 192.0.2.2','not-an-ip',['198.51.100.2']])expect(clientAddress('127.0.0.1',header,'127.0.0.1')).toBe('127.0.0.1');
});

it('Fastify accepts forwarding only from that configured peer and ignores untrusted host/protocol/IP claims',async()=>{
 const api=Fastify({trustProxy:address=>isTrustedProxy(address,'127.0.0.1')});
 api.get('/',req=>({ip:req.ip,protocol:req.protocol,host:req.hostname}));
 try{
  const headers={host:'api.internal','x-forwarded-for':'198.51.100.9','x-forwarded-proto':'https','x-forwarded-host':'city.local'};
  expect((await api.inject({url:'/',remoteAddress:'127.0.0.1',headers})).json()).toEqual({ip:'198.51.100.9',protocol:'https',host:'city.local'});
  expect((await api.inject({url:'/',remoteAddress:'127.0.0.2',headers})).json()).toEqual({ip:'127.0.0.2',protocol:'http',host:'api.internal'});
 }finally{await api.close();}
});
