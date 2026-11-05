# Actual concurrency verification

M22-02 adds physical HTTP/Socket.IO clients against a separate API child and disposable PostgreSQL schema. It retains existing session,IP,queue and transport limits. Fixtures are synthetic,not integrated Deadline/Maid worlds or real adult participants.

Run the focused matrix after building packages:

```sh
node scripts/with-test-db.mjs pnpm exec vitest run --project integration \
  tests/integration/room-network-races.test.ts \
  tests/integration/hospitality.test.ts tests/integration/events.test.ts \
  tests/integration/dating-matching.test.ts tests/integration/rooms.test.ts \
  -t '100 actual socket|20 actual TCP staff claims|table hold competition|eight actual TCP join retries|six actual concurrent joiners|waits for every in-flight'
```

| Scenario | Transport and invariant |
|---|---|
| Room capacity | Seed plus100actual sockets,100simultaneous targeted joins;7admitted/93ROOM_FULL,one room/eight memberships. |
| Seat | 100actual socket members,100simultaneous claims;one owner/99SEAT_TAKEN,one occupied seat. Admissions are setup in batches of10. |
| Hospitality | 20actual TCP staff claim requests after voluntary shifts;one assignment/version1/claim receipt,19conflicts and canonical retry. |
| Booking | 12actual HTTP holds;one allocation/11conflicts. Eight confirmation retries use the existing in-process HTTP injector and persist one reservation. |
| Matching | Eight actual TCP same-key joins allocate once; six actual concurrent TCP joiners produce three disjoint proposals. Existing in-process accept/decline races verify serialized terminal state/no active leftover enrollment. |
| Failed projection | Real socket seat command with one throwing and one held profile-read port;no partial update,queued snapshot waits,canonical retry observes the single committed seat. The injected failure is a controlled port fault,not a network outage. |

The new child diagnostics report counts only. Each network case explicitly leaves/closes sockets and observes zero sockets,transports,memberships and occupied seats before process shutdown/schema cleanup. Test artifacts contain counts/timings rather than account,session or room identifiers.

Actual100member admission bursts exposed growing viewer-projection work and exceeded the existing5second ACK deadline. Four bounded private projection workers improve scheduling but do not certify this burst: a later consolidated run still timed out on `room.join`. Keep that failure. Setup batching makes the seat invariant reproducible without changing the100-way claim race;it is not evidence that99simultaneous admissions satisfy a latency target.

Room publication retains one owner queue,per-viewer privacy and deterministic final ordering. All workers settle before failure releases that queue;authority and captured world generation are checked before publishing the complete batch. No viewer snapshot is shared with another viewer. A mutation may have committed before projection fails;an error must not be interpreted as rollback. A canonical retry/snapshot reconciles state.

Client ACK5seconds and global integration15seconds remain unchanged. Short loopback timings,large host resources and synthetic fixture capacity100 are not production100CCU certification. M22-05 owns ramp/stress/soak and resource measurements. The M21-04 application image predates this Room change;host builds do not update that image. No migration,real-world activation,Redis or additional owner is introduced.

Final commands,failures and counts belong in [M22 evidence](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m22-races-checks.json);the slice is VERIFIED only after those checks actually finish successfully.
