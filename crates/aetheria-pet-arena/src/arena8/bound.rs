//! Data-bound Arena8 reducer.
//!
//! One combat implementation, two content sources: \`Arena8\` reads the frozen
//! six-Pet v1 tables, \`Arena8Bound\` reads an immutable \`MatchSnapshot\`. The
//! state carries the snapshot digest, so a later loadout change can never alter
//! an allocated match; restoring a rewritten snapshot fails closed.

use aetheria_game_core::{
    Canonical, Decision, Error as CoreError, LogicalClock, RNG_VERSION, Reducer, Ruleset, Value,
    canonical, canonical::list,
};

use super::binding::{self, MatchSnapshot};
use super::model::{Action, Phase, State};
use super::{Board, ELEMENTS, combat};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BoundState {
    pub(crate) core: State,
    pub(crate) snapshot: MatchSnapshot,
}

impl BoundState {
    /// Allocates the unstarted state from an immutable snapshot. The snapshot is
    /// revalidated from the catalogs, so an edited statline is refused.
    pub fn allocate(snapshot: MatchSnapshot) -> Result<Self, CoreError> {
        snapshot.validate().map_err(CoreError::from)?;
        let pet = snapshot.pet_index().map_err(CoreError::from)?;
        let state = Self {
            core: State::allocate(pet, snapshot.encounter().index, snapshot.effective().health)?,
            snapshot,
        };
        state.validate()?;
        Ok(state)
    }

    pub const fn core(&self) -> &State {
        &self.core
    }

    pub const fn snapshot(&self) -> &MatchSnapshot {
        &self.snapshot
    }

    pub fn validate(&self) -> Result<(), CoreError> {
        self.snapshot.validate().map_err(CoreError::from)?;
        if self.core.pet() != self.snapshot.pet_index()?
            || self.core.encounter() != self.snapshot.encounter().index
        {
            return Err(CoreError::InvalidState);
        }
        combat::validate_state_with(
            &self.core,
            &self.snapshot.combat_pet(),
            &self.snapshot.combat_encounter(),
        )
    }

    pub fn hash(&self) -> [u8; 32] {
        canonical::hash("aetheria.arena8.bound-state.v1", &self.canonical())
            .expect("bounded bound state is hashable")
    }

    /// Versioned local codec for the durable checkpoint payload. Values are
    /// revalidated on decode; it is not a public wire format.
    pub fn encode(&self) -> Result<Vec<u8>, CoreError> {
        let cells = self.core.board().cells().iter().map(|e| *e as u8).collect();
        let dto = StateDto {
            schema_version: 1,
            pet: self.core.pet(),
            encounter: self.core.encounter(),
            phase: self.core.phase(),
            turn: self.core.turn(),
            cells,
            health: self.core.health(),
            enemy_health: self.core.enemy_health(),
            enemy_shield: self.core.enemy_shield(),
            mana: self.core.mana(),
            rage: self.core.rage(),
            cooldown: self.core.cooldown(),
            fire_zone_turns: self.core.fire_zone_turns(),
            intent: self.core.intent().cloned(),
            snapshot: self.snapshot.clone(),
        };
        serde_json::to_vec(&dto).map_err(|_| CoreError::InvalidState)
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, CoreError> {
        if bytes.is_empty() || bytes.len() > 131_072 {
            return Err(CoreError::InvalidState);
        }
        let dto: StateDto = serde_json::from_slice(bytes).map_err(|_| CoreError::InvalidState)?;
        if dto.schema_version != 1 || dto.cells.len() != super::CELLS {
            return Err(CoreError::InvalidState);
        }
        let mut cells = [super::Element::Fire; super::CELLS];
        for (at, value) in dto.cells.iter().enumerate() {
            cells[at] = *ELEMENTS
                .get(usize::from(*value))
                .ok_or(CoreError::InvalidState)?;
        }
        let state = Self {
            core: State {
                pet: dto.pet,
                encounter: dto.encounter,
                phase: dto.phase,
                turn: dto.turn,
                board: Board::from_cells(cells),
                health: dto.health,
                enemy_health: dto.enemy_health,
                enemy_shield: dto.enemy_shield,
                mana: dto.mana,
                rage: dto.rage,
                cooldown: dto.cooldown,
                fire_zone_turns: dto.fire_zone_turns,
                intent: dto.intent,
            },
            snapshot: dto.snapshot,
        };
        state.validate()?;
        Ok(state)
    }
}

#[derive(Serialize, Deserialize)]
struct StateDto {
    schema_version: u16,
    pet: u8,
    encounter: u8,
    phase: Phase,
    turn: u8,
    cells: Vec<u8>,
    health: u32,
    enemy_health: u32,
    enemy_shield: u32,
    mana: u16,
    rage: u16,
    cooldown: u8,
    fire_zone_turns: u8,
    intent: Option<super::model::EnemyIntent>,
    snapshot: MatchSnapshot,
}

impl Canonical for BoundState {
    fn canonical(&self) -> Value {
        list([
            Value::Bytes(binding::pinned_digest().to_vec()),
            self.core.canonical(),
            Value::Bytes(self.snapshot.digest().to_vec()),
        ])
    }
}

/// New versioned ruleset id for data-bound Arena8 matches.
pub struct Arena8Bound;

impl Reducer for Arena8Bound {
    type State = BoundState;
    type Action = Action;

    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: binding::BOUND_RULESET_ID.into(),
            version: binding::BOUND_RULESET_VERSION,
            content_hash: binding::pinned_digest(),
            rng_version: RNG_VERSION,
        }
    }

    fn validate(&self, state: &BoundState) -> Result<(), CoreError> {
        state.validate()
    }

    fn reduce(
        &self,
        state: &BoundState,
        action: &Action,
        _clock: LogicalClock,
        rng: &mut aetheria_game_core::TurnRng,
    ) -> Result<Decision<BoundState>, CoreError> {
        self.validate(state)?;
        let decision = combat::reduce_with(
            &state.core,
            action,
            rng,
            &state.snapshot.combat_pet(),
            &state.snapshot.combat_encounter(),
        )?;
        Ok(Decision {
            state: BoundState {
                core: decision.state,
                snapshot: state.snapshot.clone(),
            },
            events: decision.events,
            projections: decision.projections,
            settlement: None,
        })
    }
}
