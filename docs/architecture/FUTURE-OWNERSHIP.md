# Future multi-instance design — not implemented (M02-05)

M06-07 now enforces the current single-process deployment with a dedicated PostgreSQL advisory-lock connection. See ADR 0009 and ROOMS.md. Real competing-process/SIGSTOP/backend-loss tests fail closed; this does not implement the distributed lease/fencing protocol below. Transaction-pooling proxies and multiple independent database primaries are not supported by the current guard.

Trigger: measured room latency/memory/CPU or availability requirement exceeds one replica under documented load. Redis Pub/Sub and multiple Socket.IO adapters are insufficient by themselves. Do not enable replicas until the following protocol and failure tests are implemented.

1. A consistent room directory grants one owner a bounded lease with monotonic fencing epoch. Every ownership mutation requires compare-and-swap on current epoch; old owner cannot write critical state even if it misses lease expiry. Persistent engine writes carry checked fencing token or transactionally lock the owner record.
2. Load balancer/router sends room traffic to owner and establishes connection affinity where the transport requires it. A room is not concurrently active on two processes. Rebalance drains admission, reserves destination owner, transfers versioned snapshot, advances epoch, then admits clients.
3. Clients include last epoch/sequence; epoch changes force snapshot. Sequence gaps pause delta application and request authoritative snapshot. Never apply a delta from an old owner after newer epoch snapshot.
4. Travel coordinates destination reservation/admission with per-actor serialization and source confirmation. Expiry returns source or safe lobby. Retry cannot create two memberships or leak restricted destination metadata.
5. Lease storage/DB outage denies new ownership/mutation after bounded grace; it does not invent a new independent owner. Backpressure, snapshot size, replay cache and per-actor queue limits are bounded.

Required split-brain tests: partition owner from directory but leave its sockets alive; old writes rejected after epoch increase. Pause process beyond lease TTL; verify one active owner after resume. Duplicate/out-of-order event delivery; stale epoch cannot alter client. Kill destination during travel; source retained. Restart with persistent active focus/order; recover/interruption truthful and no duplicate rewards. Reconnect storm capacity bounded. Document hardware/profile/p95 and fail criteria before scale gate.

Rollback: route back to a single fenced owner after draining others, stop all stale owners, advance epoch, require snapshots. No automated production failover/lease system is implemented in W0. Missing these tests blocks multi-replica release, not independent single-process feature development.
