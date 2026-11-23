//! Pure deterministic reducer shell. This crate performs no auth, I/O, clock reads,
//! persistence or broadcast. A host must authenticate/fence, persist then emit.
pub mod canonical;
mod entropy;
mod fixed;

use canonical::list;
pub use canonical::{Canonical, Value};
pub use entropy::{MAX_WORDS_PER_TURN, RNG_VERSION, SecretSeed, TurnRng};
pub use fixed::Fixed;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InvalidState,
    InvalidAction,
    VersionConflict,
    ContentMismatch,
    ClockRegression,
    Arithmetic,
    Capacity,
    EntropyExhausted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ruleset {
    pub id: String,
    pub version: u32,
    pub content_hash: [u8; 32],
    pub rng_version: u32,
}

impl Ruleset {
    fn validate(&self) -> Result<(), Error> {
        if self.id.is_empty()
            || self.id.len() > 64
            || !self
                .id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"-._".contains(&b))
            || self.version == 0
            || self.rng_version != RNG_VERSION
            || self.content_hash == [0; 32]
        {
            return Err(Error::ContentMismatch);
        }
        Ok(())
    }
    fn binding(&self, match_id: [u8; 16]) -> Value {
        list([
            Value::Bytes(match_id.to_vec()),
            Value::Text(self.id.clone()),
            Value::Uint(self.version.into()),
            Value::Bytes(self.content_hash.to_vec()),
            Value::Uint(self.rng_version.into()),
        ])
    }
}

/// Domain authors must validate every reachable state and explicitly construct
/// public events. State is private; canonical state and audit hashes stay server-side.
pub trait Reducer {
    type State: Canonical + Clone;
    type Action: Canonical;
    fn ruleset(&self) -> Ruleset;
    fn validate(&self, state: &Self::State) -> Result<(), Error>;
    fn reduce(
        &self,
        state: &Self::State,
        action: &Self::Action,
        clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<Self::State>, Error>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LogicalClock {
    pub server_tick: u64,
    pub logical_time_ms: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProjectionIntent {
    PublicChanged,
    ParticipantChanged(u64),
}

pub struct Decision<S> {
    pub state: S,
    pub events: Vec<Value>,
    pub projections: Vec<ProjectionIntent>,
    /// Proposal only; the economy owner must validate/commit its own idempotent effect.
    pub settlement: Option<Value>,
}

/// Trusted host inputs, never a network DTO or evidence of authentication.
pub struct Command<A> {
    pub id: [u8; 16],
    pub match_id: [u8; 16],
    pub expected_version: u64,
    pub ruleset: Ruleset,
    pub action: A,
}

/// Full private checkpoint. No public serializer. Restore validation and durable
/// integrity are host responsibilities; this is not a storage or auth boundary.
#[derive(Clone)]
pub struct Checkpoint<S> {
    pub match_id: [u8; 16],
    pub ruleset: Ruleset,
    pub version: u64,
    pub clock: LogicalClock,
    pub rng_cursor: u64,
    pub seed_commitment: [u8; 32],
    pub audit_hash: [u8; 32],
    pub state: S,
}

pub struct Transition<S> {
    pub next: Checkpoint<S>,
    pub events: Vec<Value>,
    pub projections: Vec<ProjectionIntent>,
    pub settlement: Option<Value>,
    /// Server-only canonical record; contains state/action and may contain hidden data.
    pub audit_record: Vec<u8>,
}

pub fn begin<R: Reducer>(
    rules: &R,
    match_id: [u8; 16],
    state: R::State,
    seed: &SecretSeed,
    clock: LogicalClock,
) -> Result<Checkpoint<R::State>, Error> {
    let ruleset = rules.ruleset();
    ruleset.validate()?;
    if match_id == [0; 16] {
        return Err(Error::InvalidState);
    }
    rules.validate(&state)?;
    let binding = ruleset.binding(match_id);
    let seed_commitment = seed.commitment(binding.clone())?;
    let audit_hash = canonical::hash(
        "vl.genesis.v1",
        &list([
            binding,
            Value::Bytes(seed_commitment.to_vec()),
            Value::Uint(clock.server_tick),
            Value::Uint(clock.logical_time_ms),
            state.canonical(),
        ]),
    )?;
    Ok(Checkpoint {
        match_id,
        ruleset,
        version: 0,
        clock,
        rng_cursor: 0,
        seed_commitment,
        audit_hash,
        state,
    })
}

pub fn apply<R: Reducer>(
    rules: &R,
    previous: &Checkpoint<R::State>,
    command: &Command<R::Action>,
    seed: &SecretSeed,
    clock: LogicalClock,
) -> Result<Transition<R::State>, Error> {
    previous.ruleset.validate()?;
    if previous.ruleset != rules.ruleset() || command.ruleset != previous.ruleset {
        return Err(Error::ContentMismatch);
    }
    if command.id == [0; 16]
        || command.match_id != previous.match_id
        || command.expected_version != previous.version
    {
        return Err(Error::VersionConflict);
    }
    let version = previous
        .version
        .checked_add(1)
        .ok_or(Error::VersionConflict)?;
    if clock.server_tick < previous.clock.server_tick
        || clock.logical_time_ms < previous.clock.logical_time_ms
    {
        return Err(Error::ClockRegression);
    }
    let binding = previous.ruleset.binding(previous.match_id);
    if seed.commitment(binding.clone())? != previous.seed_commitment {
        return Err(Error::InvalidState);
    }
    rules.validate(&previous.state)?;
    canonical::encode(&previous.state.canonical())?;
    let action = command.action.canonical();
    canonical::encode(&action)?;
    let mut rng = TurnRng::new(seed, binding.clone(), previous.rng_cursor)?;
    // Isolation means reducer failures cannot mutate the committed input.
    let decision = rules.reduce(&previous.state.clone(), &command.action, clock, &mut rng)?;
    rules.validate(&decision.state)?;
    if decision.events.len() > 512 || decision.projections.len() > 512 {
        return Err(Error::Capacity);
    }
    let projections = list(decision.projections.iter().map(|p| match p {
        ProjectionIntent::PublicChanged => list([Value::Uint(0)]),
        ProjectionIntent::ParticipantChanged(id) => list([Value::Uint(1), Value::Uint(*id)]),
    }));
    let record = list([
        Value::Bytes(previous.audit_hash.to_vec()),
        binding,
        Value::Bytes(previous.seed_commitment.to_vec()),
        Value::Uint(version),
        Value::Bytes(command.id.to_vec()),
        action,
        Value::Uint(clock.server_tick),
        Value::Uint(clock.logical_time_ms),
        Value::Uint(previous.rng_cursor),
        Value::Uint(rng.cursor()),
        decision.state.canonical(),
        list(decision.events.clone()),
        projections,
        list(decision.settlement.clone()),
    ]);
    let audit_record = canonical::encode(&record)?;
    let audit_hash = canonical::hash("vl.turn.v1", &record)?;
    Ok(Transition {
        next: Checkpoint {
            match_id: previous.match_id,
            ruleset: previous.ruleset.clone(),
            version,
            clock,
            rng_cursor: rng.cursor(),
            seed_commitment: previous.seed_commitment,
            audit_hash,
            state: decision.state,
        },
        events: decision.events,
        projections: decision.projections,
        settlement: decision.settlement,
        audit_record,
    })
}
