import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { SessionHandshakeSchema, SessionCheckSchema, SessionCheckAckSchema, NativeSocketHandshakeSchema,NATIVE_ANDROID_ORIGIN,negotiateClientProtocol, type NegotiatedSession } from '@virtual-city/contracts';
import type { Config } from '../config';
import { IdentityService, type IdentityContext } from './service';
import { IdentityError, unauthorized } from './errors';
import { sessionCookieName } from './http';
import { WindowLimiter } from './limits';
import { clientAddress } from '../common/proxy';
import {NativeProtocolError,type NativeIdentityService} from './native-service';
type Lease = { token: string; context: IdentityContext; cleanup: () => void; armExpiry: () => void; compatibility?: NegotiatedSession };
export function createIdentityGateway(http: FastifyInstance, config: Config, identity: IdentityService, now = Date.now,available=()=>true,native?:NativeIdentityService) {
  const limits = new WindowLimiter(now);
  const leases = new WeakMap<Socket, Lease>();
  const sessions = new Map<string, Set<Socket>>();
  const commands = new Set(['session.check']);
  const endedListeners = new Set<(context: IdentityContext) => void>();
  const io = new Server(http.server, {
    transports: ['websocket'], serveClient: false, maxHttpBufferSize: 8192, connectTimeout: 5000,
    cors: { origin: native?[config.WEB_ORIGIN,NATIVE_ANDROID_ORIGIN]:config.WEB_ORIGIN, credentials: true },
    allowRequest: (request, done) => {
      const address=clientAddress(request.socket.remoteAddress,request.headers['x-forwarded-for'],config.TRUSTED_PROXY_IP);
      const allowedOrigin=request.headers.origin===config.WEB_ORIGIN||!!native&&request.headers.origin===NATIVE_ANDROID_ORIGIN;
      const allowed = available()&&allowedOrigin && limits.take('handshake:' + address, 30) && io.engine.clientsCount < 1000;
      done(null, allowed);
    },
  });
  function disconnect(socket: Socket, reason: 'session-ended' | 'rate-limit' = 'session-ended') {
    const context = leases.get(socket)?.context;
    if (reason === 'session-ended' && context) for (const listener of endedListeners) { try { listener(context); } catch { /* Session DB and command guards remain authoritative. */ } }
    socket.emit('session.revoked', { schemaVersion: 1, reason }); socket.disconnect(true);
  }
  async function authorize(socket: Socket): Promise<IdentityContext> {
    if(!available())throw new IdentityError('WORLD_UNAVAILABLE',503,'Server is stopping');
    const lease = leases.get(socket);
    if (!lease || !socket.connected) throw unauthorized();
    if (!limits.take('commands:' + lease.context.sessionId, 60)) throw new IdentityError('RATE_LIMITED', 429, 'Please wait before trying again');
    const current = await identity.authenticate(lease.token);
    if(!available())throw new IdentityError('WORLD_UNAVAILABLE',503,'Server is stopping');
    if (current.accountId !== lease.context.accountId || current.sessionId !== lease.context.sessionId) throw unauthorized();
    return current;
  }
  io.use(async (socket, next) => {
    try {
      if(!available())return next(new Error('WORLD_UNAVAILABLE'));
      let token:string,context:IdentityContext,compatibility:NegotiatedSession|null|undefined;
      if(native&&socket.handshake.headers.origin===NATIVE_ANDROID_ORIGIN){
        if(socket.handshake.headers.cookie!==undefined)throw unauthorized();
        const handshake=NativeSocketHandshakeSchema.parse(socket.handshake.auth),admitted=await native.consumeTicket(handshake.nativeTicket,handshake.protocol);
        if(admitted.ticketExpiresAt<=now())throw unauthorized();token=admitted.credential;context=await identity.authenticate(token);
        if(admitted.ticketExpiresAt<=now()||context.accountId!==admitted.context.accountId||context.sessionId!==admitted.context.sessionId)throw unauthorized();compatibility=admitted.selection;
      }else{
        if(socket.handshake.headers.origin!==config.WEB_ORIGIN)throw unauthorized();
        const handshake = SessionHandshakeSchema.parse(socket.handshake.auth),header = socket.handshake.headers.cookie ?? '';
        if (header.length > 4096) throw unauthorized();
        const signed = http.parseCookie(header)[sessionCookieName(config)];if (!signed) throw unauthorized();
        const parsed = http.unsignCookie(signed);if (!parsed.valid || !parsed.value || !/^[a-f0-9]{64}$/.test(parsed.value)) throw unauthorized();
        identity.verifyCsrf(parsed.value, handshake.csrfToken);token=parsed.value;context=await identity.authenticate(token);
        compatibility=handshake.protocol?negotiateClientProtocol(handshake.protocol):undefined;
      }
      if(!available())return next(new Error('WORLD_UNAVAILABLE'));
      if (compatibility === null) {
        const error = new Error('UPGRADE_REQUIRED') as Error & {data: {code: string; retryable: boolean}};
        error.data = {code: 'UPGRADE_REQUIRED', retryable: false}; return next(error);
      }
      if (socket.conn.readyState !== 'open') throw unauthorized();
      const current = sessions.get(context.sessionId) ?? new Set<Socket>();
      if (current.size >= 4) return next(new Error('RATE_LIMITED'));
      current.add(socket); sessions.set(context.sessionId, current);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        leases.delete(socket); current.delete(socket);
        if (current.size === 0) sessions.delete(context.sessionId);
      };
      const armExpiry = () => {
        const remaining = context.expiresAt - now();
        if (remaining <= 0) { disconnect(socket); return; }
        timer = setTimeout(armExpiry, Math.min(remaining, 86400000)); timer.unref();
      };
      socket.conn.once('close', cleanup); socket.once('disconnect', cleanup);
      leases.set(socket, { token, context, cleanup, armExpiry, ...(compatibility ? {compatibility} : {}) });
      next();
    } catch(error) {if(error instanceof NativeProtocolError){const update=new Error('UPGRADE_REQUIRED') as Error&{data:{code:string;retryable:boolean}};update.data={code:'UPGRADE_REQUIRED',retryable:false};next(update);}else next(new Error('UNAUTHENTICATED'));}
  });
  io.on('connection', socket => {
    const lease = leases.get(socket); lease?.armExpiry();
    if (socket.connected && lease?.compatibility) socket.emit('session.compatibility', lease.compatibility);
    socket.onAny(event => {
      if (!commands.has(event) || !limits.take('events:' + socket.id, 120)) disconnect(socket, 'rate-limit');
    });
    socket.on('session.check', async (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') { disconnect(socket); return; }
      const parsed = SessionCheckSchema.safeParse(input);
      const requestId = parsed.success ? parsed.data.requestId : randomUUID();
      if (!parsed.success) {
        ack(SessionCheckAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error: { code: 'INVALID_REQUEST', retryable: false } })); return;
      }
      try {
        const context = await authorize(socket);
        ack(SessionCheckAckSchema.parse({ schemaVersion: 1, requestId, ok: true, result: { accountId: context.accountId, kind: context.kind } }));
      } catch (error) {
        const code = !available()?'INTERNAL_ERROR':error instanceof IdentityError ? (error.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UNAUTHENTICATED') : 'INTERNAL_ERROR';
        ack(SessionCheckAckSchema.parse({ schemaVersion: 1, requestId, ok: false, error: { code, retryable: code !== 'UNAUTHENTICATED' } }));
        if (available()&&code !== 'RATE_LIMITED') disconnect(socket);
      }
    });
  });
  const unsubscribe = identity.onRevoked(event => {
    for (const id of event.sessionIds) for (const socket of [...(sessions.get(id) ?? [])]) disconnect(socket);
  });
  const unsubscribeControls=identity.onAccountControl(accountId=>{
    for(const sockets of sessions.values())for(const socket of [...sockets]){
      const observed=leases.get(socket);if(observed?.context.accountId!==accountId)continue;
      // An already revoked socket closes; a newly authenticated session survives
      // replay of an older command. No rate-limit budget is consumed by hints.
      void identity.authenticate(observed.token).then(current=>{
        if(leases.get(socket)===observed&&(current.accountId!==observed.context.accountId||current.sessionId!==observed.context.sessionId))disconnect(socket);
      }).catch(()=>{if(leases.get(socket)===observed)disconnect(socket);});
    }
  });
  http.addHook('preClose', async () => { unsubscribe(); unsubscribeControls(); io.disconnectSockets(true); io.engine.close(); });
  http.addHook('onClose', async () => { await io.close(); });
  // M06 may register room commands only after its dependencies are VERIFIED.
  const emitToAccount = (accountId: string, event: string, payload: unknown) => {
    for (const sockets of sessions.values()) for (const socket of sockets) if (leases.get(socket)?.context.accountId === accountId && socket.connected) socket.emit(event, payload);
  };
  const withSession = async <T>(socket: Socket, action: (context: IdentityContext, credential: string) => Promise<T>): Promise<T> => {
    const context = await authorize(socket); const lease = leases.get(socket);
    if (!lease) throw unauthorized(); return action(context, lease.token);
  };
  return {
    io, authorize, withSession, emitToAccount, endSession: (socket: Socket) => disconnect(socket),
    // Liveness observers receive only the authenticated handshake context.
    // Every command must still reauthenticate against the current session DB.
    connectionContext:(socket:Socket)=>socket.connected?leases.get(socket)?.context:undefined,
    onSessionEnded: (listener: (context: IdentityContext) => void) => { endedListeners.add(listener); return () => { endedListeners.delete(listener); }; },
    allowCommand: (name: string) => { commands.add(name); },
  };
}
