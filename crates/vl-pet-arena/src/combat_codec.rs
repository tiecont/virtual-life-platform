//! Private state codec for a trusted host's integrity-protected checkpoint.
//! This is not a client DTO and does not authenticate untrusted snapshots.
use serde::{Deserialize, Serialize};
use vl_game_core::{Error, Fixed, Reducer};

use crate::{
    board::{Board, CELLS},
    combat::{Combat, Phase, State, rules_hash},
    content::Element,
    status::{Kind, Status},
    telegraph::Telegraph,
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    format: u8,
    rules_hash: [u8; 32],
    pet: u8,
    stage: u8,
    phase: u8,
    turn: u16,
    board: Vec<u8>,
    health: i64,
    shield: i64,
    enemy_health: i64,
    enemy_shield: i64,
    cooldown: u8,
    player_status: Vec<StatusSnapshot>,
    enemy_status: Vec<StatusSnapshot>,
    telegraph: Option<IntentSnapshot>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusSnapshot {
    kind: u8,
    potency: i64,
    turns: u8,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct IntentSnapshot {
    turn: u16,
    target: u8,
}

impl State {
    pub fn encode(&self) -> Result<Vec<u8>, Error> {
        Combat.validate(self)?;
        let statuses = |items: &[Status]| {
            items
                .iter()
                .map(|item| StatusSnapshot {
                    kind: item.kind as u8,
                    potency: item.potency.raw(),
                    turns: item.remaining_turns,
                })
                .collect()
        };
        serde_json::to_vec(&Snapshot {
            format: 1,
            rules_hash: rules_hash(),
            pet: self.pet,
            stage: self.stage,
            phase: self.phase as u8,
            turn: self.turn,
            board: self.board.0.iter().map(|tile| *tile as u8).collect(),
            health: self.health.raw(),
            shield: self.shield.raw(),
            enemy_health: self.enemy_health.raw(),
            enemy_shield: self.enemy_shield.raw(),
            cooldown: self.cooldown,
            player_status: statuses(&self.player_status),
            enemy_status: statuses(&self.enemy_status),
            telegraph: self.telegraph.as_ref().map(|intent| IntentSnapshot {
                turn: intent.announced_turn,
                target: intent.target,
            }),
        })
        .map_err(|_| Error::InvalidState)
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, Error> {
        if bytes.len() > 4096 {
            return Err(Error::Capacity);
        }
        let snapshot: Snapshot = serde_json::from_slice(bytes).map_err(|_| Error::InvalidState)?;
        if snapshot.format != 1 || snapshot.rules_hash != rules_hash() {
            return Err(Error::ContentMismatch);
        }
        let board: [Element; CELLS] = snapshot
            .board
            .into_iter()
            .map(|tile| match tile {
                0 => Ok(Element::Ember),
                1 => Ok(Element::Tide),
                2 => Ok(Element::Grove),
                3 => Ok(Element::Spark),
                _ => Err(Error::InvalidState),
            })
            .collect::<Result<Vec<_>, _>>()?
            .try_into()
            .map_err(|_| Error::InvalidState)?;
        let statuses = |items: Vec<StatusSnapshot>| {
            items
                .into_iter()
                .map(|item| {
                    Ok(Status {
                        kind: match item.kind {
                            0 => Kind::Poison,
                            1 => Kind::Slow,
                            2 => Kind::Empower,
                            _ => return Err(Error::InvalidState),
                        },
                        potency: Fixed::from_raw(item.potency),
                        remaining_turns: item.turns,
                    })
                })
                .collect::<Result<Vec<_>, Error>>()
        };
        let state = Self {
            pet: snapshot.pet,
            stage: snapshot.stage,
            phase: match snapshot.phase {
                0 => Phase::Ready,
                1 => Phase::Playing,
                2 => Phase::Won,
                3 => Phase::Lost,
                _ => return Err(Error::InvalidState),
            },
            turn: snapshot.turn,
            board: Board(board),
            health: Fixed::from_raw(snapshot.health),
            shield: Fixed::from_raw(snapshot.shield),
            enemy_health: Fixed::from_raw(snapshot.enemy_health),
            enemy_shield: Fixed::from_raw(snapshot.enemy_shield),
            cooldown: snapshot.cooldown,
            player_status: statuses(snapshot.player_status)?,
            enemy_status: statuses(snapshot.enemy_status)?,
            telegraph: snapshot
                .telegraph
                .map(|intent| {
                    Telegraph::announce(snapshot.stage, intent.turn, intent.target)
                        .map_err(|_| Error::InvalidState)
                })
                .transpose()?,
        };
        Combat.validate(&state)?;
        Ok(state)
    }
}
