//! Durable-state codec, membership and committed projection for `arena8-coop-pve`.
use super::domain::{Rules, SYSTEM_ACTOR_ID};
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::coop::config::{effect_kind_name, effect_target_name};
use aetheria_pet_arena::arena8::coop::{
    CoopAction, CoopPhase, CoopState, FIRE_ZONE_CELLS, FUNCTIONAL_SOLO_RULESET_ID, StatusKind,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    state: CoopState,
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
        let mut proposal = serde_json::json!({
            "configDigest": hex(&state.config_digest),
            "contentHash": hex(&ruleset.content_hash),
            "kind": if ruleset.id == FUNCTIONAL_SOLO_RULESET_ID { "solo.completed.v1" } else { "coop.completed.v1" },
            "outcome": outcome,
            "participants": participants,
            "round": state.round_index,
            "ruleset": ruleset.id,
            "rulesetVersion": ruleset.version,
            "turn": state.turn_index,
        });
        if self.engine().regular_encounter() {
            proposal["encounterId"] = self.engine().encounter_id().into();
        }
        Ok(Completion::Proposal(proposal))
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

    fn authorize(&self, state: &CoopState, account: &str, command: &Self::Action) -> bool {
        // `ExpireTurn` may only execute through the server's internal system path
        // (`SYSTEM_ACTOR_ID`); client intents cannot parse or authorize it.
        if matches!(command.action, CoopAction::ExpireTurn { .. }) {
            return account == SYSTEM_ACTOR_ID;
        }
        // Only the authenticated owner of the active seat may command. The
        // reducer itself has no actor identity, so this is the seat boundary.
        self.member(state, account)
            && state
                .participants
                .get(state.active_seat)
                .is_some_and(|seat| seat.account == account)
    }

    fn project_system(&self, state: &CoopState) -> aetheria_persistence::Result<Vec<u8>> {
        serde_json::to_vec(&serde_json::json!({
            "kind": "arena8-coop.system-receipt.v1",
            "turn": state.turn_index,
            "round": state.round_index,
            "phase": phase_name(state.phase),
        }))
        .map_err(|_| Error::Invalid)
    }

    fn project(&self, state: &CoopState, account: &str) -> aetheria_persistence::Result<Vec<u8>> {
        let seat = self.seat(state, account).ok_or(Error::Unauthorized)?;
        let ruleset = self.engine().ruleset();
        let config = self.engine().config();
        let is_v3 = config.is_v3();
        let now_ms = self.now_ms();
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
                if is_v3 {
                    let pet_cfg = config.pet(&participant.pet_id).ok_or(Error::Integrity)?;
                    let has_ultimate = config.skill(&pet_cfg.ultimate).is_some();
                    let ultimate_ready = self.engine().ultimate_charged(state, index);
                    let fire_zone_turns = if state.phase.terminal() {
                        0
                    } else {
                        participant.fire_zone_turns
                    };
                    view["hasUltimate"] = serde_json::json!(has_ultimate);
                    view["ultimateReady"] = serde_json::json!(ultimate_ready);
                    view["fireZoneTurns"] = serde_json::json!(fire_zone_turns);
                    view["passives"] = serde_json::json!([]);
                }
                Ok(view)
            })
            .collect::<aetheria_persistence::Result<Vec<_>>>()?;
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
                "armorBreakPm": state.boss.incoming_damage_pm(),
                "dotDamage": state.boss.dot_damage,
                "dotTurns": state.boss.dot_turns,
                "transformed": state.boss.transformed,
            },
            "board": state.board.iter().map(|tile| serde_json::json!(tile)).collect::<Vec<_>>(),
            "participants": participants,
            "pending": state.pending.as_ref().map(|pending| serde_json::json!({
                "targets": pending.targets,
                "remaining": pending.remaining,
                "damage": pending.damage,
            })),
        });
        // Older bundles retain the historical projection exactly. New local
        // catalog matches present the caller's own published abilities.
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
            let own_levels = own.skill_levels();
            let mut abilities = Vec::new();
            for (slot, ((kind, action), id)) in slots.into_iter().zip(pet.skill_ids()).enumerate() {
                let Some(id) = id else { continue };
                let skill = config.skill(id).ok_or(Error::Integrity)?;
                let mut entry = serde_json::json!({
                    "kind": kind, "id": id, "mana": skill.mana_cost, "rage": skill.rage_cost,
                    "cooldown": own.cooldowns[slot],
                    "ready": self.engine().ability_ready(state, seat, action),
                });
                if is_v3 {
                    entry["maxCooldown"] = serde_json::json!(skill.cooldown_turns);
                    entry["effectKind"] = serde_json::json!(effect_kind_name(skill.effect.kind));
                    entry["target"] = serde_json::json!(effect_target_name(skill.effect.target));
                    entry["powerPm"] = serde_json::json!(
                        skill.power_at(own_levels[slot]).unwrap_or(skill.power_pm)
                    );
                }
                abilities.push(entry);
            }
            projection["abilities"] = serde_json::Value::Array(abilities);
            projection["bossId"] = self.engine().encounter_id().into();
        }
        if is_v3 {
            let remaining = if state.phase == CoopPhase::Playing {
                state
                    .turn_deadline_ms
                    .map(|deadline| deadline.saturating_sub(now_ms))
            } else {
                None
            };
            let fire_zone_active_turns = if state.phase.terminal() {
                0
            } else {
                state
                    .participants
                    .iter()
                    .map(|participant| participant.fire_zone_turns)
                    .max()
                    .unwrap_or(0)
            };
            let fire_zone_cells: Vec<u8> = if fire_zone_active_turns > 0 {
                FIRE_ZONE_CELLS.to_vec()
            } else {
                Vec::new()
            };
            projection["turnTimeoutMs"] = serde_json::json!(config.party.turn_timeout_ms);
            projection["turnDeadlineUnixMs"] = serde_json::json!(state.turn_deadline_ms);
            projection["turnRemainingMs"] = serde_json::json!(remaining);
            projection["serverUnixMs"] = serde_json::json!(now_ms);
            projection["maxRounds"] = serde_json::json!(self.engine().max_rounds());
            projection["canEndTurn"] = serde_json::json!(
                state.phase == CoopPhase::Playing
                    && state.active_seat == seat
                    && state.participants[seat].alive
                    && state
                        .turn_deadline_ms
                        .is_none_or(|deadline| now_ms < deadline)
            );
            projection["fireZoneActiveTurns"] = serde_json::json!(fire_zone_active_turns);
            projection["fireZoneCells"] = serde_json::json!(fire_zone_cells);
        }
        serde_json::to_vec(&projection).map_err(|_| Error::Invalid)
    }
}
