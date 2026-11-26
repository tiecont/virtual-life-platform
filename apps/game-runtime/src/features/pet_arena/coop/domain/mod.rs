//! Configuration-bound cooperative domain adapter.
use aetheria_game_core::{Decision, Error, LogicalClock, Reducer, Ruleset, TurnRng};
use aetheria_pet_arena::arena8::coop::{
    ConfigError, CoopAction, CoopRules, CoopState, SEATS, SeatInput, SkillLevelBinding,
};
use std::sync::Arc;

pub const RULESET_ID: &str = "arena8-coop-pve";
pub const RULESET_VERSION: u32 = 1;
pub const MAX_SEAT_POWER_PM: u16 = 5_000;

pub struct Rules {
    engine: Arc<CoopRules>,
    seats: [SeatInput; SEATS],
    initial: CoopState,
}

impl Rules {
    /// Bind the published bundle and the server-authored seat allocation.
    /// Missing, malformed, incompatible or mismatched input fails closed.
    #[cfg(test)]
    pub fn load(
        bundle: &[u8],
        seats: [SeatInput; SEATS],
        boss_id: String,
    ) -> Result<Self, ConfigError> {
        Self::load_with_skill_levels(bundle, seats, boss_id, &std::array::from_fn(|_| Vec::new()))
    }

    pub fn load_with_skill_levels(
        bundle: &[u8],
        seats: [SeatInput; SEATS],
        boss_id: String,
        skill_levels: &[Vec<SkillLevelBinding>; SEATS],
    ) -> Result<Self, ConfigError> {
        let mut accounts = std::collections::BTreeSet::new();
        let mut owned_pets = std::collections::BTreeSet::new();
        for seat in &seats {
            if seat.account.is_empty()
                || !accounts.insert(seat.account.clone())
                || seat.owned_pet_instance_id.is_empty()
                || !owned_pets.insert(seat.owned_pet_instance_id.clone())
                || !(1..=60).contains(&seat.level)
                || seat.artifact_power_pm > MAX_SEAT_POWER_PM
            {
                return Err(ConfigError::Party);
            }
        }
        let engine = CoopRules::load(bundle, boss_id)?;
        let mut initial = engine
            .allocate(seats.clone())
            .map_err(|_| ConfigError::Party)?;
        engine
            .bind_skill_levels(&mut initial, skill_levels)
            .map_err(|_| ConfigError::Skill)?;
        Ok(Self {
            engine: Arc::new(engine),
            seats,
            initial,
        })
    }

    pub fn initial(&self) -> CoopState {
        self.initial.clone()
    }

    pub fn engine(&self) -> &CoopRules {
        &self.engine
    }

    pub fn content_hash(&self) -> [u8; 32] {
        self.engine.ruleset().content_hash
    }

    /// Restored state must belong to the same published configuration and the
    /// same immutable seat allocation. A different bundle never resumes a match.
    pub fn verify(&self, state: &CoopState) -> Result<(), Error> {
        self.engine.validate(state)?;
        if state.config_digest != self.engine.digest() {
            return Err(Error::InvalidState);
        }
        for (index, (seat, participant)) in
            self.seats.iter().zip(state.participants.iter()).enumerate()
        {
            if participant.account != seat.account
                || participant.pet_id != seat.pet_id
                || participant.level != seat.level
                || participant.upgraded_skill_levels()
                    != self.initial.participants[index].upgraded_skill_levels()
                || participant
                    .owned_pet_instance_id
                    .as_ref()
                    .is_some_and(|id| id != &seat.owned_pet_instance_id)
            {
                return Err(Error::InvalidState);
            }
        }
        Ok(())
    }

    pub fn member(&self, state: &CoopState, account: &str) -> bool {
        state
            .participants
            .iter()
            .any(|participant| !participant.account.is_empty() && participant.account == account)
    }

    pub fn seat(&self, state: &CoopState, account: &str) -> Option<usize> {
        state.participants.iter().position(|participant| {
            !participant.account.is_empty() && participant.account == account
        })
    }
}

impl Reducer for Rules {
    type State = CoopState;
    type Action = CoopAction;

    fn ruleset(&self) -> Ruleset {
        self.engine.ruleset()
    }

    fn validate(&self, state: &Self::State) -> Result<(), Error> {
        self.verify(state)
    }

    fn reduce(
        &self,
        state: &Self::State,
        action: &Self::Action,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<Self::State>, Error> {
        self.engine.reduce(state, *action, rng)
    }
}
