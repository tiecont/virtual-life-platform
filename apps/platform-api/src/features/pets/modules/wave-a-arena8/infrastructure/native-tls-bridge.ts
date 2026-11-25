import {createServer as createHttpsServer,type Server} from 'node:https';
import {request as httpRequest} from 'node:http';
import {connect} from 'node:net';
import {readFile} from 'node:fs/promises';

export type NativeTlsBridge=Readonly<{
  origin:string;
  close:()=>Promise<void>;
}>;

const LOOPBACK=new Set(['127.0.0.1','[::1]']);
const MAX_CERT_BYTES=16_384;

function closedServer(server:Server):Promise<void>{
  return new Promise(resolve=>server.close(()=>resolve()));
}

// A narrowly scoped local TLS terminator for the plain-HTTP native runtime.
// It terminates the exact configured HTTPS origin and reverse-proxies HTTP and
// WebSocket upgrades to the loopback runtime port. It is not a second gateway,
// ticket authority or persistence layer.
export async function startNativeTlsBridge(options:Readonly<{
  origin:string;targetPort:number;certFile:string;keyFile:string;
}>):Promise<NativeTlsBridge>{
  if(!Number.isInteger(options.targetPort)||options.targetPort<1||options.targetPort>65535)
    throw new Error('Native TLS bridge target is invalid');
  let origin:URL;
  try{origin=new URL(options.origin);}catch{throw new Error('Native TLS bridge origin is invalid');}
  if(origin.protocol!=='https:'||origin.origin!==options.origin||!LOOPBACK.has(origin.hostname)||
    !origin.port||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('Native TLS bridge origin is invalid');
  let cert:string,key:string;
  try{
    const [certBytes,keyBytes]=await Promise.all([
      readFile(options.certFile),readFile(options.keyFile),
    ]);
    if(certBytes.length===0||certBytes.length>MAX_CERT_BYTES||
      keyBytes.length===0||keyBytes.length>MAX_CERT_BYTES)
      throw new Error();
    cert=certBytes.toString('utf8');key=keyBytes.toString('utf8');
  }catch{throw new Error('Native TLS bridge credentials are unavailable');}

  const server=createHttpsServer({cert,key,minVersion:'TLSv1.2'},(request,response)=>{
    const upstream=httpRequest({
      host:'127.0.0.1',port:options.targetPort,method:request.method,path:request.url,
      headers:{...request.headers,host:'127.0.0.1:'+options.targetPort},
    },result=>{
      response.writeHead(result.statusCode??502,result.headers);
      result.pipe(response);
    });
    upstream.on('error',()=>{
      if(!response.headersSent)response.writeHead(502,{'content-type':'text/plain'});
      response.end();
    });
    request.pipe(upstream);
  });
  server.on('upgrade',(request,socket,head)=>{
    const target=connect(options.targetPort,'127.0.0.1');
    const destroy=()=>{socket.destroy();target.destroy();};
    socket.on('error',destroy);target.on('error',destroy);
    target.once('connect',()=>{
      const headers=Array.from({length:request.rawHeaders.length/2},(_,index)=>
        request.rawHeaders[index*2]+': '+request.rawHeaders[index*2+1]).join('\r\n');
      target.write((request.method??'GET')+' '+(request.url??'/')+' HTTP/1.1\r\n'+headers+'\r\n\r\n');
      if(head.length)target.write(head);
      socket.pipe(target);target.pipe(socket);
    });
  });
  server.on('tlsClientError',()=>{});
  await new Promise<void>((resolve,reject)=>{
    const failed=(error:Error)=>reject(new Error('Native TLS bridge unavailable: '+error.message));
    server.once('error',failed);
    server.listen(Number(origin.port),origin.hostname==='[::1]'?'::1':'127.0.0.1',()=>{
      server.removeListener('error',failed);resolve();
    });
  });
  return Object.freeze({origin:options.origin,close:()=>closedServer(server)});
}
