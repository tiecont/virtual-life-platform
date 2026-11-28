//! Domain adapter: snapshot-bound Arena8 match with account membership.

use aetheria_game_core::{
    Canonical, Decision, Error, LogicalClock, RNG_VERSION, Reducer, Ruleset, TurnRng, Value,
    canonical, canonical::list,
};
use aetheria_pet_arena::arena8::binding::{self, Allocation, BindingError, MatchSnapshot};
use aetheria_pet_arena::arena8::{Action, Arena8Bound, BoundState};

/// New versioned native ruleset id. The frozen \`pet-arena-pve\` id is untouched.
pub const RULESET_ID: &str = "arena8-pve";
pub const RULESET_VERSION: u32 = 1;

/// Adapter-only contract text. Combat content is bound by the binding digest.
const CONTRACT: &str = "single-player;server-authored-allocation;immutable-snapshot;server-entropy;terminal-completion-v1;projection-arena8-v1;no-client-outcome";

/// Server-selected allocation. Constructed only from trusted allocator input;
/// never from an intent payload.
pub struct Rules {
    snapshot: MatchSnapshot,
}

impl Rules {
    pub fn allocate(allocation: Allocation) -> Result<Self, BindingError> {
        Ok(Self {
            snapshot: allocation.bind()?,
        })
    }

    /// Rehydrate an already validated allocation snapshot (e.g. a durable
    /// allocator record). Revalidates against the catalogs.
    pub fn from_snapshot(snapshot: MatchSnapshot) -> Result<Self, BindingError> {
        snapshot.validate()?;
        Ok(Self { snapshot })
    }

    pub fn snapshot(&self) -> &MatchSnapshot {
        &self.snapshot
    }

    pub fn initial(&self) -> Result<State, Error> {
        Ok(State {
            account: self.snapshot.account().into(),
            bound: BoundState::allocate(self.snapshot.clone())?,
        })
    }
}

#[derive(Clone)]
pub struct State {
    /// Authenticated account this allocation belongs to. Never projected.
    pub account: String,
    pub bound: BoundState,
}

impl Canonical for State {
    fn canonical(&self) -> Value {
        list([Value::Text(self.account.clone()), self.bound.canonical()])
    }
}

/// Adapter content digest consumed by the allocator, ticket scope and reward
/// policy. It binds the combat binding digest and the adapter contract only.
pub fn content_hash() -> [u8; 32] {
    canonical::hash(
        "aetheria.arena8-native.v1",
        &list([
            Value::Bytes(binding::BINDING_DIGEST.to_vec()),
            Value::Text(CONTRACT.into()),
        ]),
    )
    .expect("bounded static adapter contract")
}

impl Reducer for Rules {
    type State = State;
    type Action = Action;

    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: RULESET_ID.into(),
            version: RULESET_VERSION,
            content_hash: content_hash(),
            rng_version: RNG_VERSION,
        }
    }

    fn validate(&self, state: &State) -> Result<(), Error> {
        if state.account != self.snapshot.account() || state.bound.snapshot() != &self.snapshot {
            return Err(Error::InvalidState);
        }
        <Arena8Bound as Reducer>::validate(&Arena8Bound, &state.bound)
    }

    fn reduce(
        &self,
        state: &State,
        action: &Action,
        clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<State>, Error> {
        self.validate(state)?;
        let decision = Arena8Bound.reduce(&state.bound, action, clock, rng)?;
        let terminal = decision.state.core().phase().terminal();
        Ok(Decision {
            state: State {
                account: state.account.clone(),
                bound: decision.state,
            },
            events: decision.events,
            projections: decision.projections,
            settlement: terminal.then_some(Value::Null),
        })
    }
}
