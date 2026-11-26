//! Durable-state codec, membership and committed projection for `arena8-coop-pve`.
use super::domain::Rules;
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::Element;
use aetheria_pet_arena::arena8::coop::{CoopAction, CoopPhase, CoopState, StatusKind, Tile};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    state: CoopState,
}

fn element_name(element: Element) -> &'static str {
    match element {
        Element::Fire => "fire",
        Element::Water => "water",
        Element::Electric => "electric",
        Element::Ghost => "ghost",
        Element::Ground => "ground",
        Element::Light => "light",
    }
}

fn phase_name(phase: CoopPhase) -> &'static str {
    match phase {
        CoopPhase::Ready => "ready",
        CoopPhase::Playing => "playing",
        CoopPhase::Won => "won",
        CoopPhase::Lost => "lost",
    }
}

fn status_name(kind: StatusKind) -> &'static str {
    match kind {
        StatusKind::AttackBuff => "attack-buff",
        StatusKind::DefenseBuff => "defense-buff",
        StatusKind::Vulnerability => "vulnerability",
    }
}

fn tile(tile: &Option<Tile>) -> serde_json::Value {
    match tile {
        Some(tile) => serde_json::json!({
            "element": element_name(tile.element),
            "multiplier": tile.multiplier,
        }),
        None => serde_json::Value::Null,
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl Game for Rules {
    fn completion(&self, state: &CoopState) -> aetheria_persistence::Result<Completion> {
        self.verify(state).map_err(|_| Error::Integrity)?;
        if !state.phase.terminal() {
            return Err(Error::Invalid);
        }
        let ruleset = self.engine().ruleset();
        let outcome = match state.phase {
            CoopPhase::Won => "won",
            CoopPhase::Lost => "lost",
            CoopPhase::Ready | CoopPhase::Playing => return Err(Error::Invalid),
        };
        let participants = state
            .participants
            .iter()
            .map(|participant| {
                serde_json::json!({
                    "account": participant.account,
                    "alive": participant.alive,
                    "damage": participant.contribution_damage,
                    "healing": participant.contribution_healing,
                    "petId": participant.pet_id,
                    "shielding": participant.contribution_shielding,
                })
            })
            .collect::<Vec<_>>();
        // Proposal keys serialize in sorted (BTreeMap) order; the platform
        // recomputes this canonical string for its hash check.
        Ok(Completion::Proposal(serde_json::json!({
            "configDigest": hex(&state.config_digest),
            "contentHash": hex(&ruleset.content_hash),
            "kind": "coop.completed.v1",
            "outcome": outcome,
            "participants": participants,
            "round": state.round_index,
            "ruleset": ruleset.id,
            "rulesetVersion": ruleset.version,
            "turn": state.turn_index,
        })))
    }

    fn encode(&self, state: &CoopState) -> aetheria_persistence::Result<Vec<u8>> {
        self.verify(state).map_err(|_| Error::Integrity)?;
        serde_json::to_vec(&Snapshot {
            state: state.clone(),
        })
        .map_err(|_| Error::Invalid)
    }

    fn decode(&self, bytes: &[u8]) -> aetheria_persistence::Result<CoopState> {
        let raw: Snapshot = serde_json::from_slice(bytes).map_err(|_| Error::Integrity)?;
        self.verify(&raw.state).map_err(|_| Error::Integrity)?;
        Ok(raw.state)
    }

    fn member(&self, state: &CoopState, account: &str) -> bool {
        Rules::member(self, state, account)
    }

    fn authorize(&self, state: &CoopState, account: &str, _: &Self::Action) -> bool {
        // Only the authenticated owner of the active seat may command. The
        // reducer itself has no actor identity, so this is the seat boundary.
        self.member(state, account)
            && state
                .participants
                .get(state.active_seat)
                .is_some_and(|seat| seat.account == account)
    }

    fn project(&self, state: &CoopState, account: &str) -> aetheria_persistence::Result<Vec<u8>> {
        let seat = self.seat(state, account).ok_or(Error::Unauthorized)?;
        let ruleset = self.engine().ruleset();
        let participants = state
            .participants
            .iter()
            .enumerate()
            .map(|(index, participant)| {
                let mut view = serde_json::json!({
                    "seat": index,
                    "petId": participant.pet_id,
                    "level": participant.level,
                    "hp": participant.hp,
                    "maxHp": participant.max_hp,
                    "attack": participant.attack,
                    "defense": participant.defense,
                    "critRateBp": participant.crit_rate_bp,
                    "critDamageBp": participant.crit_damage_bp,
                    "mana": participant.mana,
                    "rage": participant.rage,
                    "shield": participant.shield,
                    "shieldTurns": participant.shield_turns,
                    "cooldowns": participant.cooldowns,
                    "statuses": participant.statuses.iter().flatten().map(|status| serde_json::json!({
                        "kind": status_name(status.kind),
                        "value": status.value,
                        "turns": status.turns,
                    })).collect::<Vec<_>>(),
                    "contribution": {
                        "damage": participant.contribution_damage,
                        "healing": participant.contribution_healing,
                        "shielding": participant.contribution_shielding,
                    },
                    "alive": participant.alive,
                });
                if let Some(levels) = participant.upgraded_skill_levels() {
                    view["skillLevels"] = serde_json::json!(levels);
                }
                view
            })
            .collect::<Vec<_>>();
        let mut projection = serde_json::json!({
            "schemaVersion": 1,
            "ruleset": {
                "id": ruleset.id,
                "version": ruleset.version,
                "contentHash": hex(&ruleset.content_hash),
                "configDigest": hex(&state.config_digest),
            },
            "you": seat,
            "phase": phase_name(state.phase),
            "activeSeat": state.active_seat,
            "turn": state.turn_index,
            "round": state.round_index,
            "boss": {
                "hp": state.boss.hp,
                "maxHp": state.boss.max_hp,
                "phase": state.boss.phase,
                "shield": state.boss.shield,
                "armorBreakPm": state.boss.armor_break_pm,
                "dotDamage": state.boss.dot_damage,
                "dotTurns": state.boss.dot_turns,
                "transformed": state.boss.transformed,
            },
            "board": state.board.iter().map(tile).collect::<Vec<_>>(),
            "participants": participants,
            "pending": state.pending.as_ref().map(|pending| serde_json::json!({
                "targets": pending.targets,
                "remaining": pending.remaining,
                "damage": pending.damage,
            })),
        });
        // Older bundles retain the historical projection exactly. New local
        // catalog matches present the caller's own published abilities.
        let config = self.engine().config();
        if config.has_artifact_catalog() {
            let own = &state.participants[seat];
            let pet = config.pet(&own.pet_id).ok_or(Error::Integrity)?;
            let slots = [
                ("guard", CoopAction::Guard),
                ("skill", CoopAction::Skill),
                ("signature", CoopAction::Signature),
                ("ultimate", CoopAction::Ultimate),
                ("fire-zone", CoopAction::FireZone),
            ];
            let mut abilities = Vec::new();
            for (slot, ((kind, action), id)) in slots.into_iter().zip(pet.skill_ids()).enumerate() {
                let Some(id) = id else { continue };
                let skill = config.skill(id).ok_or(Error::Integrity)?;
                abilities.push(serde_json::json!({
                    "kind": kind, "id": id, "mana": skill.mana_cost, "rage": skill.rage_cost,
                    "cooldown": own.cooldowns[slot],
                    "ready": self.engine().ability_ready(state, seat, action),
                }));
            }
            projection["abilities"] = serde_json::Value::Array(abilities);
            projection["bossId"] =
                serde_json::Value::String(self.engine().selected_boss().id.clone());
        }
        serde_json::to_vec(&projection).map_err(|_| Error::Invalid)
    }
}
