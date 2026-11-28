//! Configuration-bound cooperative domain adapter.
use aetheria_game_core::{Decision, Error, LogicalClock, Reducer, Ruleset, TurnRng};
use aetheria_pet_arena::arena8::coop::{
    ArtifactLoadout, ConfigError, CoopCommand, CoopError, CoopRules, CoopState, SEATS, SeatInput,
    SkillLevelBinding,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub const RULESET_ID: &str = "arena8-coop-pve";
pub const RULESET_VERSION: u32 = 1;
pub const MAX_SEAT_POWER_PM: u16 = 5_000;
pub const SYSTEM_ACTOR_ID: &str = "00000000-0000-0000-0000-000000000000";

pub fn server_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

pub struct Rules {
    engine: Arc<CoopRules>,
    initial: CoopState,
    clock: Arc<dyn Fn() -> u64 + Send + Sync>,
}

impl Rules {
    /// Bind the published bundle and the server-authored seat allocation.
    /// Missing, malformed, incompatible or mismatched input fails closed.
    #[cfg(test)]
    pub fn load(
        bundle: &[u8],
        seats: [SeatInput; SEATS],
        boss_id: String,
        loadouts: Option<&[ArtifactLoadout; SEATS]>,
    ) -> Result<Self, ConfigError> {
        Self::load_with_skill_levels(
            bundle,
            seats,
            boss_id,
            loadouts,
            &std::array::from_fn(|_| Vec::new()),
        )
    }

    pub fn load_with_skill_levels(
        bundle: &[u8],
        seats: [SeatInput; SEATS],
        boss_id: String,
        loadouts: Option<&[ArtifactLoadout; SEATS]>,
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
        let mut initial = match loadouts {
            Some(loadouts) => engine.allocate_with_loadouts(seats, loadouts),
            None if !engine.config().has_artifact_catalog() => engine.allocate(seats),
            None => return Err(ConfigError::Artifact),
        }
        .map_err(|error| match error {
            CoopError::Config(error) => error,
            _ => ConfigError::Party,
        })?;
        engine
            .bind_skill_levels(&mut initial, skill_levels)
            .map_err(|_| ConfigError::Skill)?;
        Ok(Self {
            engine: Arc::new(engine),
            initial,
            clock: Arc::new(server_unix_ms),
        })
    }

    pub fn load_solo(
        bundle: &[u8],
        seat: SeatInput,
        boss_id: String,
        loadout: &ArtifactLoadout,
        skill_levels: Vec<SkillLevelBinding>,
    ) -> Result<Self, ConfigError> {
        if seat.account.is_empty()
            || seat.owned_pet_instance_id.is_empty()
            || !(1..=60).contains(&seat.level)
            || seat.artifact_power_pm != 0
        {
            return Err(ConfigError::Party);
        }
        let engine = CoopRules::load_solo(bundle, boss_id)?;
        let mut initial = engine
            .allocate_solo(seat, loadout)
            .map_err(|error| match error {
                CoopError::Config(error) => error,
                _ => ConfigError::Party,
            })?;
        engine
            .bind_skill_levels(&mut initial, &[skill_levels])
            .map_err(|_| ConfigError::Skill)?;
        Ok(Self {
            engine: Arc::new(engine),
            initial,
            clock: Arc::new(server_unix_ms),
        })
    }

    pub fn with_clock(mut self, clock: Arc<dyn Fn() -> u64 + Send + Sync>) -> Self {
        self.clock = clock;
        self
    }

    pub fn now_ms(&self) -> u64 {
        (self.clock)()
    }

    pub fn clock(&self) -> Arc<dyn Fn() -> u64 + Send + Sync> {
        Arc::clone(&self.clock)
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
        for (seat, participant) in self.initial.participants.iter().zip(&state.participants) {
            if participant.account != seat.account
                || participant.pet_id != seat.pet_id
                || participant.upgraded_skill_levels() != seat.upgraded_skill_levels()
                || participant.level != seat.level
                || participant.owned_pet_instance_id != seat.owned_pet_instance_id
                || participant.artifact_loadout_digest != seat.artifact_loadout_digest
                || (seat.artifact_loadout_digest.is_some()
                    && (participant.max_hp, participant.attack, participant.defense)
                        != (seat.max_hp, seat.attack, seat.defense))
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
    type Action = CoopCommand;

    fn ruleset(&self) -> Ruleset {
        self.engine.ruleset()
    }

    fn validate(&self, state: &Self::State) -> Result<(), Error> {
        self.verify(state)
    }

    fn reduce_for_receipt(
        &self,
        state: &CoopState,
        action: &CoopCommand,
        _clock: LogicalClock,
        rng: &mut TurnRng,
        feedback: &mut Vec<aetheria_game_core::Value>,
    ) -> Result<Decision<CoopState>, Error> {
        self.engine
            .reduce_for_member_receipt(state, *action, rng, feedback)
    }

    fn reduce(
        &self,
        state: &Self::State,
        action: &Self::Action,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<Self::State>, Error> {
        self.engine
            .reduce_stamped(state, action.action, action.server_timestamp_ms, rng)
    }
}
