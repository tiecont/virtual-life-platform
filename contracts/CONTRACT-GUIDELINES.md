# Cross-world contract rules (draft)

Plan pack only. Actual schema files must be generated and validated by coding agent under `packages/contracts` after audit.

## Envelope

```ts
interface ClientCommand<T> { requestId: string; schemaVersion: 1; worldId: string; roomId?: string; type: string; payload: T }
interface ServerEvent<T> { eventId: string; schemaVersion: 1; roomId?: string; sequence?: number; type: string; timestamp: string; payload: T }
interface CommandAck<T> { requestId: string; ok: boolean; result?: T; error?: { code: string; message: string; retryable: boolean } }
```

## Protocol invariants

- Strict schema validation, auth, room membership and policy checks at server edge.
- Ordering is per authoritative room; detect sequence gaps and fetch snapshot.
- Any mutation has idempotency/duplicate semantics, not exactly-once transport assumptions.
- Shared events contain minimal public-safe data. Dating activity never appears in global discovery without explicit opt-in.
- Explicit server error codes; disconnect must not imply success.
- Versioned contracts and compatibility tests against legacy clients before migration.
