use vl_game_core::{Fixed, Value, canonical, canonical::list};

use crate::{Error, telegraph::Pattern};

pub const CONTENT_ID: &str = "pet-arena-training";
pub const CONTENT_VERSION: u32 = 1;
pub const CONTENT_HASH: [u8; 32] = [
    223, 84, 202, 242, 52, 249, 71, 182, 120, 165, 233, 36, 220, 87, 250, 158, 192, 53, 124, 62,
    176, 14, 244, 90, 220, 12, 105, 228, 228, 250, 48, 138,
];
pub const BOARD_SIDE: usize = 6;
pub const MAX_TURNS: u16 = 60;
pub const MAX_CASCADES: u8 = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Element {
    Ember = 0,
    Tide = 1,
    Grove = 2,
    Spark = 3,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Skill {
    Strike = 0,
    Guard = 1,
    Mend = 2,
    Poison = 3,
    Cleanse = 4,
    Empower = 5,
    BreakGuard = 6,
    Slow = 7,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Pet {
    pub id: &'static str,
    pub element: Element,
    pub health: Fixed,
    pub attack: Fixed,
    pub skill: Skill,
    pub power: Fixed,
    pub cooldown_turns: u8,
}

const fn pet(
    id: &'static str,
    element: Element,
    hp: i64,
    atk: i64,
    skill: Skill,
    power: i64,
) -> Pet {
    Pet {
        id,
        element,
        health: Fixed::from_raw(hp * 1000),
        attack: Fixed::from_raw(atk * 1000),
        skill,
        power: Fixed::from_raw(power * 1000),
        cooldown_turns: 3,
    }
}

// Original developer balance data. These identifiers grant no asset or media rights.
pub const PETS: [Pet; 8] = [
    pet("cinder", Element::Ember, 100, 18, Skill::Strike, 30),
    pet("brook", Element::Tide, 120, 12, Skill::Mend, 25),
    pet("briar", Element::Grove, 110, 14, Skill::Poison, 6),
    pet("volt", Element::Spark, 90, 20, Skill::Empower, 5),
    pet("kiln", Element::Ember, 140, 10, Skill::Guard, 20),
    pet("mist", Element::Tide, 100, 15, Skill::Slow, 1),
    pet("fern", Element::Grove, 115, 13, Skill::Cleanse, 1),
    pet("prism", Element::Spark, 95, 19, Skill::BreakGuard, 25),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Stage {
    pub id: &'static str,
    pub enemy_health: Fixed,
    pub enemy_attack: Fixed,
    pub patterns: &'static [Pattern],
    pub boss: bool,
}

const fn stage(
    id: &'static str,
    hp: i64,
    attack: i64,
    patterns: &'static [Pattern],
    boss: bool,
) -> Stage {
    Stage {
        id,
        enemy_health: Fixed::from_raw(hp * 1000),
        enemy_attack: Fixed::from_raw(attack * 1000),
        patterns,
        boss,
    }
}

pub const STAGES: [Stage; 6] = [
    stage("training-1", 80, 6, &[Pattern::Row], false),
    stage("training-2", 120, 8, &[Pattern::Column], false),
    stage(
        "training-3",
        160,
        10,
        &[Pattern::Row, Pattern::Column],
        false,
    ),
    stage(
        "training-4",
        200,
        12,
        &[Pattern::Column, Pattern::Cross],
        false,
    ),
    stage(
        "training-5",
        260,
        14,
        &[Pattern::Row, Pattern::Cross],
        false,
    ),
    stage(
        "prism-guardian",
        400,
        18,
        &[Pattern::Row, Pattern::Column, Pattern::Cross],
        true,
    ),
];

pub fn validate() -> Result<(), Error> {
    for (index, pet) in PETS.iter().enumerate() {
        if pet.id.is_empty()
            || PETS[..index].iter().any(|prior| prior.id == pet.id)
            || pet.health.raw() <= 0
            || pet.attack.raw() <= 0
            || pet.power.raw() <= 0
            || pet.cooldown_turns == 0
        {
            return Err(Error::InvalidContent);
        }
    }
    for (index, stage) in STAGES.iter().enumerate() {
        if stage.id.is_empty()
            || STAGES[..index].iter().any(|prior| prior.id == stage.id)
            || stage.enemy_health.raw() <= 0
            || stage.enemy_attack.raw() <= 0
            || stage.patterns.is_empty()
            || stage.boss != (index == STAGES.len() - 1)
        {
            return Err(Error::InvalidContent);
        }
    }
    Ok(())
}

pub fn canonical_content() -> Value {
    list([
        Value::Text(CONTENT_ID.into()),
        Value::Uint(CONTENT_VERSION.into()),
        Value::Uint(BOARD_SIDE as u64),
        Value::Uint(MAX_TURNS.into()),
        Value::Uint(MAX_CASCADES.into()),
        // Frozen rules: adjacent match-3, poison3/slow2/empower2, shield before HP.
        Value::Text("adjacent-match3;status-refresh-max;poison3;slow2;empower2;shield-first;no-paid-effects".into()),
        list(PETS.iter().map(|pet| list([
            Value::Text(pet.id.into()), Value::Uint(pet.element as u64),
            Value::Int(pet.health.raw()), Value::Int(pet.attack.raw()),
            Value::Uint(pet.skill as u64), Value::Int(pet.power.raw()),
            Value::Uint(pet.cooldown_turns.into()),
        ]))),
        list(STAGES.iter().map(|stage| list([
            Value::Text(stage.id.into()), Value::Int(stage.enemy_health.raw()),
            Value::Int(stage.enemy_attack.raw()), Value::Bool(stage.boss),
            list(stage.patterns.iter().map(|pattern| Value::Uint(*pattern as u64))),
        ]))),
    ])
}

pub fn content_hash() -> Result<[u8; 32], Error> {
    validate()?;
    let hash = canonical::hash("vl.pet-content.v1", &canonical_content())
        .map_err(|_| Error::InvalidContent)?;
    if hash != CONTENT_HASH {
        return Err(Error::InvalidContent);
    }
    Ok(hash)
}
