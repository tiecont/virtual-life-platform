//! Versioned Arena8 Boss rulesets for cooperative and functional solo play.
//!
//! This module runs four-seat and one-seat matches using the same board,
//! deterministic turn order, two Boss phases and typed effects. The original
//! `arena8-pve` solo reducer retains its historical behavior.
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
mod functional;
mod loadout;
mod opening_board;
pub mod simulation;

use crate::arena8::Element;
use crate::arena8::coop::config::{BossAttackModel, BossConfig, RegularEncounterConfig};
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
pub use functional::{FunctionalTiles, TileKind};
pub use loadout::{ArtifactLoadout, EquippedArtifact};

/// Stable identifier of the cooperative ruleset family.
pub const COOP_RULESET_ID: &str = "arena8-coop-pve";
pub const COOP_RULESET_VERSION: u32 = 1;
pub const FUNCTIONAL_RULESET_VERSION: u32 = 2;
pub const FUNCTIONAL_SOLO_RULESET_ID: &str = "arena8-functional-pve";
pub const FUNCTIONAL_SOLO_RULESET_VERSION: u32 = 1;
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TileIdentity {
    Element(Element),
    Kind(TileKind),
}

impl TileIdentity {
    const fn index(self) -> usize {
        match self {
            Self::Element(element) => element.index(),
            Self::Kind(kind) => kind.index(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(from = "TileWire")]
pub struct Tile {
    #[serde(flatten)]
    pub identity: TileIdentity,
    pub multiplier: u8,
}

// Two strict wire variants preserve historical snapshots while rejecting
// missing, unknown, or mixed identities.
#[derive(Deserialize)]
#[serde(untagged)]
enum TileWire {
    Historical(LegacyTileWire),
    Functional(FunctionalTileWire),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyTileWire {
    element: Element,
    multiplier: u8,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FunctionalTileWire {
    kind: TileKind,
    multiplier: u8,
}

impl From<TileWire> for Tile {
    fn from(wire: TileWire) -> Self {
        match wire {
            TileWire::Historical(tile) => Self::legacy(tile.element, tile.multiplier),
            TileWire::Functional(tile) => Self {
                identity: TileIdentity::Kind(tile.kind),
                multiplier: tile.multiplier,
            },
        }
    }
}

impl Tile {
    pub const fn legacy(element: Element, multiplier: u8) -> Self {
        Self {
            identity: TileIdentity::Element(element),
            multiplier,
        }
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_loadout_digest: Option<String>,
    pub level: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    skill_levels: Option<[u8; 5]>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curse: Option<BossCurse>,
    pub dot_damage: u32,
    pub dot_turns: u8,
    pub transformed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct BossCurse {
    pub bonus_pm: u16,
    pub turns: u8,
}

impl Boss {
    pub fn incoming_damage_pm(&self) -> u16 {
        self.armor_break_pm
            .saturating_add(self.curse.map_or(0, |curse| curse.bonus_pm))
            .min(10_000)
    }
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
    #[serde(deserialize_with = "deserialize_party")]
    pub participants: Vec<Participant>,
    pub boss: Boss,
    #[serde(with = "board_cells")]
    pub board: [Option<Tile>; CELLS],
    pub phase: CoopPhase,
    pub active_seat: usize,
    pub turn_index: u16,
    pub round_index: u16,
    pub pending: Option<PendingAttack>,
}

// Historical records remain arrays of four participants on the wire. Only the
// new solo ruleset may use an array of one, checked again against the bound game.
fn deserialize_party<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<Participant>, D::Error> {
    let participants = Vec::<Participant>::deserialize(deserializer)?;
    if !matches!(participants.len(), 1 | SEATS) {
        return Err(serde::de::Error::custom("invalid Arena8 party length"));
    }
    Ok(participants)
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
    board_tiers: u64,
    effectiveness: [[u16; 6]; 6],
    boss_profile: BossConfig,
    regular_profile: Option<RegularEncounterConfig>,
    solo_round_limit: Option<u16>,
}

struct Opponent<'a> {
    element: &'a str,
    max_hp: u32,
    defense: u32,
    crit_rate_bp: u16,
    crit_damage_bp: u16,
    attack_model: &'a BossAttackModel,
    telegraph_turns: u8,
}

struct PreparedAbility<'a> {
    slot: usize,
    skill: &'a config::SkillConfig,
    power_pm: u32,
    remaining_rage: u16,
    utility: Option<UtilityEffect>,
}

enum UtilityEffect {
    RageTransfer { target: usize, amount: u16 },
    ManaRestore { target: usize, amount: u16 },
    Cleanse(Vec<(usize, usize)>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeatInput {
    pub account: String,
    pub pet_id: String,
    /// Distinct owned pet instance identifier. Allows multiple accounts to bring
    /// the same canonical pet species if each owns a separate authorized instance.
    pub owned_pet_instance_id: String,
    pub level: u8,
    /// Scalar used by historical published bundles. Typed allocations carry
    /// their equipped Artifact instances separately.
    pub artifact_power_pm: u16,
}

/// Immutable allocation input resolved by Nest from one owned Pet instance.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SkillLevelBinding {
    pub skill_id: String,
    pub level: u8,
}

fn scale_effect(value: u32, power_pm: u32) -> Result<u32, CoreError> {
    let total = u64::from(value) * u64::from(power_pm) / 1_000;
    u32::try_from(total).map_err(|_| CoreError::Arithmetic)
}

impl Participant {
    pub fn skill_levels(&self) -> [u8; 5] {
        self.skill_levels.unwrap_or([1; 5])
    }

    pub fn upgraded_skill_levels(&self) -> Option<[u8; 5]> {
        self.skill_levels
    }
}

impl CoopState {
    /// Next living seat starting at `from`, wrapping once. Deterministic seat
    /// order is the engine's structural rule; the authored party size is fixed
    /// by configuration validation to the engine's four seats.
    fn next_alive(&self, from: usize) -> Option<usize> {
        let seats = self.participants.len();
        (0..seats)
            .map(|offset| (from + offset) % seats)
            .find(|index| self.participants[*index].alive)
    }
}

impl CoopRules {
    /// Validate and bind an authored bundle. Fails closed on any defect.
    pub fn load(bytes: &[u8], boss_id: String) -> Result<Self, ConfigError> {
        Self::from_config(CoopConfig::parse(bytes)?, boss_id)
    }

    pub fn load_solo(bytes: &[u8], encounter_id: String) -> Result<Self, ConfigError> {
        Self::bind(CoopConfig::parse(bytes)?, &encounter_id, true)
    }

    pub fn from_config(config: CoopConfig, boss_id: String) -> Result<Self, ConfigError> {
        Self::bind(config, &boss_id, false)
    }

    fn bind(config: CoopConfig, encounter_id: &str, solo: bool) -> Result<Self, ConfigError> {
        config.validate()?;
        let selected = config
            .bosses()
            .iter()
            .find(|boss| {
                boss.id == encounter_id
                    || (solo
                        && boss
                            .regular
                            .as_ref()
                            .is_some_and(|regular| regular.id == encounter_id))
            })
            .ok_or(ConfigError::Boss)?;
        let regular_profile = selected
            .regular
            .as_ref()
            .filter(|profile| profile.id == encounter_id)
            .cloned();
        let (boss_profile, solo_round_limit) = match (solo, &regular_profile) {
            (true, Some(profile)) => (selected.clone(), Some(profile.max_rounds)),
            (true, None) => {
                let profile = selected.solo.as_ref().ok_or(ConfigError::Boss)?;
                (selected.solo_profile(profile), Some(profile.max_rounds))
            }
            (false, _) => (selected.clone(), None),
        };
        let (spawn_table, spawn_total) = config.board.spawn_table()?;
        let mut effectiveness = [[1_000u16; 6]; 6];
        for (index, profile) in config.elements.iter().enumerate() {
            let attacker = config::parse_element(&profile.element)?;
            effectiveness[attacker.index()] = profile.effectiveness_table()?;
            debug_assert_eq!(index, attacker.index());
        }
        let board_tiers = config
            .multiplier
            .schedule
            .iter()
            .flat_map(|stage| &stage.tiers)
            .fold(0u64, |mask, tier| mask | (1 << (tier.multiplier - 1)));
        let digest = config.digest();
        Ok(Self {
            config,
            digest,
            spawn_table,
            spawn_total,
            board_tiers,
            effectiveness,
            boss_profile,
            regular_profile,
            solo_round_limit,
        })
    }

    pub fn config(&self) -> &CoopConfig {
        &self.config
    }

    pub fn selected_boss(&self) -> &BossConfig {
        &self.boss_profile
    }

    pub fn encounter_id(&self) -> &str {
        self.regular_profile
            .as_ref()
            .map_or(self.boss_profile.id.as_str(), |regular| &regular.id)
    }

    pub fn regular_encounter(&self) -> bool {
        self.regular_profile.is_some()
    }

    fn opponent(&self) -> Opponent<'_> {
        if let Some(regular) = &self.regular_profile {
            Opponent {
                element: &regular.element,
                max_hp: regular.max_hp,
                defense: regular.defense,
                crit_rate_bp: regular.crit_rate_bp,
                crit_damage_bp: regular.crit_damage_bp,
                attack_model: &regular.attack_model,
                telegraph_turns: regular.telegraph_turns,
            }
        } else {
            let boss = self.selected_boss();
            Opponent {
                element: &boss.element,
                max_hp: boss.max_hp,
                defense: boss.defense,
                crit_rate_bp: boss.crit_rate_bp,
                crit_damage_bp: boss.crit_damage_bp,
                attack_model: &boss.attack_model,
                telegraph_turns: boss.telegraph_turns,
            }
        }
    }

    fn opponent_element(&self) -> Result<Element, ConfigError> {
        config::parse_element(self.opponent().element)
    }

    pub fn digest(&self) -> [u8; 32] {
        self.digest
    }

    pub fn ruleset(&self) -> Ruleset {
        if self.solo_round_limit.is_some() {
            return Ruleset {
                id: FUNCTIONAL_SOLO_RULESET_ID.into(),
                version: FUNCTIONAL_SOLO_RULESET_VERSION,
                content_hash: solo_content_hash(self.digest),
                rng_version: RNG_VERSION,
            };
        }
        Ruleset {
            id: COOP_RULESET_ID.into(),
            version: if self.functional_board() {
                FUNCTIONAL_RULESET_VERSION
            } else {
                COOP_RULESET_VERSION
            },
            content_hash: if self.functional_board() {
                native_content_hash(
                    self.digest,
                    FUNCTIONAL_RULESET_VERSION,
                    "aetheria.arena8-coop-native.v2",
                    "functional-board-v1;independent-tile-effects",
                    SEATS,
                )
            } else {
                content_hash(self.digest)
            },
            rng_version: RNG_VERSION,
        }
    }

    fn seat_count(&self) -> usize {
        if self.solo_round_limit.is_some() {
            1
        } else {
            SEATS
        }
    }

    fn max_rounds(&self) -> u16 {
        self.solo_round_limit
            .unwrap_or(self.config.party.max_rounds)
    }

    pub fn functional_board(&self) -> bool {
        self.config.board.functional_tiles.is_some()
    }

    pub fn effectiveness(&self, attacker: Element, defender: Element) -> u16 {
        self.effectiveness[attacker.index()][defender.index()]
    }

    /// Allocate an unstarted match without equipment, or replay a historical
    /// scalar allocation. The live host requires explicit bindings for a typed
    /// catalog, including an empty binding for an unequipped Pet.
    pub fn allocate(&self, seats: [SeatInput; SEATS]) -> Result<CoopState, CoopError> {
        let loadouts = self.config.has_artifact_catalog().then(|| {
            seats.each_ref().map(|seat| ArtifactLoadout {
                digest: ArtifactLoadout::digest(self.digest, seat, &[]),
                entries: Vec::new(),
            })
        });
        self.allocate_bound(seats, loadouts.as_ref().map(|value| value.as_slice()))
    }

    /// Bind the exact Artifact instances read from the server-owned inventory.
    pub fn allocate_with_loadouts(
        &self,
        seats: [SeatInput; SEATS],
        loadouts: &[ArtifactLoadout; SEATS],
    ) -> Result<CoopState, CoopError> {
        if !self.config.has_artifact_catalog()
            || seats.iter().any(|seat| seat.artifact_power_pm != 0)
        {
            return Err(CoopError::Config(ConfigError::Artifact));
        }
        self.allocate_bound(seats, Some(loadouts))
    }

    /// One authenticated owned Pet enters without artificial party members.
    pub fn allocate_solo(
        &self,
        seat: SeatInput,
        loadout: &ArtifactLoadout,
    ) -> Result<CoopState, CoopError> {
        if self.solo_round_limit.is_none()
            || !self.config.has_artifact_catalog()
            || seat.artifact_power_pm != 0
        {
            return Err(CoopError::InvalidSeat);
        }
        self.allocate_bound([seat], Some(std::slice::from_ref(loadout)))
    }

    fn allocate_bound<const N: usize>(
        &self,
        seats: [SeatInput; N],
        loadouts: Option<&[ArtifactLoadout]>,
    ) -> Result<CoopState, CoopError> {
        if N != self.seat_count() || loadouts.is_some_and(|entries| entries.len() != N) {
            return Err(CoopError::InvalidSeat);
        }
        let mut participants = Vec::with_capacity(N);
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
            participants.push(self.participant(seat, loadouts.map(|loadouts| &loadouts[index]))?);
        }
        let opponent = self.opponent();
        let state = CoopState {
            config_digest: self.digest,
            boss_id: self
                .config
                .versioned_roster()
                .then(|| self.encounter_id().into()),
            participants,
            boss: Boss {
                hp: opponent.max_hp,
                max_hp: opponent.max_hp,
                phase: 1,
                shield: 0,
                armor_break_pm: 1_000,
                curse: None,
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

    /// Resolve the persisted bindings against this match's published cap.
    /// Nest retains levels for skills absent from a newer publication.
    pub fn bind_skill_levels(
        &self,
        state: &mut CoopState,
        bindings: &[Vec<SkillLevelBinding>],
    ) -> Result<(), CoopError> {
        if state.phase != CoopPhase::Ready || state.config_digest != self.digest {
            return Err(CoopError::InvalidPhase);
        }
        if state.participants.len() != self.seat_count() || bindings.len() != self.seat_count() {
            return Err(CoopError::InvalidSeat);
        }
        let mut resolved = vec![[1; 5]; self.seat_count()];
        for ((participant, bindings), levels) in
            state.participants.iter().zip(bindings).zip(&mut resolved)
        {
            let pet = self
                .config
                .pet(&participant.pet_id)
                .ok_or(CoopError::InvalidSeat)?;
            let ids = pet.skill_ids();
            let mut seen = std::collections::BTreeSet::new();
            if bindings.len() > 5 {
                return Err(CoopError::InvalidSeat);
            }
            for binding in bindings {
                if !(2..=config::MAX_SKILL_LEVEL).contains(&binding.level)
                    || !seen.insert(binding.skill_id.as_str())
                {
                    return Err(CoopError::InvalidSeat);
                }
                if !ids.contains(&Some(binding.skill_id.as_str())) {
                    return Err(CoopError::InvalidSeat);
                }
                let skill = self
                    .config
                    .skill(&binding.skill_id)
                    .ok_or(CoopError::InvalidSeat)?;
                for (id, level) in ids.into_iter().zip(levels.iter_mut()) {
                    if id == Some(binding.skill_id.as_str()) {
                        *level = binding.level.min(skill.max_level());
                    }
                }
            }
        }
        for (participant, levels) in state.participants.iter_mut().zip(resolved) {
            participant.skill_levels = (levels != [1; 5]).then_some(levels);
        }
        Ok(())
    }

    fn participant(
        &self,
        seat: SeatInput,
        loadout: Option<&ArtifactLoadout>,
    ) -> Result<Participant, CoopError> {
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
        let (max_hp, attack, defense) = match (&self.config.artifacts, loadout) {
            (Some(catalog), Some(loadout)) => {
                let stats = catalog
                    .apply(self.digest, &seat, loadout)
                    .map_err(CoopError::Config)?;
                let add = |base: u32, added: u16| {
                    base.checked_add(u32::from(added))
                        .ok_or(CoopError::Arithmetic)
                };
                (
                    add(hp, stats.hp)?,
                    add(atk, stats.attack)?,
                    add(def, stats.defense)?,
                )
            }
            (None, None) => {
                let historical_scale = self
                    .config
                    .damage
                    .artifact_scale_pm
                    .ok_or(CoopError::Config(ConfigError::Artifact))?;
                let artifact = u64::from(seat.artifact_power_pm.min(10_000))
                    * u64::from(historical_scale)
                    / 1_000;
                let scale = u32::try_from(1_000 + artifact).map_err(|_| CoopError::Arithmetic)?;
                let apply = |value: u32| {
                    u32::try_from(u64::from(value) * u64::from(scale) / 1_000)
                        .map_err(|_| CoopError::Arithmetic)
                };
                (apply(hp)?, apply(atk)?, apply(def)?)
            }
            _ => return Err(CoopError::Config(ConfigError::Artifact)),
        };
        Ok(Participant {
            account: seat.account,
            pet_id: seat.pet_id,
            owned_pet_instance_id: (self.config.versioned_roster())
                .then_some(seat.owned_pet_instance_id),
            artifact_loadout_digest: loadout.map(|loadout| loadout.digest.clone()),
            level: seat.level,
            skill_levels: None,
            hp: max_hp,
            max_hp,
            attack,
            defense,
            crit_rate_bp: pet.crit_rate_bp,
            crit_damage_bp: if self.regular_encounter() {
                pet.crit_damage_bp
            } else {
                pet.crit_damage_bp
                    .checked_add(profile.boss_crit_damage_bonus_bp.unwrap_or(0))
                    .ok_or(CoopError::Arithmetic)?
            },
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
        let versioned = self.config.versioned_roster();
        let expected_boss = versioned.then_some(self.encounter_id());
        if state.config_digest != self.digest
            || state.boss.curse.is_some_and(|curse| {
                !(1..=32).contains(&curse.turns)
                    || !(1..=9000).contains(&curse.bonus_pm)
                    || !self
                        .config
                        .skills
                        .iter()
                        .any(|skill| skill.effect.kind == config::EffectKind::Curse)
            })
            || state.participants.len() != self.seat_count()
            || state.active_seat >= self.seat_count()
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
                || participant.artifact_loadout_digest.is_some()
                    != self.config.has_artifact_catalog()
                || participant.max_hp == 0
                || participant.hp > participant.max_hp
                || participant.attack == 0
                || !self.config.pet(&participant.pet_id).is_some_and(|pet| {
                    participant
                        .skill_levels()
                        .into_iter()
                        .zip(pet.skill_ids())
                        .all(|(level, id)| {
                            level == 1
                                || id
                                    .and_then(|id| self.config.skill(id))
                                    .is_some_and(|skill| skill.power_at(level).is_some())
                        })
                })
        }) {
            return Err(CoreError::InvalidState);
        }
        if state.boss.max_hp == 0 || state.boss.hp > state.boss.max_hp {
            return Err(CoreError::InvalidState);
        }
        if state.board.iter().flatten().any(|tile| {
            !(1..=CELLS as u8).contains(&tile.multiplier)
                || matches!(tile.identity, TileIdentity::Kind(_)) != self.functional_board()
                || (self.functional_board()
                    && (self.board_tiers & (1 << (tile.multiplier - 1))) == 0)
        }) {
            return Err(CoreError::InvalidState);
        }
        if self.functional_board()
            && (state.boss.max_hp
                != match state.boss.phase {
                    1 if !state.boss.transformed => self.opponent().max_hp,
                    2 if state.boss.transformed && !self.regular_encounter() => self
                        .selected_boss()
                        .phase2_max_hp()
                        .map_err(|_| CoreError::InvalidState)?,
                    _ => return Err(CoreError::InvalidState),
                }
                || state.pending.is_some_and(|attack| {
                    attack.targets == 0
                        || usize::from(attack.targets) > self.seat_count()
                        || attack.remaining == 0
                        || attack.remaining >= self.opponent().telegraph_turns
                })
                || (state.phase == CoopPhase::Won && state.boss.hp != 0)
                || (state.phase == CoopPhase::Ready && state.board.iter().any(Option::is_some))
                || (state.phase == CoopPhase::Playing
                    && (!state.participants[state.active_seat].alive
                        || state.boss.hp == 0
                        || state.board.iter().any(Option::is_none)
                        || matched_cells(&state.board).into_iter().any(|marked| marked)))
                || state.participants.iter().any(|seat| {
                    seat.alive != (seat.hp > 0)
                        || seat.mana > self.config.resources.mana_cap
                        || seat.rage > self.config.resources.rage_cap
                }))
        {
            return Err(CoreError::InvalidState);
        }
        if u32::from(state.round_index) > u32::from(self.max_rounds()) && !state.phase.terminal() {
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
        if self.functional_board()
            || state.config_digest != self.digest
            || state.participants.len() != self.seat_count()
        {
            self.validate(state)?;
        }
        let mut next = state.clone();
        let mut events = Vec::new();
        match action {
            CoopAction::Start => {
                if next.phase != CoopPhase::Ready {
                    return Err(CoreError::InvalidAction);
                }
                // Historical bundles keep their original reducer and RNG stream.
                match self.config.board.initial_board_policy {
                    None => self.fill_board(&mut next, rng)?,
                    Some(config::InitialBoardPolicy::Constructive) => {
                        next.board = self.construct_board(rng)?;
                    }
                }
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
                if !self.swap_has_match(&board, first, second) {
                    // Rejected before any mutation and before any entropy use.
                    return Err(CoreError::InvalidAction);
                }
                next.board = board;
                self.resolve_cascades(&mut next, rng, &mut events)?;
                self.complete_turn(&mut next, rng, &mut events);
            }
            ability => {
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

    /// Checks turn ownership, cast costs, cooldown and required utility targets.
    pub fn ability_ready(&self, state: &CoopState, seat: usize, action: CoopAction) -> bool {
        seat == state.active_seat && self.prepare_ability(state, action).is_ok()
    }

    fn prepare_ability(
        &self,
        state: &CoopState,
        action: CoopAction,
    ) -> Result<PreparedAbility<'_>, CoreError> {
        self.require_turn(state)?;
        let actor = state.active_seat;
        let seat = &state.participants[actor];
        let pet = self
            .config
            .pet(&seat.pet_id)
            .ok_or(CoreError::InvalidAction)?;
        // Pet Level never gates a signature, ultimate or species ability. Level
        // only scales stats.
        let slot = match action {
            CoopAction::Guard => 0,
            CoopAction::Skill => 1,
            CoopAction::Signature => 2,
            CoopAction::Ultimate => 3,
            CoopAction::FireZone => 4,
            CoopAction::Start | CoopAction::Swap { .. } => return Err(CoreError::InvalidAction),
        };
        let skill_id = pet.skill_ids()[slot].ok_or(CoreError::InvalidAction)?;
        let skill = self.config.skill(skill_id).ok_or(CoreError::InvalidState)?;
        let level = seat.skill_levels()[slot];
        let power_pm = skill.power_at(level).ok_or(CoreError::InvalidState)?;
        if seat.cooldowns[slot] > 0 || seat.mana < skill.mana_cost || seat.rage < skill.rage_cost {
            return Err(CoreError::InvalidAction);
        }
        let mut remaining_rage = seat.rage - skill.rage_cost;
        if matches!(action, CoopAction::Guard) {
            remaining_rage = remaining_rage
                .saturating_add(self.config.resources.rage_per_guard)
                .min(self.config.resources.rage_cap);
        }
        let utility = self.prepare_utility(state, actor, skill, power_pm, remaining_rage)?;
        Ok(PreparedAbility {
            slot,
            skill,
            power_pm,
            remaining_rage,
            utility,
        })
    }

    fn prepare_utility(
        &self,
        state: &CoopState,
        actor: usize,
        skill: &config::SkillConfig,
        power_pm: u32,
        remaining_rage: u16,
    ) -> Result<Option<UtilityEffect>, CoreError> {
        let effect = &skill.effect;
        Ok(match effect.kind {
            config::EffectKind::RageTransfer | config::EffectKind::ManaRestore => {
                // Validated resource effects always target a different living seat.
                let target = self
                    .targets(state, actor, effect.target)
                    .into_iter()
                    .next()
                    .ok_or(CoreError::InvalidAction)?;
                let amount = u16::try_from(scale_effect(effect.value, power_pm)?)
                    .map_err(|_| CoreError::Arithmetic)?;
                let ally = &state.participants[target];
                let resources = &self.config.resources;
                if effect.kind == config::EffectKind::RageTransfer {
                    let amount = amount
                        .min(resources.rage_cap.saturating_sub(ally.rage))
                        .min(remaining_rage);
                    if amount == 0 {
                        return Err(CoreError::InvalidAction);
                    }
                    Some(UtilityEffect::RageTransfer { target, amount })
                } else {
                    let amount = amount.min(resources.mana_cap.saturating_sub(ally.mana));
                    if amount == 0 {
                        return Err(CoreError::InvalidAction);
                    }
                    Some(UtilityEffect::ManaRestore { target, amount })
                }
            }
            config::EffectKind::Curse => {
                let amount = scale_effect(effect.value, power_pm)?;
                if state.boss.curse.is_some_and(|active| {
                    u32::from(active.bonus_pm) > amount
                        || (u32::from(active.bonus_pm) == amount
                            && active.turns >= effect.duration_turns)
                }) {
                    return Err(CoreError::InvalidAction);
                }
                None
            }
            config::EffectKind::Cleanse => {
                let statuses: Vec<_> = self
                    .targets(state, actor, effect.target)
                    .into_iter()
                    .filter_map(|target| {
                        let slot =
                            state.participants[target]
                                .statuses
                                .iter()
                                .position(|status| {
                                    status.is_some_and(|active| {
                                        active.kind == StatusKind::Vulnerability
                                    })
                                })?;
                        Some((target, slot))
                    })
                    .collect();
                if statuses.is_empty() {
                    return Err(CoreError::InvalidAction);
                }
                Some(UtilityEffect::Cleanse(statuses))
            }
            _ => None,
        })
    }

    fn act_ability(
        &self,
        state: &mut CoopState,
        action: CoopAction,
        rng: &mut TurnRng,
        events: &mut Vec<Value>,
    ) -> Result<(), CoreError> {
        let PreparedAbility {
            slot,
            skill,
            power_pm,
            remaining_rage,
            utility,
        } = self.prepare_ability(state, action)?;
        let seat_index = state.active_seat;
        let seat = &mut state.participants[seat_index];
        seat.mana -= skill.mana_cost;
        seat.rage = remaining_rage;
        seat.cooldowns[slot] = skill.cooldown_turns;
        if let Some(utility) = utility {
            match utility {
                UtilityEffect::RageTransfer { target, amount } => {
                    seat.rage -= amount;
                    state.participants[target].rage += amount;
                    events.push(event(
                        "rage-transfer",
                        Some(target as u8),
                        u64::from(amount),
                    ));
                }
                UtilityEffect::ManaRestore { target, amount } => {
                    state.participants[target].mana += amount;
                    events.push(event(
                        "mana-restored",
                        Some(target as u8),
                        u64::from(amount),
                    ));
                }
                UtilityEffect::Cleanse(statuses) => {
                    for (target, slot) in statuses {
                        state.participants[target].statuses[slot] = None;
                        events.push(event(
                            "cleanse",
                            Some(target as u8),
                            u64::from(skill.effect.value),
                        ));
                    }
                }
            }
            return Ok(());
        }
        let actor_attack = seat.attack;
        let crit_rate = seat.crit_rate_bp;
        let crit_damage = seat.crit_damage_bp;
        let crit = skill.crit_eligible
            && rng.below(self.config.damage.crit_roll_basis)? < u32::from(crit_rate);
        self.apply_effect(
            state,
            seat_index,
            skill,
            power_pm,
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
        power_pm: u32,
        attack: u32,
        crit: bool,
        crit_damage_bp: u16,
        events: &mut Vec<Value>,
    ) -> Result<(), CoreError> {
        let effect = &skill.effect;
        let scaled = |value| scale_effect(value, power_pm);
        match effect.kind {
            config::EffectKind::Damage
            | config::EffectKind::DamageOverTime
            | config::EffectKind::ChainDamage => {
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
                    .opponent_element()
                    .map_err(|_| CoreError::InvalidState)?;
                damage = u32::try_from(
                    u64::from(damage) * u64::from(self.effectiveness(attacker, boss_element))
                        / 1_000,
                )
                .map_err(|_| CoreError::Arithmetic)?;
                match effect.kind {
                    config::EffectKind::DamageOverTime => {
                        state.boss.dot_damage = state.boss.dot_damage.saturating_add(damage);
                        state.boss.dot_turns = effect.duration_turns.max(1);
                    }
                    _ => {
                        // A chain uses one critical roll for the cast. Resolve each
                        // packet separately so shields, phases and victory apply.
                        for _ in 0..effect.hits.unwrap_or(1) {
                            let dealt = self.damage_boss(state, damage)?;
                            state.participants[actor].contribution_damage = state.participants
                                [actor]
                                .contribution_damage
                                .saturating_add(u64::from(dealt));
                            events.push(event("boss-damage", Some(actor as u8), u64::from(dealt)));
                            if state.phase.terminal() {
                                break;
                            }
                        }
                    }
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
            config::EffectKind::Curse => {
                let bonus_pm =
                    u16::try_from(scaled(effect.value)?).map_err(|_| CoreError::Arithmetic)?;
                let curse = BossCurse {
                    bonus_pm,
                    turns: effect.duration_turns + 1,
                };
                state.boss.curse = Some(curse);
                events.push(event("curse", Some(actor as u8), u64::from(bonus_pm)));
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
            config::EffectKind::RageTransfer
            | config::EffectKind::ManaRestore
            | config::EffectKind::Cleanse => return Err(CoreError::InvalidState),
        }
        Ok(())
    }

    fn targets(&self, state: &CoopState, actor: usize, target: config::EffectTarget) -> Vec<usize> {
        match target {
            config::EffectTarget::Boss => Vec::new(),
            config::EffectTarget::SelfActor => vec![actor],
            config::EffectTarget::Allies => (0..state.participants.len())
                .filter(|seat| state.participants[*seat].alive)
                .collect(),
            config::EffectTarget::LowestAlly => {
                let lowest = (0..state.participants.len())
                    .filter(|seat| state.participants[*seat].alive)
                    .min_by_key(|seat| {
                        let seat = &state.participants[*seat];
                        u64::from(seat.hp) * 1_000_000 / u64::from(seat.max_hp.max(1))
                    });
                lowest.into_iter().collect()
            }
            config::EffectTarget::LowestRageAlly | config::EffectTarget::LowestManaAlly => (0
                ..state.participants.len())
                .filter(|seat| *seat != actor && state.participants[*seat].alive)
                .min_by_key(|index| {
                    let seat = &state.participants[*index];
                    if target == config::EffectTarget::LowestRageAlly {
                        seat.rage
                    } else {
                        seat.mana
                    }
                })
                .into_iter()
                .collect(),
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
                .checked_mul(u64::from(state.boss.incoming_damage_pm()))
                .ok_or(CoreError::Arithmetic)?
                / 1_000,
        )
        .map_err(|_| CoreError::Arithmetic)?;
        if state.boss.shield > 0 {
            let absorbed = state.boss.shield.min(remaining);
            state.boss.shield -= absorbed;
            remaining -= absorbed;
        }
        if state.boss.phase == 1 && !self.regular_encounter() {
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
            let outcome = if self.functional_board() {
                self.score_functional_match(state, seat, &matched, rng, events)?
            } else {
                self.score_match(state, seat, &matched, rng)?
            };
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
                let remaining = if self.functional_board() {
                    matched_cells(&state.board)
                } else {
                    matched
                };
                if self.functional_board() && !remaining.iter().any(|marked| *marked) {
                    return Ok(());
                }
                events.push(event("cascade-cap", Some(seat as u8), u64::from(max)));
                for (index, is_matched) in remaining.iter().enumerate() {
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
        let element = self.actor_element(state, seat_index)?;
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
            let own = tile.identity == TileIdentity::Element(element);
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
        let outcome = self.resolve_normal_attack(state, seat_index, contribution, rng)?;
        let seat = &mut state.participants[seat_index];
        seat.mana = seat
            .mana
            .saturating_add(u16::try_from(mana).unwrap_or(u16::MAX))
            .min(self.config.resources.mana_cap);
        seat.rage = seat
            .rage
            .saturating_add(u16::try_from(rage).unwrap_or(u16::MAX))
            .min(self.config.resources.rage_cap);
        Ok(outcome)
    }

    fn actor_element(&self, state: &CoopState, seat_index: usize) -> Result<Element, CoreError> {
        self.config
            .pet(&state.participants[seat_index].pet_id)
            .and_then(|pet| pet.element().ok())
            .ok_or(CoreError::InvalidState)
    }

    fn resolve_normal_attack(
        &self,
        state: &mut CoopState,
        seat_index: usize,
        contribution: u64,
        rng: &mut TurnRng,
    ) -> Result<MatchOutcome, CoreError> {
        let element = self.actor_element(state, seat_index)?;
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
            u64::from(self.opponent().defense) / u64::from(self.config.damage.defense_divisor),
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
            .opponent_element()
            .map_err(|_| CoreError::InvalidState)?;
        damage = u32::try_from(
            u64::from(damage) * u64::from(self.effectiveness(element, boss_element)) / 1_000,
        )
        .map_err(|_| CoreError::Arithmetic)?;
        let dealt = self.damage_boss(state, damage)?;
        let seat = &mut state.participants[seat_index];
        seat.contribution_damage = seat.contribution_damage.saturating_add(u64::from(dealt));
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
        let still_matching =
            self.functional_board() && matched_cells(&state.board).iter().any(|matched| *matched);
        if !still_matching && self.legal_swap(state).is_none() {
            self.dead_board(state, rng)?;
        }
        Ok(())
    }

    fn dead_board(&self, state: &mut CoopState, rng: &mut TurnRng) -> Result<(), CoreError> {
        match self.config.board.dead_board_policy {
            config::DeadBoardPolicy::Regenerate if self.functional_board() => {
                state.board = self.construct_board(rng)?;
                Ok(())
            }
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
                if self.functional_board() {
                    state.board = self.construct_board(rng)?;
                    Ok(())
                } else {
                    Err(CoreError::InvalidState)
                }
            }
        }
    }

    fn construct_board(&self, rng: &mut TurnRng) -> Result<[Option<Tile>; CELLS], CoreError> {
        opening_board::construct(self.identities(), self.spawn_table, self.spawn_total, rng)
    }

    fn identities(&self) -> [TileIdentity; 6] {
        if self.functional_board() {
            TileKind::ALL.map(TileIdentity::Kind)
        } else {
            crate::arena8::ELEMENTS.map(TileIdentity::Element)
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
                    identity: spawn_identity(self.identities(), self.spawn_table, roll),
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
        let identity = spawn_identity(self.identities(), self.spawn_table, roll);
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
            identity,
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
        self.swap_has_match(&board, first, second)
    }

    fn swap_has_match(&self, board: &[Option<Tile>; CELLS], first: usize, second: usize) -> bool {
        let matches = matched_cells(board);
        if self.functional_board() {
            let identity = |index: usize| board[index].map(|tile| tile.identity);
            identity(first) != identity(second) && (matches[first] || matches[second])
        } else {
            matches.into_iter().any(|matched| matched)
        }
    }

    fn complete_turn(&self, state: &mut CoopState, rng: &mut TurnRng, events: &mut Vec<Value>) {
        state.turn_index = state.turn_index.saturating_add(1);
        let boss_defeat_first = self.config.terminal_outcome_policy
            == Some(config::TerminalOutcomePolicy::BossDefeatFirst);
        if !boss_defeat_first || !state.phase.terminal() {
            self.tick_dot(state, events);
        }
        if boss_defeat_first && state.phase.terminal() {
            // A defeat by the player's action or by the final DoT tick
            // cancels the Boss's queued attack before it can deal damage.
            state.pending = None;
            return;
        }
        if let Some(active) = state.boss.curse.as_mut() {
            active.turns -= 1;
            if active.turns == 0 {
                state.boss.curse = None;
            }
        }
        self.tick_pending(state, events);
        if state.phase.terminal() {
            return;
        }
        let current = state.active_seat;
        let seats = state.participants.len();
        let next = (1..=seats)
            .map(|offset| (current + offset) % seats)
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
                // An immediate round-opening attack can defeat the seat selected
                // before the Boss acted. Start the turn of the next survivor.
                let next = state.next_alive(next).unwrap_or(next);
                self.begin_turn(&mut state.participants[next]);
                state.active_seat = next;
            }
            None => state.phase = CoopPhase::Lost,
        }
        if state.phase == CoopPhase::Playing
            && u32::from(state.round_index) > u32::from(self.max_rounds())
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
        let opponent = self.opponent();
        let model = opponent.attack_model;
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
            .map(|roll| roll < u32::from(opponent.crit_rate_bp))
            .unwrap_or(false);
        if crit {
            damage = u32::try_from(u64::from(damage) * u64::from(opponent.crit_damage_bp) / 10_000)
                .unwrap_or(u32::MAX);
            events.push(event("boss-critical", None, 0));
        }
        let targets = if state.boss.phase == 2 {
            self.selected_boss()
                .phase
                .attack_targets
                .min(self.seat_count() as u8)
        } else {
            1
        };
        if opponent.telegraph_turns <= 1 {
            self.apply_boss_attack(state, targets, damage, events);
        } else {
            state.pending = Some(PendingAttack {
                targets,
                remaining: opponent.telegraph_turns - 1,
                damage,
            });
            events.push(event(
                "boss-telegraph",
                None,
                u64::from(opponent.telegraph_turns),
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
        let model = self.opponent().attack_model;
        // Resolve from the committed party at impact. Historical bundles rank by HP ratio.
        let mut order: Vec<usize> = (0..state.participants.len())
            .filter(|seat| state.participants[*seat].alive)
            .collect();
        order.sort_by_key(|index| {
            let seat = &state.participants[*index];
            let priority = match model.target_priority {
                Some(config::BossTargetPriority::HighestMana) => u64::from(u16::MAX - seat.mana),
                None => u64::from(seat.hp) * 1_000_000 / u64::from(seat.max_hp.max(1)),
            };
            (priority, *index)
        });
        for target in order.into_iter().take(usize::from(targets)) {
            let seat = &state.participants[target];
            let defense_buff = self.status_permille(seat, StatusKind::DefenseBuff);
            let buffed_defense =
                u32::try_from(u64::from(seat.defense) * u64::from(defense_buff) / 1_000)
                    .unwrap_or(u32::MAX);
            let effective_defense =
                u32::try_from(u64::from(buffed_defense) / u64::from(model.defense_divisor))
                    .unwrap_or(u32::MAX);
            let vulnerability = self.status_permille(seat, StatusKind::Vulnerability);
            let mut taken = damage
                .saturating_sub(effective_defense)
                .max(model.minimum_damage);
            taken = u32::try_from(u64::from(taken) * u64::from(vulnerability) / 1_000)
                .unwrap_or(u32::MAX)
                .max(model.minimum_damage);
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
            if seat.alive
                && let Some(vulnerability) = model.vulnerability
            {
                // Reapplication refreshes the same status. A successful
                // shield still leaves the surviving target marked.
                let index = seat
                    .statuses
                    .iter()
                    .position(|status| status.is_some_and(|s| s.kind == StatusKind::Vulnerability))
                    .or_else(|| seat.statuses.iter().position(Option::is_none));
                if let Some(index) = index {
                    seat.statuses[index] = Some(Status {
                        kind: StatusKind::Vulnerability,
                        value: i32::from(vulnerability.value_pm),
                        turns: vulnerability.duration_turns,
                    });
                    events.push(event(
                        "vulnerability",
                        Some(target as u8),
                        u64::from(vulnerability.value_pm),
                    ));
                }
            }
        }
        if state.participants.iter().all(|seat| !seat.alive) {
            state.phase = CoopPhase::Lost;
        }
    }

    /// Canonical settlement payload. The economy owner validates and commits it
    /// idempotently; this engine only reports contribution.
    pub fn settlement(&self, state: &CoopState) -> Value {
        let ruleset = self.ruleset();
        list([
            Value::Uint(u64::from(ruleset.version)),
            Value::Text(ruleset.id),
            Value::Bytes(self.digest.to_vec()),
            Value::Bytes(ruleset.content_hash.to_vec()),
            Value::Text(phase_name(state.phase).into()),
            Value::Text(self.encounter_id().into()),
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

/// Native content hash bound into tickets and the match snapshot. It commits to
/// the exact published configuration digest.
pub fn content_hash(config_digest: [u8; 32]) -> [u8; 32] {
    native_content_hash(
        config_digest,
        COOP_RULESET_VERSION,
        "aetheria.arena8-coop-native.v1",
        CONTRACT,
        SEATS,
    )
}

pub fn solo_content_hash(config_digest: [u8; 32]) -> [u8; 32] {
    native_content_hash(
        config_digest,
        FUNCTIONAL_SOLO_RULESET_VERSION,
        "aetheria.arena8-functional-native.v1",
        "solo;functional-board-v1;independent-tile-effects",
        1,
    )
}

fn native_content_hash(
    config_digest: [u8; 32],
    version: u32,
    domain: &str,
    contract: &str,
    seats: usize,
) -> [u8; 32] {
    aetheria_game_core::canonical::hash(
        domain,
        &list([
            Value::Bytes(config_digest.to_vec()),
            Value::Text(contract.into()),
            Value::Uint(version.into()),
            Value::Uint(u64::from(SIDE as u32)),
            Value::Uint(seats as u64),
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

/// Match detection uses tile identity. Multipliers do not affect run membership.
/// Each cell is counted at most once.
pub(crate) fn matched_cells(board: &[Option<Tile>; CELLS]) -> [bool; CELLS] {
    let mut matched = [false; CELLS];
    let identity = |index: usize| board[index].map(|tile| tile.identity);
    for row in 0..SIDE {
        for column in 0..SIDE {
            let index = row * SIDE + column;
            let Some(current) = identity(index) else {
                continue;
            };
            if column + 2 < SIDE
                && identity(index + 1) == Some(current)
                && identity(index + 2) == Some(current)
            {
                matched[index] = true;
                matched[index + 1] = true;
                matched[index + 2] = true;
            }
            if row + 2 < SIDE
                && identity(index + SIDE) == Some(current)
                && identity(index + 2 * SIDE) == Some(current)
            {
                matched[index] = true;
                matched[index + SIDE] = true;
                matched[index + 2 * SIDE] = true;
            }
        }
    }
    matched
}

fn spawn_identity(identities: [TileIdentity; 6], table: [u32; 6], roll: u32) -> TileIdentity {
    let mut point = roll;
    for (identity, weight) in identities.into_iter().zip(table) {
        if point < weight {
            return identity;
        }
        point -= weight;
    }
    unreachable!("validated spawn table totals exceed every roll")
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
    if let Some(digest) = &seat.artifact_loadout_digest {
        fields.push(Value::Text(digest.clone()));
    }
    if let Some(levels) = seat.skill_levels {
        fields.push(list(
            levels
                .into_iter()
                .map(|level| Value::Uint(u64::from(level))),
        ));
    }
    Value::List(fields)
}

fn board_value(board: &[Option<Tile>; CELLS]) -> Value {
    Value::List(
        board
            .iter()
            .map(|cell| match cell {
                Some(tile) => list([
                    match tile.identity {
                        TileIdentity::Element(element) => Value::Uint(element.index() as u64),
                        TileIdentity::Kind(kind) => Value::Text(kind.name().into()),
                    },
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
        if let Some(curse) = self.boss.curse {
            fields.push(list([
                Value::Text("curse".into()),
                Value::Uint(u64::from(curse.bonus_pm)),
                Value::Uint(u64::from(curse.turns)),
            ]));
        }
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
