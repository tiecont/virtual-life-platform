# VL-015 pure reducer boundary

`crates/vl-game-core` is the new native Rust rule shell. Legacy TypeScript
`packages/boardgame-core` and Nest RoomAuthority remain unchanged. No runtime route
imports the new crate; gameplay activation stays disabled. The example is a
synthetic arithmetic fixture, not Pet Arena/Lodge rules or their acceptance.

## Contract

`begin` pins match ID, ruleset ID/version, content SHA256, RNG version, host clock
and seed commitment. `apply` checks pinned identity/version/content, monotonic
logical time/tick, seed binding, validates input/output state and returns a private
next checkpoint, canonical events, projection intents and settlement proposal.
Commands and checkpoints are trusted host inputs, not network DTOs or authenticated
types. Host authentication, participant/turn authorization, fencing, command-ID
deduplication, durable integrity and commit-before-ACK/broadcast belong to later
tasks. Pure code cannot prove those host properties. A repeated command is rejected
by expected version only; durable receipt retrieval is VL-017, not this primitive.

Reducer implementations are trusted code: no I/O, system clock/randomness, floats,
unordered iteration, interior mutation, or asynchronous callbacks. Types exclude
floats from canonical data; Rust cannot prevent a future rule author from calling
I/O internally. Domain implementations must validate reachable states, turn/actor
permissions, content budgets and explicitly build privacy-safe public events.
State, actions, audit records/hashes, settlement and participant projections stay
server-side; never broadcast an automatic checkpoint/state serialization. Audit
hashes of hidden low-entropy data are not public privacy proofs. Projection intents
do not grant membership or access. Settlement is a proposal, not a wallet write.

## Frozen version 1

- Canonical bytes: ASCII `VL-CANON` + byte `01`; tags `00` null, `01` bool
  (00/01), `02` signed i64 BE, `03` unsigned u64 BE, `04` bytes, `05` UTF-8 text,
  `06` list, `07` map. Bytes/text have u32 BE byte lengths; list/map have u32 BE
  counts. Map keys are u32 BE UTF-8 byte length + bytes, in Rust BTreeMap string
  order (UTF-8 lexicographic), unique and case-sensitive. Text is exact UTF-8;
  no Unicode normalization. Signed/unsigned values and bytes/text stay distinct.
- Limits: 1 MiB encoded value, depth 32, 30,000 nodes; 512 events/projections per
  turn. Typed conversions and transport decoders must impose their own allocation
  limits before building this in-memory tree. No arbitrary serde serialization.
- Hashes: SHA256 of canonical `[domain, payload]`. Genesis/turn, seed commitment
  and RNG key each have different versioned domains. Accepted-turn record binds
  prior audit hash, pinned match/rules/content/RNG, seed commitment, next version,
  command ID/action, tick/logical time, old/new RNG cursor, next private state,
  ordered events/projection intents, and zero-or-one settlement list. None and
  Some(Null) remain distinct. The host protects checkpoint integrity on restore.
- Fixed is signed i64 milli-units (`1000 = 1`). Checked add/sub; i128 intermediates
  for mul/div with truncation toward zero, checked i64 conversion, zero-divide
  rejection. No saturation, float conversion or platform-dependent rounding.
- RNG v1 pins rand_chacha 0.10.0 ChaCha20, `next_u32` words and u64 word cursor.
  Host supplies a fresh secret OS-CSPRNG 256-bit seed for every match. Key is
  HMAC-SHA256(seed, canonical `[vl.rng-key.v1, binding]`); binding pins match ID,
  ruleset/version, content and RNG version. Public commitment is SHA256 canonical
  `[vl.seed-commit.v1, [binding, seed]]`. SecretSeed has no Debug/Serialize/export;
  only the public commitment is exposed, never the stream. There is no entropy
  I/O inside the pure crate. Caller owns secure provisioning, encrypted persistence,
  retention and seed lifecycle. Zeroizing clears stored seed/derived-key copies;
  no claim of complete stack/compiler/upstream RNG memory zeroization.
- Uniform bounded rolls reject the top incomplete u32 range; Fisher-Yates shuffle
  uses the same method with <=512 items. <=16,384 words/turn and checked u64 cursor
  prevent unbounded rejection work/wrap. On any failure the candidate stream/state
  is discarded; the previous checkpoint is immutable under the trusted rule contract.

Any change to canonical encoding, RNG mapping/key derivation, arithmetic rounding
or record shape requires a new version and retained replay adapter/fixtures. Do
not update frozen fixtures just to make changed behavior green.

## Verification

`cargo test --workspace --locked`, fmt, clippy and
`node crates/vl-game-core/tools/check-replay.mjs` run on CachyOS and Ubuntu CI.
The latter compares two independent processes against five frozen private turn
hashes. Tests include ChaCha's published reference block, restore/cursor behavior,
actual rejection sampling, shuffle preservation, fixed arithmetic extremes,
canonical framing/bounds, and 256-case properties over valid/invalid actions and
wide integer reference arithmetic. These qualify deterministic primitives only;
no PG writes, admission, deployed native client, Unity/Windows or gameplay claim.
