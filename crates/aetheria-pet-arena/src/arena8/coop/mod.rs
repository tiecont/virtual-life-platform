//! Versioned four-seat cooperative Arena8 Boss ruleset.
//!
//! This module is separate from the frozen solo `arena8-pve` reducer. It models
//! one shared board, four authenticated seats, deterministic seat order, two
//! Boss phases, progressive multiplier tiles and a typed effect system.
//!
//! Every authored number comes from [`config::CoopConfig`], which PostgreSQL
//! owns and Admin publishes. This file contains algorithms, structural bounds
//! and technical safety limits only: no production balance value and no hidden
//! default. An absent or invalid bundle fails closed.
//!
//! Trust boundary: the host supplies server-owned entropy through
//! [`aetheria_game_core::TurnRng`] and a command envelope carrying only an
//! intent. A command never names a seed, target, damage, outcome or reward.

pub mod config;
pub mod simulation;

use crate::arena8::Element;
use crate::arena8::coop::config::BossConfig;
use aetheria_game_core::{
    Canonical, Decision, Error as CoreError, LogicalClock, ProjectionIntent, RNG_VERSION, Reducer,
    Ruleset, TurnRng, Value, canonical::list,
};
use serde::{Deserialize, Serialize};

/// Durable encoding for the fixed 8x8 board. A wrong-length payload is
/// rejected rather than silently padded, so a corrupted snapshot fails closed.
mod board_cells {
    use super::{CELLS, Tile};
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(
        board: &[Option<Tile>; CELLS],
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        board.as_slice().serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<[Option<Tile>; CELLS], D::Error> {
        let cells = Vec::<Option<Tile>>::deserialize(deserializer)?;
        <[Option<Tile>; CELLS]>::try_from(cells).map_err(|cells: Vec<Option<Tile>>| {
            serde::de::Error::custom(format!("board has {} cells", cells.len()))
        })
    }
}

pub use config::{ConfigError, CoopConfig};

/// Stable identifier of the cooperative ruleset family.
pub const COOP_RULESET_ID: &str = "arena8-coop-pve";
pub const COOP_RULESET_VERSION: u32 = 1;
/// Structural engine capability: the board is 8x8 and the party has 4 seats.
pub const SEATS: usize = 4;
pub const SIDE: usize = 8;
pub const CELLS: usize = SIDE * SIDE;
/// Structural ceiling on a single match. Authored limits must not exceed it.
pub const MAX_TURNS: u16 = 4_096;
pub const MAX_SUBMISSIONS: u16 = 8_192;

/// Adapter contract text bound into the native content hash.
pub const CONTRACT: &str = "cooperative;four-seat;shared-8x8-board;server-authored-config;immutable-snapshot;server-entropy;two-phase-boss;multiplier-schedule;typed-effects;terminal-completion-v1;no-client-outcome";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CoopPhase {
    Ready,
    Playing,
    Won,
    Lost,
}

impl CoopPhase {
    pub const fn terminal(self) -> bool {
        matches!(self, Self::Won | Self::Lost)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Tile {
    pub element: Element,
    pub multiplier: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StatusKind {
    AttackBuff,
    DefenseBuff,
    Vulnerability,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Status {
    pub kind: StatusKind,
    pub value: i32,
    pub turns: u8,
}

const NO_STATUS: Option<Status> = None;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Participant {
    pub account: String,
    pub pet_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owned_pet_instance_id: Option<String>,
    pub level: u8,
    pub hp: u32,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub crit_rate_bp: u16,
    pub crit_damage_bp: u16,
    pub mana: u16,
    pub rage: u16,
    pub shield: u32,
    /// Remaining authored turns before the shield expires. Zero when unshielded.
    pub shield_turns: u8,
    pub cooldowns: [u8; 5],
    pub statuses: [Option<Status>; 4],
    pub contribution_damage: u64,
    pub contribution_healing: u64,
    pub contribution_shielding: u64,
    pub alive: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Boss {
    pub hp: u32,
    pub max_hp: u32,
    pub phase: u8,
    pub shield: u32,
    pub armor_break_pm: u16,
    pub dot_damage: u32,
    pub dot_turns: u8,
    pub transformed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PendingAttack {
    pub targets: u8,
    pub remaining: u8,
    pub damage: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CoopState {
    /// Digest of the exact configuration that allocated this match.
    pub config_digest: [u8; 32],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub boss_id: Option<String>,
    pub participants: [Participant; SEATS],
    pub boss: Boss,
    #[serde(with = "board_cells")]
    pub board: [Option<Tile>; CELLS],
    pub phase: CoopPhase,
    pub active_seat: usize,
    pub turn_index: u16,
    pub round_index: u16,
    pub pending: Option<PendingAttack>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoopAction {
    Start,
    Swap { first: u8, second: u8 },
    Guard,
    Skill,
    Signature,
    Ultimate,
    FireZone,
}

impl Canonical for CoopAction {
    fn canonical(&self) -> Value {
        match self {
            Self::Start => Value::Text("start".into()),
            Self::Swap { first, second } => list([
                Value::Uint(1),
                Value::Uint(u64::from(*first)),
                Value::Uint(u64::from(*second)),
            ]),
            Self::Guard => Value::Uint(2),
            Self::Skill => Value::Uint(3),
            Self::Signature => Value::Uint(4),
            Self::Ultimate => Value::Uint(5),
            Self::FireZone => Value::Uint(6),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoopError {
    InvalidPhase,
    InvalidSeat,
    InvalidSwap,
    NoMatch,
    OutOfBounds,
    OutOfTurn,
    Unavailable,
    Cooldown,
    InsufficientResources,
    UnsupportedAction,
    Arithmetic,
    Config(ConfigError),
}

impl From<CoreError> for CoopError {
    fn from(_: CoreError) -> Self {
        Self::Arithmetic
    }
}

impl CoopError {
    pub const fn message(self) -> &'static str {
        match self {
            Self::InvalidPhase => "action is not valid in this phase",
            Self::InvalidSeat => "seat is not active or alive",
            Self::InvalidSwap => "swap must be between orthogonal neighbours",
            Self::NoMatch => "swap creates no match",
            Self::OutOfBounds => "board index is out of bounds",
            Self::OutOfTurn => "participant is not the active seat",
            Self::Unavailable => "action is not available to this Pet",
            Self::Cooldown => "action is on cooldown",
            Self::InsufficientResources => "insufficient mana or rage",
            Self::UnsupportedAction => "action is not supported by this engine",
            Self::Arithmetic => "gameplay arithmetic is out of bounds",
            Self::Config(_) => "gameplay configuration is invalid",
        }
    }
}

/// Authoritative ruleset instance. Holds the validated immutable bundle for the
/// lifetime of the match; a later publication cannot change it.
#[derive(Clone, Debug)]
pub struct CoopRules {
    config: CoopConfig,
    digest: [u8; 32],
    spawn_table: [u32; 6],
    spawn_total: u32,
    effectiveness: [[u16; 6]; 6],
    selected_boss_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeatInput {
    pub account: String,
    pub pet_id: String,
    /// Distinct owned pet instance identifier. Allows multiple accounts to bring
    /// the same canonical pet species if each owns a separate authorized instance.
    pub owned_pet_instance_id: String,
    pub level: u8,
    /// Artifact power contribution in permille (1000 = none), from authorized
    /// owned Artifacts. Server-authored, never client-supplied.
    pub artifact_power_pm: u16,
}

impl CoopState {
    /// Next living seat starting at `from`, wrapping once. Deterministic seat
    /// order is the engine's structural rule; the authored party size is fixed
    /// by configuration validation to the engine's four seats.
    fn next_alive(&self, from: usize) -> Option<usize> {
        (0..SEATS)
            .map(|offset| (from + offset) % SEATS)
            .find(|index| self.participants[*index].alive)
    }
}

impl CoopRules {
    /// Validate and bind an authored bundle. Fails closed on any defect.
    pub fn load(bytes: &[u8], boss_id: String) -> Result<Self, ConfigError> {
        Self::from_config(CoopConfig::parse(bytes)?, boss_id)
    }

    pub fn from_config(config: CoopConfig, boss_id: String) -> Result<Self, ConfigError> {
        config.validate()?;
        // Verify the boss_id exists in the configuration
        if !config.bosses().iter().any(|b| b.id == boss_id) {
            return Err(ConfigError::Boss);
        }
        let (spawn_table, spawn_total) = config.board.spawn_table()?;
        let mut effectiveness = [[1_000u16; 6]; 6];
        for (index, profile) in config.elements.iter().enumerate() {
            let attacker = config::parse_element(&profile.element)?;
            effectiveness[attacker.index()] = profile.effectiveness_table()?;
            debug_assert_eq!(index, attacker.index());
        }
        let digest = config.digest();
        Ok(Self {
            config,
            digest,
            spawn_table,
            spawn_total,
            effectiveness,
            selected_boss_id: boss_id,
        })
    }

    pub fn config(&self) -> &CoopConfig {
        &self.config
    }

    pub fn selected_boss(&self) -> &BossConfig {
        self.config
            .bosses()
            .iter()
            .find(|b| b.id == self.selected_boss_id)
            .expect("validated boss_id")
    }

    pub fn digest(&self) -> [u8; 32] {
        self.digest
    }

    pub fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: COOP_RULESET_ID.into(),
            version: COOP_RULESET_VERSION,
            content_hash: crate::arena8::coop::content_hash(self.digest),
            rng_version: RNG_VERSION,
        }
    }

    pub fn effectiveness(&self, attacker: Element, defender: Element) -> u16 {
        self.effectiveness[attacker.index()][defender.index()]
    }

    /// Allocate the unstarted match from server-authored seats.
    pub fn allocate(&self, seats: [SeatInput; SEATS]) -> Result<CoopState, CoopError> {
        let mut participants = [(); SEATS].map(|()| unreachable_participant());
        let mut seen_accounts = std::collections::BTreeSet::new();
        let mut seen_pets = std::collections::BTreeSet::new();
        for (index, seat) in seats.into_iter().enumerate() {
            if seat.account.is_empty() || !seen_accounts.insert(seat.account.clone()) {
                return Err(CoopError::InvalidSeat);
            }
            // Allow duplicate pet species if each account owns a distinct authorized instance.
            // Enforce strict separation of canonical_pet_id, owned_pet_instance_id, account_id, and seat_id.
            if seat.owned_pet_instance_id.is_empty()
                || !seen_pets.insert(seat.owned_pet_instance_id.clone())
            {
                return Err(CoopError::InvalidSeat);
            }
            participants[index] = self.participant(seat)?;
        }
        let boss_config = self.selected_boss();
        let state = CoopState {
            config_digest: self.digest,
            boss_id: (self.config.schema_version == config::CONFIG_SCHEMA_VERSION)
                .then(|| boss_config.id.clone()),
            participants,
            boss: Boss {
                hp: boss_config.max_hp,
                max_hp: boss_config.max_hp,
                phase: 1,
                shield: 0,
                armor_break_pm: 1_000,
                dot_damage: 0,
                dot_turns: 0,
                transformed: false,
            },
            board: [None; CELLS],
            phase: CoopPhase::Ready,
            active_seat: 0,
            turn_index: 0,
            round_index: 1,
            pending: None,
        };
        // The board is generated by `Start` from host-owned entropy. Allocating
        // must not derive a stream from the public configuration digest.
        Ok(state)
    }

    fn participant(&self, seat: SeatInput) -> Result<Participant, CoopError> {
        let pet = self
            .config
            .pet(&seat.pet_id)
            .ok_or(CoopError::Unavailable)?;
        if seat.level == 0 || seat.level > 100 {
            return Err(CoopError::InvalidSeat);
        }
        let element = pet.element().map_err(CoopError::Config)?;
        let profile = self.config.element_index().map_err(CoopError::Config)?[element.index()];
        let steps = u32::from(seat.level.saturating_sub(1));
        let artifact = u64::from(seat.artifact_power_pm.min(10_000))
            * u64::from(self.config.damage.artifact_scale_pm)
            / 1_000;
        let scale = u32::try_from(1_000 + artifact).map_err(|_| CoopError::Arithmetic)?;
        let scale = |value: u32| {
            u32::try_from(u64::from(value) * u64::from(scale) / 1_000)
                .map_err(|_| CoopError::Arithmetic)
        };
        let (hp, atk, def) = if let Some(growth) = &pet.growth {
            (
                growth
                    .stat(pet.max_hp, growth.health_bp, steps)
                    .map_err(CoopError::Config)?,
                growth
                    .stat(pet.attack, growth.attack_bp, steps)
                    .map_err(CoopError::Config)?,
                growth
                    .stat(pet.defense, growth.defense_bp, steps)
                    .map_err(CoopError::Config)?,
            )
        } else {
            // Historical bundles author additive growth on the element profile.
            (
                pet.max_hp
                    .saturating_add(profile.hp_growth.saturating_mul(steps)),
                pet.attack
                    .saturating_add(profile.attack_growth.saturating_mul(steps)),
                pet.defense
                    .saturating_add(profile.defense_growth.saturating_mul(steps)),
            )
        };
        let max_hp = scale(hp)?;
        let attack = scale(atk)?;
        let defense = scale(def)?;
        Ok(Participant {
            account: seat.account,
            pet_id: seat.pet_id,
            owned_pet_instance_id: (self.config.schema_version == config::CONFIG_SCHEMA_VERSION)
                .then_some(seat.owned_pet_instance_id),
            level: seat.level,
            hp: max_hp,
            max_hp,
            attack,
            defense,
            crit_rate_bp: pet.crit_rate_bp,
            crit_damage_bp: pet.crit_damage_bp,
            mana: 0,
            rage: 0,
            shield: 0,
            shield_turns: 0,
            cooldowns: [0; 5],
            statuses: [NO_STATUS; 4],
            contribution_damage: 0,
            contribution_healing: 0,
            contribution_shielding: 0,
            alive: true,
        })
    }

    pub fn validate(&self, state: &CoopState) -> Result<(), CoreError> {
        let versioned = self.config.schema_version == config::CONFIG_SCHEMA_VERSION;
        let expected_boss = versioned.then_some(self.selected_boss().id.as_str());
        if state.config_digest != self.digest
            || state.active_seat >= SEATS
            || state.boss_id.as_deref() != expected_boss
        {
            return Err(CoreError::InvalidState);
        }
        let mut instances = std::collections::BTreeSet::new();
        if state.participants.iter().any(|participant| {
            let valid_instance = match &participant.owned_pet_instance_id {
                Some(id) => versioned && !id.is_empty() && instances.insert(id),
                None => !versioned,
            };
            !valid_instance
                || participant.max_hp == 0
                || participant.hp > participant.max_hp
                || participant.attack == 0
                || self.config.pet(&participant.pet_id).is_none()
        }) {
            return Err(CoreError::InvalidState);
        }
        if state.boss.max_hp == 0 || state.boss.hp > state.boss.max_hp {
            return Err(CoreError::InvalidState);
        }
        if state
            .board
            .iter()
            .flatten()
            .any(|tile| tile.multiplier == 0 || !(1..=CELLS as u8).contains(&tile.multiplier))
        {
            return Err(CoreError::InvalidState);
        }
        if u32::from(state.round_index) > u32::from(self.config.party.max_rounds)
            && !state.phase.terminal()
        {
            return Err(CoreError::InvalidState);
        }
        Ok(())
    }

    /// Deterministic reduction of one command. Failed commands consume no
    /// entropy: every roll happens only after the command is accepted.
    pub fn reduce(
        &self,
        state: &CoopState,
        action: CoopAction,
        rng: &mut TurnRng,
    ) -> Result<Decision<CoopState>, CoreError> {
        let mut next = state.clone();
        let mut events = Vec::new();
        match action {
            CoopAction::Start => {
                if next.phase != CoopPhase::Ready {
                    return Err(CoreError::InvalidAction);
                }
                // The initial board is generated only here, from the host's
                // server-owned stream. It has no unresolved matches and at
                // least one legal swap (or the authored dead-board policy).
                self.fill_board(&mut next, rng)?;
                next.phase = CoopPhase::Playing;
                next.active_seat = next.next_alive(0).ok_or(CoreError::InvalidState)?;
                events.push(event("started", None, u64::from(next.boss.hp)));
            }
            CoopAction::Swap { first, second } => {
                self.require_turn(&next)?;
                let first = usize::from(first);
                let second = usize::from(second);
                if first >= CELLS || second >= CELLS {
                    return Err(CoreError::InvalidAction);
                }
                if !adjacent(first, second) {
                    return Err(CoreError::InvalidAction);
                }
                let mut board = next.board;
                board.swap(first, second);
                if !matched_cells(&board).iter().any(|matched| *matched) {
                    // Rejected before any mutation and before any entropy use.
                    return Err(CoreError::InvalidAction);
                }
                next.board = board;
                self.resolve_cascades(&mut next, rng, &mut events)?;
                self.complete_turn(&mut next, rng, &mut events);
            }
            ability => {
                self.require_turn(&next)?;
                self.act_ability(&mut next, ability, rng, &mut events)?;
                self.complete_turn(&mut next, rng, &mut events);
            }
        }
        self.validate(&next)?;
        let terminal = next.phase.terminal();
        let mut projections = vec![ProjectionIntent::PublicChanged];
        // Every seat's private resources, cooldowns and statuses can change in a
        // turn (shared board, boss telegraph, ally effects), so each living seat
        // is told to refresh. Seat order keeps the intent vector deterministic.
        for (index, seat) in next.participants.iter().enumerate() {
            if seat.alive || state.participants[index].alive {
                projections.push(ProjectionIntent::ParticipantChanged(index as u64));
            }
        }
        Ok(Decision {
            settlement: terminal.then(|| self.settlement(&next)),
            state: next,
            events,
            projections,
        })
    }

    fn require_turn(&self, state: &CoopState) -> Result<(), CoreError> {
        if state.phase != CoopPhase::Playing {
            return Err(CoreError::InvalidAction);
        }
        match state.participants.get(state.active_seat) {
            Some(seat) if seat.alive => Ok(()),
            _ => Err(CoreError::InvalidState),
        }
    }

    fn act_ability(
        &self,
        state: &mut CoopState,
        action: CoopAction,
        rng: &mut TurnRng,
        events: &mut Vec<Value>,
    ) -> Result<(), CoreError> {
        let seat_index = state.active_seat;
        let pet_id = state.participants[seat_index].pet_id.clone();
        let pet = self.config.pet(&pet_id).ok_or(CoreError::InvalidAction)?;
        // Pet Level never gates a signature, ultimate or species ability. Level
        // only scales stats.
        let skill_id = match action {
            CoopAction::Guard => pet.guard.clone(),
            CoopAction::Skill => pet.skill.clone(),
            CoopAction::Signature => pet.signature.clone(),
            CoopAction::Ultimate => pet.ultimate.clone(),
            CoopAction::FireZone => pet.fire_zone.clone().ok_or(CoreError::InvalidAction)?,
            CoopAction::Start | CoopAction::Swap { .. } => return Err(CoreError::InvalidAction),
        };
        let skill = self
            .config
            .skill(&skill_id)
            .ok_or(CoreError::InvalidState)?;
        let slot = match action {
            CoopAction::Guard => 0,
            CoopAction::Skill => 1,
            CoopAction::Signature => 2,
            CoopAction::Ultimate => 3,
            CoopAction::FireZone => 4,
            CoopAction::Start | CoopAction::Swap { .. } => return Err(CoreError::InvalidAction),
        };
        let seat = &mut state.participants[seat_index];
        if seat.cooldowns[slot] > 0 {
            return Err(CoreError::InvalidAction);
        }
        if seat.mana < skill.mana_cost || seat.rage < skill.rage_cost {
            return Err(CoreError::InvalidAction);
        }
        seat.mana -= skill.mana_cost;
        seat.rage -= skill.rage_cost;
        if matches!(action, CoopAction::Guard) {
            seat.rage = seat
                .rage
                .saturating_add(self.config.resources.rage_per_guard)
                .min(self.config.resources.rage_cap);
        }
        seat.cooldowns[slot] = skill.cooldown_turns;
        let actor_attack = seat.attack;
        let crit_rate = seat.crit_rate_bp;
        let crit_damage = seat.crit_damage_bp;
        let crit = skill.crit_eligible
            && rng.below(self.config.damage.crit_roll_basis)? < u32::from(crit_rate);
        self.apply_effect(
            state,
            seat_index,
            skill,
            actor_attack,
            crit,
            crit_damage,
            events,
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_effect(
        &self,
        state: &mut CoopState,
        actor: usize,
        skill: &config::SkillConfig,
        attack: u32,
        crit: bool,
        crit_damage_bp: u16,
        events: &mut Vec<Value>,
    ) -> Result<(), CoreError> {
        let effect = &skill.effect;
        let scaled = |value: u32| -> Result<u32, CoreError> {
            u64::from(value)
                .checked_mul(u64::from(skill.power_pm))
                .map(|total| total / 1_000)
                .and_then(|total| u32::try_from(total).ok())
                .ok_or(CoreError::Arithmetic)
        };
        match effect.kind {
            config::EffectKind::Damage | config::EffectKind::DamageOverTime => {
                let mut damage = scaled(attack.saturating_add(effect.value))?;
                if crit {
                    damage = u32::try_from(u64::from(damage) * u64::from(crit_damage_bp) / 10_000)
                        .map_err(|_| CoreError::Arithmetic)?;
                }
                let attacker = self
                    .config
                    .pet(&state.participants[actor].pet_id)
                    .and_then(|pet| pet.element().ok())
                    .ok_or(CoreError::InvalidState)?;
                let boss_element = self
                    .selected_boss()
                    .element()
                    .map_err(|_| CoreError::InvalidState)?;
                damage = u32::try_from(
                    u64::from(damage) * u64::from(self.effectiveness(attacker, boss_element))
                        / 1_000,
                )
                .map_err(|_| CoreError::Arithmetic)?;
                if matches!(effect.kind, config::EffectKind::DamageOverTime) {
                    state.boss.dot_damage = state.boss.dot_damage.saturating_add(damage);
                    state.boss.dot_turns = effect.duration_turns.max(1);
                } else {
                    let dealt = self.damage_boss(state, damage)?;
                    state.participants[actor].contribution_damage = state.participants[actor]
                        .contribution_damage
                        .saturating_add(u64::from(dealt));
                    events.push(event("boss-damage", Some(actor as u8), u64::from(dealt)));
                }
                if crit {
                    events.push(event("critical", Some(actor as u8), 0));
                }
            }
            config::EffectKind::Heal => {
                let amount = scaled(effect.value)?;
                let targets = self.targets(state, actor, effect.target);
                for target in targets {
                    let seat = &mut state.participants[target];
                    if !seat.alive {
                        continue;
                    }
                    let before = seat.hp;
                    seat.hp = seat.hp.saturating_add(amount).min(seat.max_hp);
                    let healed = seat.hp - before;
                    let source = if effect.contribution.is_some() {
                        actor
                    } else {
                        target
                    };
                    let credit = &mut state.participants[source].contribution_healing;
                    *credit = credit.saturating_add(u64::from(healed));
                    events.push(event("heal", Some(target as u8), u64::from(healed)));
                }
            }
            config::EffectKind::Shield => {
                let amount = scaled(effect.value)?;
                let targets = self.targets(state, actor, effect.target);
                for target in targets {
                    let seat = &mut state.participants[target];
                    if !seat.alive {
                        continue;
                    }
                    let before = seat.shield;
                    seat.shield = seat.shield.saturating_add(amount);
                    seat.shield_turns = seat.shield_turns.max(effect.duration_turns.max(1));
                    let (source, granted) = if effect.contribution.is_some() {
                        (actor, seat.shield - before)
                    } else {
                        (target, amount)
                    };
                    let credit = &mut state.participants[source].contribution_shielding;
                    *credit = credit.saturating_add(u64::from(granted));
                    events.push(event("shield", Some(target as u8), u64::from(amount)));
                }
            }
            config::EffectKind::Buff | config::EffectKind::Debuff => {
                let value = i64::from(scaled(effect.value)?);
                let debuff = matches!(effect.kind, config::EffectKind::Debuff);
                if matches!(effect.target, config::EffectTarget::Boss) {
                    if !debuff {
                        // There is no authored Boss buff mechanism.
                        return Err(CoreError::InvalidAction);
                    }
                    // Boss-facing debuffs raise incoming damage. The authored
                    // permille is authoritative and bounded by validation.
                    state.boss.armor_break_pm = state
                        .boss
                        .armor_break_pm
                        .saturating_add(u16::try_from(value).map_err(|_| CoreError::Arithmetic)?)
                        .min(10_000);
                    events.push(event("boss-debuff", Some(actor as u8), 0));
                } else {
                    let targets = self.targets(state, actor, effect.target);
                    for target in targets {
                        let seat = &mut state.participants[target];
                        if !seat.alive {
                            continue;
                        }
                        let status_kind = if debuff {
                            StatusKind::Vulnerability
                        } else {
                            // A Guard-authored ally buff is defensive; other
                            // buffs scale outgoing damage. Both are authored.
                            match skill.kind {
                                config::SkillKind::Guard => StatusKind::DefenseBuff,
                                _ => StatusKind::AttackBuff,
                            }
                        };
                        let turned = effect.duration_turns.max(1);
                        if let Some(active) = seat
                            .statuses
                            .iter_mut()
                            .flatten()
                            .find(|active| active.kind == status_kind)
                        {
                            // Authored stacking: each re-application of the same
                            // status scales its stored magnitude by `stackingPm`.
                            let stacked = i64::from(active.value)
                                .saturating_mul(i64::from(effect.stacking_pm))
                                / 1_000;
                            active.value = i32::try_from(
                                i64::from(active.value).saturating_add(stacked.max(value)),
                            )
                            .unwrap_or(active.value);
                            active.turns = turned;
                        } else if let Some(slot) =
                            seat.statuses.iter_mut().find(|slot| slot.is_none())
                        {
                            *slot = Some(Status {
                                kind: status_kind,
                                value: i32::try_from(value).map_err(|_| CoreError::Arithmetic)?,
                                turns: turned,
                            });
                        }
                        events.push(event("buff", Some(target as u8), 0));
                    }
                }
            }
        }
        Ok(())
    }

    fn targets(&self, state: &CoopState, actor: usize, target: config::EffectTarget) -> Vec<usize> {
        match target {
            config::EffectTarget::Boss => Vec::new(),
            config::EffectTarget::SelfActor => vec![actor],
            config::EffectTarget::Allies => (0..SEATS)
                .filter(|seat| state.participants[*seat].alive)
                .collect(),
            config::EffectTarget::LowestAlly => {
                let lowest = (0..SEATS)
                    .filter(|seat| state.participants[*seat].alive)
                    .min_by_key(|seat| {
                        let seat = &state.participants[*seat];
                        u64::from(seat.hp) * 1_000_000 / u64::from(seat.max_hp.max(1))
                    });
                lowest.into_iter().collect()
            }
        }
    }

    /// Apply damage to the Boss, including exactly one phase transition.
    ///
    /// Phase 1 can never be skipped: the first hit that reaches the authored
    /// threshold transforms the Boss exactly once. Whether the remainder of that
    /// hit carries into phase 2 is the authored `excessDamage` policy.
    fn damage_boss(&self, state: &mut CoopState, damage: u32) -> Result<u32, CoreError> {
        let mut remaining = u32::try_from(
            u64::from(damage)
                .checked_mul(u64::from(state.boss.armor_break_pm))
                .ok_or(CoreError::Arithmetic)?
                / 1_000,
        )
        .map_err(|_| CoreError::Arithmetic)?;
        if state.boss.shield > 0 {
            let absorbed = state.boss.shield.min(remaining);
            state.boss.shield -= absorbed;
            remaining -= absorbed;
        }
        if state.boss.phase == 1 {
            let threshold = self.selected_boss().phase_threshold();
            let to_threshold = state.boss.hp.saturating_sub(threshold);
            if remaining >= to_threshold {
                // Reaches the transition. Phase 1 damage is capped at the
                // threshold and the Boss transforms exactly once.
                let dealt = to_threshold;
                state.boss.hp = state.boss.hp.saturating_sub(dealt);
                self.transform(state)?;
                match self.selected_boss().phase.excess_damage {
                    config::ExcessDamage::Discard => return Ok(dealt),
                    config::ExcessDamage::Carry => {
                        let carried = remaining - to_threshold;
                        let extra = carried.min(state.boss.hp);
                        state.boss.hp -= extra;
                        if state.boss.hp == 0 {
                            state.phase = CoopPhase::Won;
                        }
                        return Ok(dealt.saturating_add(extra));
                    }
                }
            }
            let dealt = remaining.min(state.boss.hp);
            state.boss.hp -= dealt;
            if state.boss.hp <= threshold {
                self.transform(state)?;
            }
            return Ok(dealt);
        }
        let dealt = remaining.min(state.boss.hp);
        state.boss.hp -= dealt;
        if state.boss.hp == 0 {
            state.phase = CoopPhase::Won;
        }
        Ok(dealt)
    }

    fn transform(&self, state: &mut CoopState) -> Result<(), CoreError> {
        if state.boss.transformed {
            return Ok(());
        }
        let max_hp = self
            .selected_boss()
            .phase2_max_hp()
            .map_err(|_| CoreError::InvalidState)?;
        let current = self
            .selected_boss()
            .phase2_current_hp()
            .map_err(|_| CoreError::InvalidState)?;
        state.boss.max_hp = max_hp;
        state.boss.hp = current.min(max_hp);
        state.boss.phase = 2;
        state.boss.transformed = true;
        // A transformation resolves any queued attack so a stale telegraph can
        // never resolve under phase-1 parameters.
        state.pending = None;
        Ok(())
    }

    fn resolve_cascades(
        &self,
        state: &mut CoopState,
        rng: &mut TurnRng,
        events: &mut Vec<Value>,
    ) -> Result<(), CoreError> {
        let max = u32::from(self.config.party.max_cascades);
        let seat = state.active_seat;
        for cascade in 0..max {
            let matched = matched_cells(&state.board);
            if !matched.iter().any(|matched| *matched) {
                return Ok(());
            }
            let outcome = self.score_match(state, seat, &matched, rng)?;
            events.push(event("match", Some(seat as u8), u64::from(outcome.damage)));
            if outcome.critical {
                events.push(event("critical", Some(seat as u8), 0));
            }
            if state.phase.terminal() {
                return Ok(());
            }
            self.gravity_and_refill(state, rng)?;
            if cascade + 1 == max {
                // Bounded execution: the authored cascade cap is reached, so any
                // still-resolving matches are cleared without further scoring and
                // the authored dead-board procedure restores a playable board.
                events.push(event("cascade-cap", Some(seat as u8), u64::from(max)));
                for (index, is_matched) in matched.iter().enumerate() {
                    if *is_matched {
                        state.board[index] = None;
                    }
                }
                self.gravity_and_refill(state, rng)?;
                if matched_cells(&state.board).iter().any(|matched| *matched) {
                    self.dead_board(state, rng)?;
                }
                return Ok(());
            }
        }
        Ok(())
    }

    fn score_match(
        &self,
        state: &mut CoopState,
        seat_index: usize,
        matched: &[bool; CELLS],
        rng: &mut TurnRng,
    ) -> Result<MatchOutcome, CoreError> {
        let element = self
            .config
            .pet(&state.participants[seat_index].pet_id)
            .and_then(|pet| pet.element().ok())
            .ok_or(CoreError::InvalidState)?;
        let own_weight = u64::from(self.config.damage.own_tile_weight_pm);
        let mut contribution = 0u64;
        let mut mana = 0u32;
        let mut rage = 0u32;
        let mut tiles = 0u32;
        for (index, matched) in matched.iter().enumerate() {
            if !matched {
                continue;
            }
            let tile = state.board[index].ok_or(CoreError::InvalidState)?;
            let own = tile.element == element;
            let weight = if own { own_weight } else { 1_000 };
            let damage_weight = u64::from(
                self.config
                    .multiplier
                    .damage_weight(tile.multiplier)
                    .map_err(|_| CoreError::InvalidState)?,
            );
            let resource_weight = u64::from(
                self.config
                    .multiplier
                    .resource_weight(tile.multiplier)
                    .map_err(|_| CoreError::InvalidState)?,
            );
            contribution = contribution
                .checked_add(
                    damage_weight
                        .checked_mul(weight)
                        .ok_or(CoreError::Arithmetic)?
                        / 1_000,
                )
                .ok_or(CoreError::Arithmetic)?;
            mana = mana
                .saturating_add(
                    u32::try_from(
                        u64::from(self.config.resources.mana_per_tile) * resource_weight / 1_000,
                    )
                    .map_err(|_| CoreError::Arithmetic)?,
                )
                .saturating_add(if own {
                    u32::from(self.config.resources.mana_own_bonus)
                } else {
                    0
                });
            rage = rage.saturating_add(
                u32::try_from(
                    u64::from(self.config.resources.rage_per_tile) * resource_weight / 1_000,
                )
                .map_err(|_| CoreError::Arithmetic)?,
            );
            tiles += 1;
            state.board[index] = None;
        }
        if tiles == 0 {
            return Err(CoreError::InvalidState);
        }
        let participant = &state.participants[seat_index];
        let base = u64::from(participant.attack)
            .checked_mul(u64::from(self.config.damage.attack_scale_pm))
            .ok_or(CoreError::Arithmetic)?
            / 1_000;
        let attack_buff = self.status_permille(participant, StatusKind::AttackBuff);
        let bonus = contribution
            .checked_mul(u64::from(self.config.damage.contribution_scale_pm))
            .ok_or(CoreError::Arithmetic)?
            / 1_000;
        let raw = base.saturating_add(bonus);
        let raw = raw
            .checked_mul(u64::from(attack_buff))
            .ok_or(CoreError::Arithmetic)?
            / 1_000;
        let mut damage = u32::try_from(raw).map_err(|_| CoreError::Arithmetic)?;
        // Boss defense mitigation uses the authored divisor.
        let mitigation = u32::try_from(
            u64::from(self.selected_boss().defense) / u64::from(self.config.damage.defense_divisor),
        )
        .unwrap_or(u32::MAX);
        damage = damage.saturating_sub(mitigation).max(1);
        let crit_rate = participant.crit_rate_bp;
        let crit_damage = participant.crit_damage_bp;
        let mut critical = false;
        if rng.below(self.config.damage.crit_roll_basis)? < u32::from(crit_rate) {
            critical = true;
            damage = u32::try_from(u64::from(damage) * u64::from(crit_damage) / 10_000)
                .map_err(|_| CoreError::Arithmetic)?;
        }
        let boss_element = self
            .selected_boss()
            .element()
            .map_err(|_| CoreError::InvalidState)?;
        damage = u32::try_from(
            u64::from(damage) * u64::from(self.effectiveness(element, boss_element)) / 1_000,
        )
        .map_err(|_| CoreError::Arithmetic)?;
        let dealt = self.damage_boss(state, damage)?;
        let seat = &mut state.participants[seat_index];
        seat.contribution_damage = seat.contribution_damage.saturating_add(u64::from(dealt));
        seat.mana = seat
            .mana
            .saturating_add(u16::try_from(mana).unwrap_or(u16::MAX))
            .min(self.config.resources.mana_cap);
        seat.rage = seat
            .rage
            .saturating_add(u16::try_from(rage).unwrap_or(u16::MAX))
            .min(self.config.resources.rage_cap);
        Ok(MatchOutcome {
            damage: dealt,
            critical,
        })
    }

    fn status_permille(&self, seat: &Participant, kind: StatusKind) -> u32 {
        seat.statuses
            .iter()
            .flatten()
            .filter(|status| status.kind == kind)
            .fold(1_000i64, |acc, status| acc + i64::from(status.value))
            .clamp(1, 10_000) as u32
    }

    fn gravity_and_refill(
        &self,
        state: &mut CoopState,
        rng: &mut TurnRng,
    ) -> Result<(), CoreError> {
        let mut next = [None; CELLS];
        for column in 0..SIDE {
            let mut survivors = Vec::with_capacity(SIDE);
            for row in (0..SIDE).rev() {
                if let Some(tile) = state.board[row * SIDE + column] {
                    survivors.push(tile);
                }
            }
            let mut row = SIDE;
            for tile in survivors {
                row -= 1;
                next[row * SIDE + column] = Some(tile);
            }
            // Fill every genuinely empty cell above the surviving run.
            let empty = (0..SIDE)
                .filter(|row| next[row * SIDE + column].is_none())
                .count();
            for row in 0..empty {
                next[row * SIDE + column] = Some(self.spawn_tile(state, rng)?);
            }
        }
        state.board = next;
        if self.legal_swap(state).is_none() {
            self.dead_board(state, rng)?;
        }
        Ok(())
    }

    fn dead_board(&self, state: &mut CoopState, rng: &mut TurnRng) -> Result<(), CoreError> {
        match self.config.board.dead_board_policy {
            config::DeadBoardPolicy::Regenerate => {
                self.fill_board(state, rng)?;
                Ok(())
            }
            config::DeadBoardPolicy::Shuffle => {
                let attempts = u32::from(self.config.board.generation_attempts).max(1);
                for _ in 0..attempts {
                    for index in 0..CELLS {
                        state.board[index] = Some(self.spawn_tile(state, rng)?);
                    }
                    if !matched_cells(&state.board).iter().any(|matched| *matched)
                        && self.legal_swap(state).is_some()
                    {
                        return Ok(());
                    }
                }
                Err(CoreError::InvalidState)
            }
        }
    }

    fn fill_board(&self, state: &mut CoopState, rng: &mut TurnRng) -> Result<(), CoreError> {
        let attempts = u32::from(self.config.board.generation_attempts).max(1);
        for _ in 0..attempts {
            for index in 0..CELLS {
                // An authored initial board has no multiplier tiles; only a
                // refill draws the escalating multiplier distribution.
                let roll = rng.below(self.spawn_total)?;
                state.board[index] = Some(Tile {
                    element: spawn_element(self.spawn_table, roll),
                    multiplier: 1,
                });
            }
            if !matched_cells(&state.board).iter().any(|matched| *matched)
                && self.legal_swap(state).is_some()
            {
                return Ok(());
            }
        }
        Err(CoreError::InvalidState)
    }

    pub fn escalation_clock(&self, state: &CoopState) -> u16 {
        match self.config.multiplier.clock_unit {
            config::EscalationClock::Turn => state.turn_index,
            config::EscalationClock::Round => state.round_index,
        }
    }

    fn spawn_tile(&self, state: &CoopState, rng: &mut TurnRng) -> Result<Tile, CoreError> {
        let clock = self.escalation_clock(state);
        let roll = rng.below(self.spawn_total)?;
        let element = spawn_element(self.spawn_table, roll);
        let budget = self
            .config
            .multiplier
            .weight_budget(clock)
            .map_err(|_| CoreError::InvalidState)?;
        let tier_roll = rng.below(budget)?;
        let tier = self
            .config
            .multiplier
            .tier_for(clock, tier_roll)
            .map_err(|_| CoreError::InvalidState)?;
        Ok(Tile {
            element,
            multiplier: tier.multiplier,
        })
    }

    pub fn legal_swap(&self, state: &CoopState) -> Option<(u8, u8)> {
        for first in 0..CELLS {
            let row = first / SIDE;
            let column = first % SIDE;
            if column + 1 < SIDE && self.swap_matches(state, first, first + 1) {
                return Some((u8::try_from(first).ok()?, u8::try_from(first + 1).ok()?));
            }
            if row + 1 < SIDE && self.swap_matches(state, first, first + SIDE) {
                return Some((u8::try_from(first).ok()?, u8::try_from(first + SIDE).ok()?));
            }
        }
        None
    }

    pub fn swap_matches(&self, state: &CoopState, first: usize, second: usize) -> bool {
        if first >= CELLS || second >= CELLS || !adjacent(first, second) {
            return false;
        }
        let mut board = state.board;
        board.swap(first, second);
        matched_cells(&board).iter().any(|matched| *matched)
    }

    fn complete_turn(&self, state: &mut CoopState, rng: &mut TurnRng, events: &mut Vec<Value>) {
        state.turn_index = state.turn_index.saturating_add(1);
        self.tick_dot(state, events);
        self.tick_pending(state, events);
        if state.phase.terminal() {
            return;
        }
        let current = state.active_seat;
        let next = (1..=SEATS)
            .map(|offset| (current + offset) % SEATS)
            .find(|index| state.participants[*index].alive);
        match next {
            Some(next) => {
                if next <= current {
                    state.round_index = state.round_index.saturating_add(1);
                    self.boss_turn(state, rng, events);
                }
                // Durations tick at the start of the affected participant's own
                // turn, so a cooldown, buff or shield authored for N turns lasts
                // exactly N of that participant's turns.
                self.begin_turn(&mut state.participants[next]);
                state.active_seat = next;
            }
            None => state.phase = CoopPhase::Lost,
        }
        if state.phase == CoopPhase::Playing
            && u32::from(state.round_index) > u32::from(self.config.party.max_rounds)
        {
            state.phase = CoopPhase::Lost;
            events.push(event("round-limit", None, u64::from(state.round_index)));
        }
        if state.turn_index > MAX_TURNS {
            state.phase = CoopPhase::Lost;
        }
    }

    /// Advance one participant's authored durations exactly once per own turn.
    fn begin_turn(&self, seat: &mut Participant) {
        for cooldown in &mut seat.cooldowns {
            *cooldown = cooldown.saturating_sub(1);
        }
        for status in seat.statuses.iter_mut() {
            if let Some(active) = status.as_mut() {
                active.turns = active.turns.saturating_sub(1);
            }
            if status.map(|active| active.turns == 0).unwrap_or(false) {
                *status = None;
            }
        }
        seat.shield_turns = seat.shield_turns.saturating_sub(1);
        if seat.shield_turns == 0 {
            seat.shield = 0;
        }
    }

    fn tick_dot(&self, state: &mut CoopState, events: &mut Vec<Value>) {
        if state.boss.dot_turns == 0 || state.boss.dot_damage == 0 {
            return;
        }
        let damage = state.boss.dot_damage;
        if let Ok(dealt) = self.damage_boss(state, damage) {
            events.push(event("boss-dot", None, u64::from(dealt)));
        }
        state.boss.dot_turns = state.boss.dot_turns.saturating_sub(1);
        if state.boss.dot_turns == 0 {
            state.boss.dot_damage = 0;
        }
    }

    fn boss_turn(&self, state: &mut CoopState, rng: &mut TurnRng, events: &mut Vec<Value>) {
        if state.pending.is_some() {
            return;
        }
        let model = &self.selected_boss().attack_model;
        let phase_scale = if state.boss.phase == 2 {
            u64::from(self.selected_boss().phase.phase2_attack_pm)
        } else {
            1_000
        };
        let base = u64::from(model.base_damage)
            .saturating_add(
                u64::from(model.per_round_damage).saturating_mul(u64::from(state.round_index)),
            )
            .saturating_mul(phase_scale)
            / 1_000;
        let mut damage = u32::try_from(base).unwrap_or(u32::MAX);
        let crit = rng
            .below(self.config.damage.crit_roll_basis)
            .map(|roll| roll < u32::from(self.selected_boss().crit_rate_bp))
            .unwrap_or(false);
        if crit {
            damage = u32::try_from(
                u64::from(damage) * u64::from(self.selected_boss().crit_damage_bp) / 10_000,
            )
            .unwrap_or(u32::MAX);
            events.push(event("boss-critical", None, 0));
        }
        let targets = if state.boss.phase == 2 {
            self.selected_boss().phase.attack_targets.min(SEATS as u8)
        } else {
            1
        };
        if self.selected_boss().telegraph_turns <= 1 {
            self.apply_boss_attack(state, targets, damage, events);
        } else {
            state.pending = Some(PendingAttack {
                targets,
                remaining: self.selected_boss().telegraph_turns - 1,
                damage,
            });
            events.push(event(
                "boss-telegraph",
                None,
                u64::from(self.selected_boss().telegraph_turns),
            ));
        }
    }

    fn tick_pending(&self, state: &mut CoopState, events: &mut Vec<Value>) {
        let Some(mut pending) = state.pending else {
            return;
        };
        if pending.remaining > 0 {
            pending.remaining -= 1;
        }
        if pending.remaining == 0 {
            state.pending = None;
            self.apply_boss_attack(state, pending.targets, pending.damage, events);
        } else {
            state.pending = Some(pending);
        }
    }

    fn apply_boss_attack(
        &self,
        state: &mut CoopState,
        targets: u8,
        damage: u32,
        events: &mut Vec<Value>,
    ) {
        // Deterministic target selection: lowest HP ratio first, then seat order.
        let mut order: Vec<usize> = (0..SEATS)
            .filter(|seat| state.participants[*seat].alive)
            .collect();
        order.sort_by_key(|index| {
            let seat = &state.participants[*index];
            (
                u64::from(seat.hp) * 1_000_000 / u64::from(seat.max_hp.max(1)),
                *index as u64,
            )
        });
        for target in order.into_iter().take(usize::from(targets)) {
            let seat = &state.participants[target];
            let defense_buff = self.status_permille(seat, StatusKind::DefenseBuff);
            let buffed_defense =
                u32::try_from(u64::from(seat.defense) * u64::from(defense_buff) / 1_000)
                    .unwrap_or(u32::MAX);
            let effective_defense = u32::try_from(
                u64::from(buffed_defense)
                    / u64::from(self.selected_boss().attack_model.defense_divisor),
            )
            .unwrap_or(u32::MAX);
            let vulnerability = self.status_permille(seat, StatusKind::Vulnerability);
            let mut taken = damage
                .saturating_sub(effective_defense)
                .max(self.selected_boss().attack_model.minimum_damage);
            taken = u32::try_from(u64::from(taken) * u64::from(vulnerability) / 1_000)
                .unwrap_or(u32::MAX)
                .max(self.selected_boss().attack_model.minimum_damage);
            let seat = &mut state.participants[target];
            if seat.shield > 0 {
                let absorbed = seat.shield.min(taken);
                seat.shield -= absorbed;
                taken -= absorbed;
            }
            seat.hp = seat.hp.saturating_sub(taken);
            seat.rage = seat
                .rage
                .saturating_add(self.config.resources.rage_per_damage_taken)
                .min(self.config.resources.rage_cap);
            if seat.hp == 0 {
                seat.alive = false;
            }
            events.push(event("boss-attack", Some(target as u8), u64::from(taken)));
        }
        if state.participants.iter().all(|seat| !seat.alive) {
            state.phase = CoopPhase::Lost;
        }
    }

    /// Canonical settlement payload. The economy owner validates and commits it
    /// idempotently; this engine only reports contribution.
    pub fn settlement(&self, state: &CoopState) -> Value {
        list([
            Value::Uint(u64::from(COOP_RULESET_VERSION)),
            Value::Text(COOP_RULESET_ID.into()),
            Value::Bytes(self.digest.to_vec()),
            Value::Bytes(content_hash(self.digest).to_vec()),
            Value::Text(phase_name(state.phase).into()),
            Value::Text(self.selected_boss().id.clone()),
            Value::List(state.participants.iter().map(participant_value).collect()),
            Value::Uint(u64::from(state.round_index)),
            Value::Uint(u64::from(state.turn_index)),
        ])
    }
}

/// Deterministic, bounded gameplay event. Events carry categories and numbers
/// only, never hidden outcomes or client-supplied text.
fn event(kind: &str, seat: Option<u8>, value: u64) -> Value {
    list([
        Value::Text(kind.into()),
        seat.map(|seat| Value::Uint(u64::from(seat)))
            .unwrap_or(Value::Null),
        Value::Uint(value),
    ])
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct MatchOutcome {
    damage: u32,
    critical: bool,
}

fn unreachable_participant() -> Participant {
    Participant {
        account: String::new(),
        pet_id: String::new(),
        owned_pet_instance_id: None,
        level: 1,
        hp: 1,
        max_hp: 1,
        attack: 1,
        defense: 1,
        crit_rate_bp: 0,
        crit_damage_bp: 10_000,
        mana: 0,
        rage: 0,
        shield: 0,
        shield_turns: 0,
        cooldowns: [0; 5],
        statuses: [NO_STATUS; 4],
        contribution_damage: 0,
        contribution_healing: 0,
        contribution_shielding: 0,
        alive: true,
    }
}

/// Native content hash bound into tickets and the match snapshot. It commits to
/// the exact published configuration digest.
pub fn content_hash(config_digest: [u8; 32]) -> [u8; 32] {
    aetheria_game_core::canonical::hash(
        "aetheria.arena8-coop-native.v1",
        &list([
            Value::Bytes(config_digest.to_vec()),
            Value::Text(CONTRACT.into()),
            Value::Uint(COOP_RULESET_VERSION.into()),
            Value::Uint(u64::from(SIDE as u32)),
            Value::Uint(u64::from(SEATS as u32)),
        ]),
    )
    .expect("bounded static adapter contract")
}

pub(crate) fn adjacent(first: usize, second: usize) -> bool {
    if first >= CELLS || second >= CELLS || first == second {
        return false;
    }
    let (r1, c1) = (first / SIDE, first % SIDE);
    let (r2, c2) = (second / SIDE, second % SIDE);
    (r1 == r2 && c1.abs_diff(c2) == 1) || (c1 == c2 && r1.abs_diff(r2) == 1)
}

/// Match detection compares element identity only, so Fire x1, x2 and x3 form a
/// single Fire match. Each cell is counted at most once.
pub(crate) fn matched_cells(board: &[Option<Tile>; CELLS]) -> [bool; CELLS] {
    let mut matched = [false; CELLS];
    let element = |index: usize| board[index].map(|tile| tile.element);
    for row in 0..SIDE {
        for column in 0..SIDE {
            let index = row * SIDE + column;
            let Some(current) = element(index) else {
                continue;
            };
            if column + 2 < SIDE
                && element(index + 1) == Some(current)
                && element(index + 2) == Some(current)
            {
                matched[index] = true;
                matched[index + 1] = true;
                matched[index + 2] = true;
            }
            if row + 2 < SIDE
                && element(index + SIDE) == Some(current)
                && element(index + 2 * SIDE) == Some(current)
            {
                matched[index] = true;
                matched[index + SIDE] = true;
                matched[index + 2 * SIDE] = true;
            }
        }
    }
    matched
}

fn spawn_element(table: [u32; 6], roll: u32) -> Element {
    let mut point = roll;
    for element in crate::arena8::ELEMENTS {
        let weight = table[element.index()];
        if point < weight {
            return element;
        }
        point -= weight;
    }
    // Structural fallback only: a validated bundle always totals more than the
    // roll, so this branch is unreachable and carries no balance meaning.
    Element::Fire
}

fn participant_value(seat: &Participant) -> Value {
    let mut fields = vec![
        Value::Text(seat.account.clone()),
        Value::Text(seat.pet_id.clone()),
        Value::Uint(u64::from(seat.level)),
        Value::Uint(u64::from(seat.hp)),
        Value::Uint(u64::from(seat.max_hp)),
        Value::Uint(u64::from(seat.attack)),
        Value::Uint(u64::from(seat.defense)),
        Value::Uint(u64::from(seat.crit_rate_bp)),
        Value::Uint(u64::from(seat.crit_damage_bp)),
        Value::Uint(u64::from(seat.mana)),
        Value::Uint(u64::from(seat.rage)),
        Value::Uint(u64::from(seat.shield)),
        Value::Uint(u64::from(seat.shield_turns)),
        Value::List(
            seat.cooldowns
                .iter()
                .map(|value| Value::Uint(u64::from(*value)))
                .collect(),
        ),
        Value::List(
            seat.statuses
                .iter()
                .map(|status| match status {
                    Some(active) => list([
                        Value::Text(status_kind_name(active.kind).into()),
                        Value::Int(i64::from(active.value)),
                        Value::Uint(u64::from(active.turns)),
                    ]),
                    None => Value::Null,
                })
                .collect(),
        ),
        Value::Uint(seat.contribution_damage),
        Value::Uint(seat.contribution_healing),
        Value::Uint(seat.contribution_shielding),
        Value::Bool(seat.alive),
    ];
    if let Some(id) = &seat.owned_pet_instance_id {
        fields.push(Value::Text(id.clone()));
    }
    Value::List(fields)
}

fn board_value(board: &[Option<Tile>; CELLS]) -> Value {
    Value::List(
        board
            .iter()
            .map(|cell| match cell {
                Some(tile) => list([
                    Value::Uint(tile.element.index() as u64),
                    Value::Uint(u64::from(tile.multiplier)),
                ]),
                None => Value::Null,
            })
            .collect(),
    )
}

impl Canonical for CoopState {
    fn canonical(&self) -> Value {
        let mut fields = vec![
            Value::Bytes(self.config_digest.to_vec()),
            Value::List(self.participants.iter().map(participant_value).collect()),
            Value::List(vec![
                Value::Uint(u64::from(self.boss.hp)),
                Value::Uint(u64::from(self.boss.max_hp)),
                Value::Uint(u64::from(self.boss.phase)),
                Value::Uint(u64::from(self.boss.shield)),
                Value::Uint(u64::from(self.boss.armor_break_pm)),
                Value::Uint(u64::from(self.boss.dot_damage)),
                Value::Uint(u64::from(self.boss.dot_turns)),
                Value::Bool(self.boss.transformed),
            ]),
            board_value(&self.board),
            Value::Text(phase_name(self.phase).into()),
            Value::Uint(self.active_seat as u64),
            Value::Uint(u64::from(self.turn_index)),
            Value::Uint(u64::from(self.round_index)),
            match self.pending {
                Some(pending) => list([
                    Value::Uint(u64::from(pending.targets)),
                    Value::Uint(u64::from(pending.remaining)),
                    Value::Uint(u64::from(pending.damage)),
                ]),
                None => Value::Null,
            },
        ];
        if let Some(id) = &self.boss_id {
            fields.push(Value::Text(id.clone()));
        }
        Value::List(fields)
    }
}

/// Canonical digest of the full committed match state.
pub fn state_digest(state: &CoopState) -> [u8; 32] {
    aetheria_game_core::canonical::hash("aetheria.arena8-coop.state.v1", &state.canonical())
        .expect("bounded match state")
}

/// Canonical digest of the shared board only.
pub fn board_digest(board: &[Option<Tile>; CELLS]) -> [u8; 32] {
    aetheria_game_core::canonical::hash("aetheria.arena8-coop.board.v1", &board_value(board))
        .expect("bounded board")
}

const fn phase_name(phase: CoopPhase) -> &'static str {
    match phase {
        CoopPhase::Ready => "ready",
        CoopPhase::Playing => "playing",
        CoopPhase::Won => "won",
        CoopPhase::Lost => "lost",
    }
}

const fn status_kind_name(kind: StatusKind) -> &'static str {
    match kind {
        StatusKind::AttackBuff => "attack-buff",
        StatusKind::DefenseBuff => "defense-buff",
        StatusKind::Vulnerability => "vulnerability",
    }
}

impl Reducer for CoopRules {
    type State = CoopState;
    type Action = CoopAction;

    fn ruleset(&self) -> Ruleset {
        CoopRules::ruleset(self)
    }

    fn validate(&self, state: &Self::State) -> Result<(), CoreError> {
        CoopRules::validate(self, state)
    }

    fn reduce(
        &self,
        state: &Self::State,
        action: &Self::Action,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<Self::State>, CoreError> {
        CoopRules::reduce(self, state, *action, rng)
    }
}

#[doc(hidden)]
pub mod test_support {
    //! Narrow hooks for the committed engine conformance tests. They expose
    //! engine algorithms on an already validated bundle and carry no defaults.

    use super::{CELLS, CoopConfig, CoopError, CoopRules, CoopState, Tile, TurnRng, matched_cells};

    impl CoopRules {
        /// Rebuild a ruleset from a caller-supplied authored bundle.
        pub fn for_test(config: CoopConfig, boss_id: String) -> Result<Self, CoopError> {
            Self::from_config(config, boss_id).map_err(CoopError::Config)
        }
    }

    /// Match mask for a board (element identity only).
    pub fn matched_cells_for_test(board: &[Option<Tile>; CELLS]) -> [bool; CELLS] {
        matched_cells(board)
    }

    impl CoopRules {
        /// Resolve one gravity/refill pass.
        pub fn gravity_and_refill_for_test(
            &self,
            state: &mut CoopState,
            rng: &mut TurnRng,
        ) -> Result<(), aetheria_game_core::Error> {
            self.gravity_and_refill(state, rng)
        }

        /// Apply raw damage to the Boss through the authored phase policy.
        pub fn damage_boss_for_test(
            &self,
            state: &mut CoopState,
            damage: u32,
        ) -> Result<u32, aetheria_game_core::Error> {
            self.damage_boss(state, damage)
        }
    }
}

#[doc(hidden)]
pub use test_support::matched_cells_for_test;

#[cfg(test)]
mod tests;
