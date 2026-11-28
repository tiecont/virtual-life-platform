use aetheria_game_core::{Canonical, Error as CoreError, Value, canonical::list};
use serde::{Deserialize, Serialize};

use super::{
    Ability, Axis, Element, EnemyIntent, EnemyIntentKind, Phase, RecoveryReason, element_from_u8,
};

/// Typed, serializable combat event stream. It is also the client presentation
/// cue stream: every visual and audio cue can be derived from these committed
/// fields. Clients cannot send any of these values back.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum CombatEvent {
    BoardInitialized {
        cells: Vec<Element>,
        attempts: u8,
        fallback: bool,
    },
    Swap {
        first: u8,
        second: u8,
    },
    TilesCleared {
        pass: u8,
        cells: Vec<u8>,
        damage: u32,
        mana_gained: u16,
        rage_gained: u16,
        enemy_health: u32,
    },
    CascadeCapped {
        passes: u8,
    },
    BoardRecovered {
        reason: RecoveryReason,
        attempts: u8,
    },
    AbilityUsed {
        ability: Ability,
        damage: u32,
        mana_spent: u16,
        rage_spent: u16,
        rage_gained: u16,
        enemy_health: u32,
    },
    FireZoneTicked {
        damage: u32,
        remaining: u8,
        enemy_health: u32,
    },
    EnemyIntentAnnounced {
        intent: EnemyIntent,
    },
    EnemyAttack {
        kind: EnemyIntentKind,
        axis: Axis,
        target: u8,
        exposed: u8,
        raw_damage: u32,
        damage: u32,
        enraged: bool,
        rage_gained: u16,
        player_health: u32,
    },
    EnemyShielded {
        amount: u32,
        total: u32,
    },
    TurnEnded {
        turn: u8,
    },
    MatchEnded {
        phase: Phase,
        turn: u8,
    },
}

impl CombatEvent {
    pub fn canonical(&self) -> Value {
        match self {
            Self::BoardInitialized {
                cells,
                attempts,
                fallback,
            } => list([
                Value::Uint(0),
                Value::Uint((*attempts).into()),
                Value::Bool(*fallback),
                Value::Bytes(cells.iter().map(|element| *element as u8).collect()),
            ]),
            Self::Swap { first, second } => list([
                Value::Uint(1),
                Value::Uint((*first).into()),
                Value::Uint((*second).into()),
            ]),
            Self::TilesCleared {
                pass,
                cells,
                damage,
                mana_gained,
                rage_gained,
                enemy_health,
            } => list([
                Value::Uint(2),
                Value::Uint((*pass).into()),
                Value::Bytes(cells.clone()),
                Value::Uint((*damage).into()),
                Value::Uint((*mana_gained).into()),
                Value::Uint((*rage_gained).into()),
                Value::Uint((*enemy_health).into()),
            ]),
            Self::CascadeCapped { passes } => list([Value::Uint(3), Value::Uint((*passes).into())]),
            Self::BoardRecovered { reason, attempts } => list([
                Value::Uint(4),
                Value::Uint(*reason as u64),
                Value::Uint((*attempts).into()),
            ]),
            Self::AbilityUsed {
                ability,
                damage,
                mana_spent,
                rage_spent,
                rage_gained,
                enemy_health,
            } => list([
                Value::Uint(5),
                Value::Uint(*ability as u64),
                Value::Uint((*damage).into()),
                Value::Uint((*mana_spent).into()),
                Value::Uint((*rage_spent).into()),
                Value::Uint((*rage_gained).into()),
                Value::Uint((*enemy_health).into()),
            ]),
            Self::FireZoneTicked {
                damage,
                remaining,
                enemy_health,
            } => list([
                Value::Uint(6),
                Value::Uint((*damage).into()),
                Value::Uint((*remaining).into()),
                Value::Uint((*enemy_health).into()),
            ]),
            Self::EnemyIntentAnnounced { intent } => list([Value::Uint(7), intent.canonical()]),
            Self::EnemyAttack {
                kind,
                axis,
                target,
                exposed,
                raw_damage,
                damage,
                enraged,
                rage_gained,
                player_health,
            } => list([
                Value::Uint(8),
                Value::Uint(*kind as u64),
                Value::Uint(*axis as u64),
                Value::Uint((*target).into()),
                Value::Uint((*exposed).into()),
                Value::Uint((*raw_damage).into()),
                Value::Uint((*damage).into()),
                Value::Bool(*enraged),
                Value::Uint((*rage_gained).into()),
                Value::Uint((*player_health).into()),
            ]),
            Self::EnemyShielded { amount, total } => list([
                Value::Uint(9),
                Value::Uint((*amount).into()),
                Value::Uint((*total).into()),
            ]),
            Self::TurnEnded { turn } => list([Value::Uint(10), Value::Uint((*turn).into())]),
            Self::MatchEnded { phase, turn } => list([
                Value::Uint(11),
                Value::Uint(*phase as u64),
                Value::Uint((*turn).into()),
            ]),
        }
    }

    pub fn from_canonical(value: &Value) -> Result<Self, CoreError> {
        let fields = items(value)?;
        let code = u8_from(fields.first())?;
        match code {
            0 => {
                expect_len(fields, 4)?;
                Ok(Self::BoardInitialized {
                    attempts: u8_from(fields.get(1))?,
                    fallback: boolean(fields.get(2))?,
                    cells: bytes(fields.get(3))?
                        .iter()
                        .map(|value| element_from_u8(*value))
                        .collect::<Result<Vec<_>, _>>()?,
                })
            }
            1 => {
                expect_len(fields, 3)?;
                Ok(Self::Swap {
                    first: u8_from(fields.get(1))?,
                    second: u8_from(fields.get(2))?,
                })
            }
            2 => {
                expect_len(fields, 7)?;
                Ok(Self::TilesCleared {
                    pass: u8_from(fields.get(1))?,
                    cells: bytes(fields.get(2))?.to_vec(),
                    damage: u32_from(fields.get(3))?,
                    mana_gained: u16_from(fields.get(4))?,
                    rage_gained: u16_from(fields.get(5))?,
                    enemy_health: u32_from(fields.get(6))?,
                })
            }
            3 => {
                expect_len(fields, 2)?;
                Ok(Self::CascadeCapped {
                    passes: u8_from(fields.get(1))?,
                })
            }
            4 => {
                expect_len(fields, 3)?;
                Ok(Self::BoardRecovered {
                    reason: recovery_reason(u8_from(fields.get(1))?)?,
                    attempts: u8_from(fields.get(2))?,
                })
            }
            5 => {
                expect_len(fields, 7)?;
                Ok(Self::AbilityUsed {
                    ability: ability(u8_from(fields.get(1))?)?,
                    damage: u32_from(fields.get(2))?,
                    mana_spent: u16_from(fields.get(3))?,
                    rage_spent: u16_from(fields.get(4))?,
                    rage_gained: u16_from(fields.get(5))?,
                    enemy_health: u32_from(fields.get(6))?,
                })
            }
            6 => {
                expect_len(fields, 4)?;
                Ok(Self::FireZoneTicked {
                    damage: u32_from(fields.get(1))?,
                    remaining: u8_from(fields.get(2))?,
                    enemy_health: u32_from(fields.get(3))?,
                })
            }
            7 => {
                expect_len(fields, 2)?;
                Ok(Self::EnemyIntentAnnounced {
                    intent: intent(fields.get(1))?,
                })
            }
            8 => {
                expect_len(fields, 10)?;
                Ok(Self::EnemyAttack {
                    kind: intent_kind(u8_from(fields.get(1))?)?,
                    axis: axis(u8_from(fields.get(2))?)?,
                    target: u8_from(fields.get(3))?,
                    exposed: u8_from(fields.get(4))?,
                    raw_damage: u32_from(fields.get(5))?,
                    damage: u32_from(fields.get(6))?,
                    enraged: boolean(fields.get(7))?,
                    rage_gained: u16_from(fields.get(8))?,
                    player_health: u32_from(fields.get(9))?,
                })
            }
            9 => {
                expect_len(fields, 3)?;
                Ok(Self::EnemyShielded {
                    amount: u32_from(fields.get(1))?,
                    total: u32_from(fields.get(2))?,
                })
            }
            10 => {
                expect_len(fields, 2)?;
                Ok(Self::TurnEnded {
                    turn: u8_from(fields.get(1))?,
                })
            }
            11 => {
                expect_len(fields, 3)?;
                Ok(Self::MatchEnded {
                    phase: phase(u8_from(fields.get(1))?)?,
                    turn: u8_from(fields.get(2))?,
                })
            }
            _ => Err(CoreError::InvalidState),
        }
    }
}

fn items(value: &Value) -> Result<&[Value], CoreError> {
    match value {
        Value::List(values) => Ok(values),
        _ => Err(CoreError::InvalidState),
    }
}

fn expect_len(fields: &[Value], expected: usize) -> Result<(), CoreError> {
    if fields.len() == expected {
        Ok(())
    } else {
        Err(CoreError::InvalidState)
    }
}

fn uint(value: Option<&Value>) -> Result<u64, CoreError> {
    match value {
        Some(Value::Uint(value)) => Ok(*value),
        _ => Err(CoreError::InvalidState),
    }
}

fn u8_from(value: Option<&Value>) -> Result<u8, CoreError> {
    u8::try_from(uint(value)?).map_err(|_| CoreError::InvalidState)
}

fn u16_from(value: Option<&Value>) -> Result<u16, CoreError> {
    u16::try_from(uint(value)?).map_err(|_| CoreError::InvalidState)
}

fn u32_from(value: Option<&Value>) -> Result<u32, CoreError> {
    u32::try_from(uint(value)?).map_err(|_| CoreError::InvalidState)
}

fn boolean(value: Option<&Value>) -> Result<bool, CoreError> {
    match value {
        Some(Value::Bool(value)) => Ok(*value),
        _ => Err(CoreError::InvalidState),
    }
}

fn bytes(value: Option<&Value>) -> Result<&[u8], CoreError> {
    match value {
        Some(Value::Bytes(value)) => Ok(value),
        _ => Err(CoreError::InvalidState),
    }
}

fn ability(value: u8) -> Result<Ability, CoreError> {
    match value {
        0 => Ok(Ability::SharedSkill),
        1 => Ok(Ability::Signature),
        2 => Ok(Ability::FireZone),
        3 => Ok(Ability::Ultimate),
        4 => Ok(Ability::Guard),
        _ => Err(CoreError::InvalidState),
    }
}

fn intent_kind(value: u8) -> Result<EnemyIntentKind, CoreError> {
    match value {
        0 => Ok(EnemyIntentKind::Assault),
        1 => Ok(EnemyIntentKind::Heavy),
        2 => Ok(EnemyIntentKind::Guard),
        _ => Err(CoreError::InvalidState),
    }
}

fn axis(value: u8) -> Result<Axis, CoreError> {
    match value {
        0 => Ok(Axis::Row),
        1 => Ok(Axis::Column),
        _ => Err(CoreError::InvalidState),
    }
}

fn recovery_reason(value: u8) -> Result<RecoveryReason, CoreError> {
    match value {
        0 => Ok(RecoveryReason::DeadBoard),
        1 => Ok(RecoveryReason::CascadeLimit),
        _ => Err(CoreError::InvalidState),
    }
}

fn phase(value: u8) -> Result<Phase, CoreError> {
    match value {
        0 => Ok(Phase::Ready),
        1 => Ok(Phase::Playing),
        2 => Ok(Phase::Won),
        3 => Ok(Phase::Lost),
        _ => Err(CoreError::InvalidState),
    }
}

fn intent(value: Option<&Value>) -> Result<EnemyIntent, CoreError> {
    let fields = items(value.ok_or(CoreError::InvalidState)?)?;
    expect_len(fields, 6)?;
    Ok(EnemyIntent {
        kind: intent_kind(u8_from(fields.first())?)?,
        axis: axis(u8_from(fields.get(1))?)?,
        target: u8_from(fields.get(2))?,
        announced_turn: u8_from(fields.get(3))?,
        resolves_turn: u8_from(fields.get(4))?,
        cells: bytes(fields.get(5))?.to_vec(),
    })
}
