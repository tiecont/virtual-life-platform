# Room network baseline (M06-06)

Reproduce: `pnpm bench:rooms`. Creates isolated schema/disposable PostgreSQL17.7-alpine tmpfs Compose project,forks actual Nest/Fastify/Socket.IO API,creates24 HTTP guest identities,sets public presence,opens24 authenticated WebSocket sockets,joins concurrently,snapshots,holds2seconds,reconnects4,then leaves. Asserts actual sockets/rooms,retained grace membership,zero remaining members/seats. Child/schema/containers clean up. Server rates unchanged. HTTP bootstrap uses actual127.20.0.x source addresses; sockets share loopback (24+4 handshakes below30/minute). ROOM_LOAD_SOCKETS can reduce profile2..24; larger profiles require a separate load design.

Actual run2026-11-02T18:07:53Z,exit0:m06-network-baseline-attempt2.log + m06-network-baseline.json. First attempt failed CJS top-level await before running load; no measurement from that run.

| Measure | Actual value |
|---|---|
| Host | Ryzen7 4800HS,16logicalCPUs,24573251584bytesRAM,Linux7.2.9-2-cachyos |
| Runtime | Node26.9.0,pnpm11.28.5,tsx child API,PostgreSQL17.7-alpine |
| Socket profile |24unique accounts,24actual sockets,3rooms,capacity8 |
| Join |24concurrent,24success;p50 197.150ms,p95 339.606ms,max358.224ms |
| Reconnect |4concurrent,4success;p95/max149.627ms including handshake |
| Elapsed |2835.906ms,including2second hold |
| Server CPU |569.395ms;20.078% of one core |
| Server RSS |166707200before,174309376sampled peak,173608960after bytes |
| Server heap |45578424sampled peak bytes |
| Queues |peak24command/service jobs;final0pending/0control keys |
| Drops/errors |0dropped,0command errors |
| Cleanup |24leaves;0remaining memberships/seats |

CPU is child user+system delta(client/DB excluded but share host). RSS/heap sampled every100ms over IPC,not OS-enforced high-water. Bootstrap/compilation outside timing. No TLS/WAN/rendering/gameplay/chat/travel. Single short baseline/small sample establishes neither sustained capacity,maximum CCU,production SLO nor cost forecast. Cgroup limits were unavailable,not assumed unlimited.

Fail on command/schema/auth/invariant/cleanup errors; report measured latency/resources without10K claims. WAN/slow-reader/soak/reconnect-storm profiles and protected metrics export remain M21/M22 gates. Multiple replicas prohibited before fenced ownership is implemented.
