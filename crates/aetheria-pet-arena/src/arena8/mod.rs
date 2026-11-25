//! Versioned 8x8 tactical Pet Arena ruleset (Wave A).
//!
//! This module is a new, independently versioned ruleset. It does not mutate the
//! frozen 6x6 V1 reducer, the frozen V3 taxonomy, the Wave 1 action replay or
//! `content::BOARD_SIDE`. It has its own board, element matrix, resources,
//! content digest, typed event stream and pure command engine.
//!
//! Trust boundary: the host supplies a fresh private `SecretSeed` and a command
//! envelope. Commands contain only an intent (a board swap or an ability). They
//! never contain a seed, damage, target, outcome or reward. Dice, cascade refills,
//! enemy telegraph targets and every damage number are resolved here.

/// Bounded, versioned content binding between canonical roster identities and
/// combat profiles, Artifact combat semantics and immutable match snapshots.
pub mod binding;
mod board;
mod bound;
mod combat;
mod engine;
mod events;
mod model;
#[cfg(test)]
mod tests;

use aetheria_game_core::{Error as CoreError, TurnRng, Value, canonical, canonical::list};
use serde::{Deserialize, Serialize};

pub use board::{Board, Swap};
pub use bound::{Arena8Bound, BoundState, action_allowed};
pub use combat::Arena8;
pub use engine::{Arena8Engine, Arena8Error, Replay, ReplayEntry};
pub use events::CombatEvent;
pub use model::{
    Ability, Action, Axis, BOSS_SCHEDULE, ENCOUNTERS, Encounter, EncounterCombat, EnemyIntent,
    EnemyIntentKind, ICARUS, PETS, Pet, PetCombat, Phase, REGULAR_SCHEDULE, RecoveryReason,
    SignatureKind, State,
};

/// Stable identifier of the frozen six-Pet v1 ruleset. The V1 id and V3 ids
/// remain untouched. Data-bound matches use
/// `binding::BOUND_RULESET_ID` instead.
pub const RULESET_ID: &str = "aetheria-pet-arena-arena8";
pub const RULESET_VERSION: u32 = 1;

pub const SIDE: usize = 8;
pub const CELLS: usize = SIDE * SIDE;
pub const ELEMENT_COUNT: usize = 6;

/// Hard execution bounds. A match can never exceed these even if a host keeps
/// submitting commands.
pub const MAX_TURNS: u8 = 24;
pub const MAX_CASCADES: u8 = 16;
pub const MAX_BOARD_ATTEMPTS: u8 = 64;
pub const MAX_SUBMISSIONS: u16 = 128;
/// One start command plus one command for every legal turn.
pub const MAX_ACCEPTED_COMMANDS: u16 = MAX_TURNS as u16 + 1;

pub const MANA_CAP: u16 = 300;
pub const RAGE_CAP: u16 = 200;
pub const COOLDOWN_TURNS: u8 = 3;

pub const SKILL_MANA: u16 = 100;
pub const SIGNATURE_MANA: u16 = 200;
pub const SIGNATURE_RAGE: u16 = 150;
pub const ULTIMATE_MANA: u16 = 300;
pub const ULTIMATE_RAGE: u16 = 200;

pub const MANA_PER_TILE: u16 = 10;
pub const MANA_OWN_BONUS: u16 = 5;
pub const RAGE_PER_TILE: u16 = 6;
pub const RAGE_PER_GUARD: u16 = 20;
pub const RAGE_PER_HIT: u16 = 10;

pub const SKILL_POWER: u32 = 1_800;
pub const SIGNATURE_POWER: u32 = 2_300;
pub const FIRE_ZONE_POWER: u32 = 2_100;
pub const FIRE_ZONE_TICK_POWER: u32 = 350;
pub const ULTIMATE_POWER: u32 = 2_800;
pub const FIRE_ZONE_TICKS: u8 = 2;

pub const ASSAULT_POWER: u32 = 1_000;
pub const HEAVY_POWER: u32 = 1_500;
pub const GUARD_ATTACK_POWER: u32 = 500;
pub const ENRAGE_BONUS: u32 = 250;
pub const ENEMY_SHIELD_CAP: u32 = 240;
pub const BOARD_DAMAGE_DIVISOR: u32 = 4;

/// Authoring note shared by every client: the event stream is the presentation
/// cue stream. It is typed, serializable and derived from committed state only.
pub const RULES_TEXT: &str = "arena8;board8x8;64-cells;6-elements;match3-runs;orthogonal-swap;swap-must-match;cascade-gravity-refill;16-cascade-cap;dead-board-regenerate;own-tile-weight2;mana-cap300;rage-cap200;skill100-mana;signature200-mana150-rage;ultimate300-mana200-rage;cooldown3;guard-half-rage20;icarus-fire-zone-two-ticks;telegraph-one-turn;lane-cleared-mitigation;regular-and-boss-ai;turn24-loss;death-before-win;no-rewards;no-client-rng";

/// Six existing Wave 1 elements. The order is part of the content binding.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[repr(u8)]
pub enum Element {
    Fire = 0,
    Water = 1,
    Electric = 2,
    Ghost = 3,
    Ground = 4,
    Light = 5,
}

pub const ELEMENTS: [Element; ELEMENT_COUNT] = [
    Element::Fire,
    Element::Water,
    Element::Electric,
    Element::Ghost,
    Element::Ground,
    Element::Light,
];

/// Attacker rows in `ELEMENTS` order, permille. Values are the released
/// six-element candidate taxonomy: immunity, resistance, neutral, advantage.
/// This is a private copy for the new versioned ruleset, not a mutation of V1/V3.
pub const EFFECTIVENESS: [[u16; ELEMENT_COUNT]; ELEMENT_COUNT] = [
    [800, 800, 1000, 1000, 1000, 1000],
    [1250, 800, 1000, 1000, 1250, 1000],
    [1000, 1250, 800, 1000, 0, 1000],
    [1000, 1000, 1000, 1250, 1000, 800],
    [1250, 1000, 1250, 1000, 1000, 1000],
    [1000, 1000, 1000, 1250, 1000, 800],
];

impl Element {
    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn multiplier_against(self, defender: Self) -> u16 {
        EFFECTIVENESS[self.index()][defender.index()]
    }
}

/// Private entropy source. The production implementation is the host's
/// `TurnRng`; unit tests use a deterministic splitmix64 source. It is not part
/// of the public API, so a client can never inject a random stream.
pub(crate) trait Random {
    fn below(&mut self, upper: u32) -> Result<u32, CoreError>;
}

impl Random for TurnRng {
    fn below(&mut self, upper: u32) -> Result<u32, CoreError> {
        TurnRng::below(self, upper)
    }
}

/// Authored content validation. Runs before hashing and on every state restore.
pub fn validate_content() -> Result<(), CoreError> {
    if PETS.len() != ELEMENT_COUNT || ENCOUNTERS.len() != 2 * ELEMENT_COUNT {
        return Err(CoreError::InvalidState);
    }
    for (index, pet) in PETS.iter().enumerate() {
        if pet.id.is_empty()
            || PETS[..index].iter().any(|prior| prior.id == pet.id)
            || pet.health == 0
            || pet.attack == 0
            || pet.defense == 0
            || PETS[..index]
                .iter()
                .any(|prior| prior.element == pet.element)
            || (pet.signature == SignatureKind::FireZone) != (index == ICARUS)
        {
            return Err(CoreError::InvalidState);
        }
    }
    for (index, encounter) in ENCOUNTERS.iter().enumerate() {
        if encounter.id.is_empty()
            || ENCOUNTERS[..index]
                .iter()
                .any(|prior| prior.id == encounter.id)
            || encounter.health == 0
            || encounter.attack == 0
            || encounter.defense == 0
            || encounter.boss != (index % 2 == 1)
            || ENCOUNTERS[index ^ 1].element != encounter.element
        {
            return Err(CoreError::InvalidState);
        }
    }
    for row in EFFECTIVENESS {
        for value in row {
            if !matches!(value, 0 | 800 | 1000 | 1250) {
                return Err(CoreError::InvalidState);
            }
        }
    }
    let fallback = Board::fallback();
    if fallback.matches().into_iter().any(|matched| matched) || fallback.legal_move().is_none() {
        return Err(CoreError::InvalidState);
    }
    Ok(())
}

/// Canonical rules content. Every input that can change combat, telegraph or
/// execution limits is included. Pinned by `rules_hash`.
pub fn canonical_manifest() -> Value {
    let matrices = list(ELEMENTS.iter().map(|attacker| {
        list(
            ELEMENTS
                .iter()
                .map(|defender| Value::Uint(attacker.multiplier_against(*defender).into())),
        )
    }));
    let pets = list(PETS.iter().map(|pet| {
        list([
            Value::Text(pet.id.into()),
            Value::Uint(pet.element as u64),
            Value::Uint(pet.health.into()),
            Value::Uint(pet.attack.into()),
            Value::Uint(pet.defense.into()),
            Value::Uint(pet.signature as u64),
        ])
    }));
    let encounters = list(ENCOUNTERS.iter().map(|encounter| {
        list([
            Value::Text(encounter.id.into()),
            Value::Uint(encounter.element as u64),
            Value::Uint(encounter.health.into()),
            Value::Uint(encounter.attack.into()),
            Value::Uint(encounter.defense.into()),
            Value::Bool(encounter.boss),
        ])
    }));
    let limits = list([
        Value::Uint(MANA_CAP.into()),
        Value::Uint(RAGE_CAP.into()),
        Value::Uint(COOLDOWN_TURNS.into()),
        Value::Uint(SKILL_MANA.into()),
        Value::Uint(SIGNATURE_MANA.into()),
        Value::Uint(SIGNATURE_RAGE.into()),
        Value::Uint(ULTIMATE_MANA.into()),
        Value::Uint(ULTIMATE_RAGE.into()),
        Value::Uint(MANA_PER_TILE.into()),
        Value::Uint(MANA_OWN_BONUS.into()),
        Value::Uint(RAGE_PER_TILE.into()),
        Value::Uint(RAGE_PER_GUARD.into()),
        Value::Uint(RAGE_PER_HIT.into()),
        Value::Uint(FIRE_ZONE_TICKS.into()),
        Value::Uint(SKILL_POWER.into()),
        Value::Uint(SIGNATURE_POWER.into()),
        Value::Uint(FIRE_ZONE_POWER.into()),
        Value::Uint(FIRE_ZONE_TICK_POWER.into()),
        Value::Uint(ULTIMATE_POWER.into()),
        Value::Uint(ASSAULT_POWER.into()),
        Value::Uint(HEAVY_POWER.into()),
        Value::Uint(GUARD_ATTACK_POWER.into()),
        Value::Uint(ENRAGE_BONUS.into()),
        Value::Uint(ENEMY_SHIELD_CAP.into()),
        Value::Uint(BOARD_DAMAGE_DIVISOR.into()),
        Value::Uint(MAX_BOARD_ATTEMPTS.into()),
        Value::Uint(MAX_SUBMISSIONS.into()),
        Value::Uint(MAX_ACCEPTED_COMMANDS.into()),
    ]);
    let schedule = list([
        list(
            REGULAR_SCHEDULE
                .iter()
                .map(|kind| Value::Uint(*kind as u64)),
        ),
        list(BOSS_SCHEDULE.iter().map(|kind| Value::Uint(*kind as u64))),
    ]);
    list([
        Value::Text(RULESET_ID.into()),
        Value::Uint(RULESET_VERSION.into()),
        Value::Uint(SIDE as u64),
        Value::Uint(MAX_TURNS.into()),
        Value::Uint(MAX_CASCADES.into()),
        matrices,
        pets,
        encounters,
        limits,
        schedule,
        Value::Bytes(
            Board::fallback()
                .cells()
                .iter()
                .map(|element| *element as u8)
                .collect(),
        ),
        Value::Text(RULES_TEXT.into()),
    ])
}

/// Computed digest of the current source. The committed digest must equal the
/// pinned `RULES_HASH`; a source edit without a new version fails closed.
pub fn computed_rules_hash() -> [u8; 32] {
    validate_content().expect("authored arena8 content is bounded and valid");
    canonical::hash("aetheria.arena8.rules.v1", &canonical_manifest())
        .expect("authored arena8 manifest is bounded")
}

/// Pinned content digest for `RULESET_VERSION`. Changing combat rules,
/// authored content or execution bounds requires a new version and digest.
pub const RULES_HASH: [u8; 32] = [
    0xab, 0xbb, 0x42, 0xac, 0x44, 0xbe, 0x33, 0x52, 0x6d, 0xac, 0x27, 0x3b, 0x22, 0x9b, 0xff, 0xaa,
    0x52, 0x5f, 0x33, 0x0b, 0x9d, 0xaa, 0xf9, 0x63, 0x6d, 0x4f, 0x18, 0x42, 0xd2, 0x28, 0xb4, 0xc7,
];

/// Returns the pinned digest after verifying the current source still matches.
/// Drift fails closed instead of silently changing committed matches.
pub fn rules_hash() -> Result<[u8; 32], CoreError> {
    if computed_rules_hash() != RULES_HASH {
        return Err(CoreError::ContentMismatch);
    }
    Ok(RULES_HASH)
}

pub fn rules_hash_hex() -> Result<String, CoreError> {
    Ok(rules_hash()?
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Convenience for the reducer, which cannot return a `Result` from
/// `ruleset()`. A drift is a programming error and fails closed by panicking.
pub(crate) fn pinned_rules_hash() -> [u8; 32] {
    rules_hash().expect("arena8 rules digest must match the pinned version")
}

pub(crate) fn element_from_u8(value: u8) -> Result<Element, CoreError> {
    ELEMENTS
        .get(usize::from(value))
        .copied()
        .ok_or(CoreError::InvalidState)
}
