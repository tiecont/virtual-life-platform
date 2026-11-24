use aetheria_game_core::{Canonical, Error as CoreError, Value, canonical, canonical::list};
use serde::{Deserialize, Serialize};

use super::{Board, Element, MAX_TURNS, Random, SIDE, pinned_rules_hash};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[repr(u8)]
pub enum SignatureKind {
    Elemental = 0,
    FireZone = 1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Pet {
    pub id: &'static str,
    pub element: Element,
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
    pub signature: SignatureKind,
}

pub const ICARUS: usize = 0;

// Original developer balance data. Identifiers grant no art or media rights.
pub const PETS: [Pet; 6] = [
    Pet {
        id: "icarus",
        element: Element::Fire,
        health: 210,
        attack: 26,
        defense: 14,
        signature: SignatureKind::FireZone,
    },
    Pet {
        id: "marivell",
        element: Element::Water,
        health: 250,
        attack: 22,
        defense: 18,
        signature: SignatureKind::Elemental,
    },
    Pet {
        id: "quorion",
        element: Element::Electric,
        health: 200,
        attack: 28,
        defense: 12,
        signature: SignatureKind::Elemental,
    },
    Pet {
        id: "vesperyn",
        element: Element::Ghost,
        health: 215,
        attack: 25,
        defense: 15,
        signature: SignatureKind::Elemental,
    },
    Pet {
        id: "gravorn",
        element: Element::Ground,
        health: 300,
        attack: 20,
        defense: 24,
        signature: SignatureKind::Elemental,
    },
    Pet {
        id: "aurelune",
        element: Element::Light,
        health: 235,
        attack: 23,
        defense: 16,
        signature: SignatureKind::Elemental,
    },
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Encounter {
    pub id: &'static str,
    pub element: Element,
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
    pub boss: bool,
}

const fn regular(
    id: &'static str,
    element: Element,
    health: u32,
    attack: u32,
    defense: u32,
) -> Encounter {
    Encounter {
        id,
        element,
        health,
        attack,
        defense,
        boss: false,
    }
}
const fn boss(
    id: &'static str,
    element: Element,
    health: u32,
    attack: u32,
    defense: u32,
) -> Encounter {
    Encounter {
        id,
        element,
        health,
        attack,
        defense,
        boss: true,
    }
}

pub const ENCOUNTERS: [Encounter; 12] = [
    regular("cinder-terraces-regular", Element::Fire, 160, 22, 8),
    boss("cinder-terraces-boss", Element::Fire, 320, 30, 14),
    regular("tideglass-lagoon-regular", Element::Water, 190, 24, 10),
    boss("tideglass-lagoon-boss", Element::Water, 360, 32, 16),
    regular("stormcoil-fields-regular", Element::Electric, 220, 26, 12),
    boss("stormcoil-fields-boss", Element::Electric, 400, 34, 18),
    regular("lantern-necropolis-regular", Element::Ghost, 250, 28, 14),
    boss("lantern-necropolis-boss", Element::Ghost, 440, 36, 20),
    regular("ochre-labyrinth-regular", Element::Ground, 280, 30, 16),
    boss("ochre-labyrinth-boss", Element::Ground, 480, 38, 22),
    regular("dawn-prism-sanctum-regular", Element::Light, 310, 32, 18),
    boss("dawn-prism-sanctum-boss", Element::Light, 520, 40, 24),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum Phase {
    Ready = 0,
    Playing = 1,
    Won = 2,
    Lost = 3,
}

impl Phase {
    pub const fn terminal(self) -> bool {
        matches!(self, Self::Won | Self::Lost)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum Ability {
    SharedSkill = 0,
    Signature = 1,
    FireZone = 2,
    Ultimate = 3,
    Guard = 4,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum EnemyIntentKind {
    Assault = 0,
    Heavy = 1,
    Guard = 2,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum Axis {
    Row = 0,
    Column = 1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum RecoveryReason {
    DeadBoard = 0,
    CascadeLimit = 1,
}

pub const REGULAR_SCHEDULE: [EnemyIntentKind; 4] = [
    EnemyIntentKind::Assault,
    EnemyIntentKind::Assault,
    EnemyIntentKind::Guard,
    EnemyIntentKind::Assault,
];
pub const BOSS_SCHEDULE: [EnemyIntentKind; 4] = [
    EnemyIntentKind::Assault,
    EnemyIntentKind::Heavy,
    EnemyIntentKind::Assault,
    EnemyIntentKind::Guard,
];

pub const fn scheduled_kind(encounter: &Encounter, announced_turn: u8) -> EnemyIntentKind {
    let schedule = if encounter.boss {
        BOSS_SCHEDULE
    } else {
        REGULAR_SCHEDULE
    };
    schedule[(announced_turn as usize) % schedule.len()]
}

pub fn lane_cells(axis: Axis, target: u8) -> Vec<u8> {
    (0..SIDE)
        .map(|offset| match axis {
            Axis::Row => target as usize * SIDE + offset,
            Axis::Column => offset * SIDE + target as usize,
        })
        .map(|at| at as u8)
        .collect()
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EnemyIntent {
    pub kind: EnemyIntentKind,
    pub axis: Axis,
    pub target: u8,
    pub announced_turn: u8,
    pub resolves_turn: u8,
    pub cells: Vec<u8>,
}

impl EnemyIntent {
    /// Draws exactly one bounded axis choice and one bounded lane choice. The
    /// kind comes from the authored schedule, not from the RNG.
    pub(crate) fn announce(
        encounter: &Encounter,
        announced_turn: u8,
        rng: &mut impl Random,
    ) -> Result<Self, CoreError> {
        if announced_turn >= MAX_TURNS {
            return Err(CoreError::InvalidState);
        }
        let kind = scheduled_kind(encounter, announced_turn);
        let axis = if rng.below(2)? == 0 {
            Axis::Row
        } else {
            Axis::Column
        };
        let target = u8::try_from(rng.below(SIDE as u32)?).map_err(|_| CoreError::InvalidState)?;
        Ok(Self {
            kind,
            axis,
            target,
            announced_turn,
            resolves_turn: announced_turn + 1,
            cells: lane_cells(axis, target),
        })
    }

    /// Structural and schedule validation without entropy. The target itself
    /// was committed by the previous signed transition, never by a client.
    pub fn validate(&self, encounter: &Encounter, announced_turn: u8) -> Result<(), CoreError> {
        if announced_turn >= MAX_TURNS
            || self.announced_turn != announced_turn
            || self.resolves_turn != announced_turn + 1
            || usize::from(self.target) >= SIDE
            || self.kind != scheduled_kind(encounter, announced_turn)
            || self.cells != lane_cells(self.axis, self.target)
        {
            return Err(CoreError::InvalidState);
        }
        Ok(())
    }
}

impl Canonical for EnemyIntent {
    fn canonical(&self) -> Value {
        list([
            Value::Uint(self.kind as u64),
            Value::Uint(self.axis as u64),
            Value::Uint(self.target.into()),
            Value::Uint(self.announced_turn.into()),
            Value::Uint(self.resolves_turn.into()),
            Value::Bytes(self.cells.clone()),
        ])
    }
}

/// Only intents cross the authority boundary. There is no seed, damage, target,
/// outcome or reward field.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    Start,
    Swap { first: u8, second: u8 },
    Skill,
    Signature,
    FireZone,
    Ultimate,
    Guard,
}

impl Canonical for Action {
    fn canonical(&self) -> Value {
        match self {
            Self::Start => list([Value::Uint(0)]),
            Self::Swap { first, second } => list([
                Value::Uint(1),
                Value::Uint((*first).into()),
                Value::Uint((*second).into()),
            ]),
            Self::Skill => list([Value::Uint(2)]),
            Self::Signature => list([Value::Uint(3)]),
            Self::FireZone => list([Value::Uint(4)]),
            Self::Ultimate => list([Value::Uint(5)]),
            Self::Guard => list([Value::Uint(6)]),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub(crate) pet: u8,
    pub(crate) encounter: u8,
    pub(crate) phase: Phase,
    pub(crate) turn: u8,
    pub(crate) board: Board,
    pub(crate) health: u32,
    pub(crate) enemy_health: u32,
    pub(crate) enemy_shield: u32,
    pub(crate) mana: u16,
    pub(crate) rage: u16,
    pub(crate) cooldown: u8,
    pub(crate) fire_zone_turns: u8,
    pub(crate) intent: Option<EnemyIntent>,
}

impl State {
    pub fn new(pet: u8, encounter: u8) -> Result<Self, CoreError> {
        let pet_definition = PETS.get(usize::from(pet)).ok_or(CoreError::InvalidState)?;
        let encounter_definition = ENCOUNTERS
            .get(usize::from(encounter))
            .ok_or(CoreError::InvalidState)?;
        Ok(Self {
            pet,
            encounter,
            phase: Phase::Ready,
            turn: 0,
            board: Board::fallback(),
            health: pet_definition.health,
            enemy_health: encounter_definition.health,
            enemy_shield: 0,
            mana: 0,
            rage: 0,
            cooldown: 0,
            fire_zone_turns: 0,
            intent: None,
        })
    }

    pub const fn pet(&self) -> u8 {
        self.pet
    }
    pub const fn encounter(&self) -> u8 {
        self.encounter
    }
    pub const fn phase(&self) -> Phase {
        self.phase
    }
    pub const fn turn(&self) -> u8 {
        self.turn
    }
    pub fn board(&self) -> &Board {
        &self.board
    }
    pub const fn health(&self) -> u32 {
        self.health
    }
    pub const fn enemy_health(&self) -> u32 {
        self.enemy_health
    }
    pub const fn enemy_shield(&self) -> u32 {
        self.enemy_shield
    }
    pub const fn mana(&self) -> u16 {
        self.mana
    }
    pub const fn rage(&self) -> u16 {
        self.rage
    }
    pub const fn cooldown(&self) -> u8 {
        self.cooldown
    }
    pub const fn fire_zone_turns(&self) -> u8 {
        self.fire_zone_turns
    }
    pub fn intent(&self) -> Option<&EnemyIntent> {
        self.intent.as_ref()
    }

    /// Immutable replay/state digest. Includes the pinned ruleset digest, every
    /// resource, board cell, cooldown, fire-zone counter and committed telegraph.
    pub fn hash(&self) -> [u8; 32] {
        canonical::hash("aetheria.arena8.state.v1", &self.canonical())
            .expect("bounded arena8 state is hashable")
    }
}

impl Canonical for State {
    fn canonical(&self) -> Value {
        list([
            Value::Bytes(pinned_rules_hash().to_vec()),
            Value::Uint(self.pet.into()),
            Value::Uint(self.encounter.into()),
            Value::Uint(self.phase as u64),
            Value::Uint(self.turn.into()),
            Value::Bytes(
                self.board
                    .cells()
                    .iter()
                    .map(|element| *element as u8)
                    .collect(),
            ),
            Value::Uint(self.health.into()),
            Value::Uint(self.enemy_health.into()),
            Value::Uint(self.enemy_shield.into()),
            Value::Uint(self.mana.into()),
            Value::Uint(self.rage.into()),
            Value::Uint(self.cooldown.into()),
            Value::Uint(self.fire_zone_turns.into()),
            self.intent
                .as_ref()
                .map_or(Value::Null, Canonical::canonical),
        ])
    }
}
