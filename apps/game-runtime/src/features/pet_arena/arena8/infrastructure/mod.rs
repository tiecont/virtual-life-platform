//! Durable-state codec, membership and authored projection for \`arena8-pve\`.

use super::domain::{Rules, State};
use aetheria_game_core::Reducer;
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::binding::{self, ArtifactStat, StatEffect};
use aetheria_pet_arena::arena8::{Action, BoundState, Phase};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    account: String,
    state: Vec<u8>,
}

impl Game for Rules {
    fn completion(&self, state: &State) -> aetheria_persistence::Result<Completion> {
        self.validate(state).map_err(|_| Error::Integrity)?;
        match state.bound.core().phase() {
            Phase::Won => Ok(Completion::PetArena { won: true }),
            Phase::Lost => Ok(Completion::PetArena { won: false }),
            _ => Err(Error::Invalid),
        }
    }

    fn encode(&self, state: &State) -> aetheria_persistence::Result<Vec<u8>> {
        serde_json::to_vec(&Snapshot {
            account: state.account.clone(),
            state: state.bound.encode().map_err(|_| Error::Invalid)?,
        })
        .map_err(|_| Error::Invalid)
    }

    fn decode(&self, bytes: &[u8]) -> aetheria_persistence::Result<State> {
        let raw: Snapshot = serde_json::from_slice(bytes).map_err(|_| Error::Integrity)?;
        let bound = BoundState::decode(&raw.state).map_err(|_| Error::Integrity)?;
        let state = State {
            account: raw.account,
            bound,
        };
        // An allocated match keeps its original snapshot. A later loadout is
        // only visible to a new match, so an incompatible restore fails closed.
        self.validate(&state).map_err(|_| Error::Integrity)?;
        Ok(state)
    }

    fn member(&self, state: &State, account: &str) -> bool {
        state.account == account && state.bound.snapshot().account() == account
    }

    fn authorize(&self, state: &State, account: &str, _: &Action) -> bool {
        self.member(state, account)
    }

    fn project(&self, state: &State, account: &str) -> aetheria_persistence::Result<Vec<u8>> {
        if !self.member(state, account) {
            return Err(Error::Unauthorized);
        }
        let snapshot = state.bound.snapshot();
        let core = state.bound.core();
        let stats = |stats: binding::CombatStats| {
            serde_json::json!({
                "health": stats.health,
                "attack": stats.attack,
                "defense": stats.defense,
            })
        };
        let modifier = |stat: ArtifactStat, value: u16| {
            let semantics = binding::stat_semantics(stat);
            serde_json::json!({
                "value": value,
                "active": semantics.effect != StatEffect::Inactive,
                "effect": match semantics.effect {
                    StatEffect::Health => "health",
                    StatEffect::Attack => "attack",
                    StatEffect::Defense => "defense",
                    StatEffect::Inactive => "inactive",
                },
                "reason": semantics.reason,
            })
        };
        let skills: Vec<&str> = snapshot
            .skills()
            .iter()
            .map(|skill| match skill {
                binding::SkillId::SharedSkill => "shared-skill",
                binding::SkillId::Signature => "signature",
                binding::SkillId::FireZone => "fire-zone",
                binding::SkillId::Ultimate => "ultimate",
                binding::SkillId::Guard => "guard",
            })
            .collect();
        let telegraph = core.intent().map(|intent| {
            serde_json::json!({
                "kind": match intent.kind {
                    aetheria_pet_arena::arena8::EnemyIntentKind::Assault => "assault",
                    aetheria_pet_arena::arena8::EnemyIntentKind::Heavy => "heavy",
                    aetheria_pet_arena::arena8::EnemyIntentKind::Guard => "guard",
                },
                "axis": match intent.axis {
                    aetheria_pet_arena::arena8::Axis::Row => "row",
                    aetheria_pet_arena::arena8::Axis::Column => "column",
                },
                "target": intent.target,
                "announcedTurn": intent.announced_turn,
                "resolvesTurn": intent.resolves_turn,
                "cells": intent.cells,
            })
        });
        let hex = |bytes: &[u8]| {
            bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        };
        let encounter = snapshot.encounter();
        let modifiers = snapshot.modifiers();
        let projection = serde_json::json!({
            "schemaVersion": 1,
            "ruleset": {
                "id": super::domain::RULESET_ID,
                "version": super::domain::RULESET_VERSION,
                "reducerId": snapshot.ruleset_id(),
                "contentHash": hex(&super::domain::content_hash()),
                "bindingId": snapshot.binding_id(),
                "bindingVersion": snapshot.binding_version(),
                "bindingDigest": hex(&snapshot.binding_digest()),
                "rosterVersion": snapshot.species_version(),
                "rulesDigest": hex(&snapshot.rules_digest()),
            },
            "pet": {
                "id": snapshot.pet_id(),
                "name": binding::identity(snapshot.pet_id()).map(|identity| identity.name).unwrap_or(""),
                "family": snapshot.family(),
                "element": snapshot.element(),
                "level": snapshot.level(),
                "ownedPetId": snapshot.owned_pet_id(),
            },
            "stats": {
                "base": stats(snapshot.base()),
                "grown": stats(snapshot.grown()),
                "effective": stats(snapshot.effective()),
            },
            "artifacts": snapshot.artifacts().iter().map(|artifact| serde_json::json!({
                "slot": artifact.slot,
                "definitionId": artifact.definition_id,
                "rank": artifact.rank,
                "upgradeLevel": artifact.upgrade_level,
                "modifiers": {
                    "hp": artifact.modifiers.hp,
                    "attack": artifact.modifiers.attack,
                    "defense": artifact.modifiers.defense,
                    "speed": artifact.modifiers.speed,
                },
            })).collect::<Vec<_>>(),
            "modifiers": {
                "hp": modifier(ArtifactStat::Hp, modifiers.hp),
                "attack": modifier(ArtifactStat::Attack, modifiers.attack),
                "defense": modifier(ArtifactStat::Defense, modifiers.defense),
                "speed": modifier(ArtifactStat::Speed, modifiers.speed),
            },
            "skills": skills,
            "encounter": {
                "index": encounter.index,
                "id": encounter.id,
                "revision": encounter.revision,
                "boss": encounter.boss,
                "element": encounter.element,
            },
            "phase": match core.phase() {
                Phase::Ready => "ready",
                Phase::Playing => "playing",
                Phase::Won => "won",
                Phase::Lost => "lost",
            },
            "turn": core.turn(),
            "board": core.board().cells().iter().map(|element| *element as u8).collect::<Vec<_>>(),
            "health": core.health(),
            "enemyHealth": core.enemy_health(),
            "enemyShield": core.enemy_shield(),
            "mana": core.mana(),
            "rage": core.rage(),
            "cooldown": core.cooldown(),
            "fireZoneTurns": core.fire_zone_turns(),
            "telegraph": telegraph,
            "snapshotDigest": hex(&snapshot.digest()),
        });
        serde_json::to_vec(&projection).map_err(|_| Error::Invalid)
    }
}
