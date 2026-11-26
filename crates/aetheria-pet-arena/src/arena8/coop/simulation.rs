//! Deterministic cooperative measurement harness.
//!
//! The policy sees only committed public state. It proposes actions in priority
//! order and lets the reducer reject illegal, unaffordable or out-of-turn ones,
//! so no cost, cooldown or balance rule is duplicated here.
use aetheria_game_core::{Command, LogicalClock, SecretSeed, apply, begin};
use serde::Serialize;

use super::config::EffectKind;
use super::{CoopAction, CoopError, CoopPhase, CoopRules, CoopState, SEATS, SeatInput};

const LOGICAL_ACTION_MS: u64 = 1_000;
pub const COMPARISON_MAX_SEEDS: u32 = 25;
pub const COMPARISON_MAX_BOSSES: usize = 2;
pub const POLICIES: [Policy; 4] = [
    Policy::Random,
    Policy::Basic,
    Policy::Tactical,
    Policy::Coordinated,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Policy {
    Random,
    Basic,
    Tactical,
    Coordinated,
}

impl Policy {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "random" => Some(Self::Random),
            "basic" => Some(Self::Basic),
            "tactical" => Some(Self::Tactical),
            "coordinated" => Some(Self::Coordinated),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationReport {
    pub boss_id: String,
    pub content_digest: String,
    pub policy: Policy,
    pub seeds: u32,
    pub wins: u32,
    pub losses: u32,
    pub unresolved: u32,
    pub phase_two_reached: u32,
    pub total_actions: u64,
    pub average_rounds_milli: u64,
    pub average_actions_milli: u64,
    pub average_logical_duration_ms: u64,
    pub matches_with_multiplier: u32,
    pub contributions: [SeatContribution; SEATS],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatContribution {
    pub pet_id: String,
    pub damage: u64,
    pub healing: u64,
    pub shielding: u64,
}

struct Sample {
    state: CoopState,
    actions: u64,
    multiplier_seen: bool,
}

struct SplitMix(u64);

impl SplitMix {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

fn candidates(
    rules: &CoopRules,
    state: &CoopState,
    policy: Policy,
    prng: &mut SplitMix,
) -> Vec<CoopAction> {
    if state.phase == CoopPhase::Ready {
        return vec![CoopAction::Start];
    }
    let swap = rules
        .legal_swap(state)
        .map(|(first, second)| CoopAction::Swap { first, second });
    let mut out = Vec::with_capacity(7);
    match policy {
        Policy::Basic => {
            if let Some(swap) = swap {
                out.push(swap);
            }
            out.push(CoopAction::Guard);
        }
        Policy::Random => {
            if let Some(swap) = swap {
                out.push(swap);
            }
            out.push(CoopAction::Guard);
            out.push(CoopAction::Skill);
            out.push(CoopAction::Signature);
            out.push(CoopAction::Ultimate);
            out.push(CoopAction::FireZone);
            for index in (1..out.len()).rev() {
                let pick = usize::try_from(prng.next() % (index as u64 + 1)).unwrap_or(0);
                out.swap(index, pick);
            }
        }
        Policy::Tactical | Policy::Coordinated => {
            if policy == Policy::Coordinated {
                prioritize_support(rules, state, &mut out);
            }
            for action in [
                Some(CoopAction::Ultimate),
                Some(CoopAction::Signature),
                Some(CoopAction::FireZone),
                Some(CoopAction::Skill),
                swap,
                Some(CoopAction::Guard),
            ]
            .into_iter()
            .flatten()
            {
                if !out.contains(&action) {
                    out.push(action);
                }
            }
        }
    }
    out
}
fn prioritize_support(rules: &CoopRules, state: &CoopState, out: &mut Vec<CoopAction>) {
    let active = &state.participants[state.active_seat];
    let low_health = |seat: &super::Participant| u64::from(seat.hp) * 2 < u64::from(seat.max_hp);
    let living = state.participants.iter().filter(|seat| seat.alive).count();
    if state.pending.is_some_and(|pending| {
        pending.remaining <= 1 && (low_health(active) || usize::from(pending.targets) >= living)
    }) {
        out.push(CoopAction::Guard);
    }
    let wounded = state
        .participants
        .iter()
        .filter(|seat| seat.alive)
        .any(low_health);
    if wounded && let Some(pet) = rules.config().pet(&active.pet_id) {
        for (action, skill) in [
            (CoopAction::Skill, &pet.skill),
            (CoopAction::Signature, &pet.signature),
            (CoopAction::Ultimate, &pet.ultimate),
        ] {
            if rules
                .config()
                .skill(skill)
                .is_some_and(|skill| skill.effect.kind == EffectKind::Heal)
            {
                out.push(action);
            }
        }
    }
}

fn play(
    rules: &CoopRules,
    initial: &CoopState,
    policy: Policy,
    seed: u64,
) -> Result<Sample, CoopError> {
    let mut entropy = [0u8; 32];
    for (index, byte) in seed.to_le_bytes().iter().cycle().take(32).enumerate() {
        entropy[index] = *byte;
    }
    let secret = SecretSeed::from_host_entropy(entropy);
    let mut match_id = [0u8; 16];
    match_id[..8].copy_from_slice(&seed.to_le_bytes());
    match_id[15] = 1;
    let clock = LogicalClock {
        server_tick: 0,
        logical_time_ms: 0,
    };
    let mut checkpoint = begin(rules, match_id, initial.clone(), &secret, clock)?;
    let mut prng = SplitMix(seed ^ 0xA5A5_5A5A_1234_5678);
    let mut actions = 0u64;
    let mut multiplier_seen = false;
    for step in 0..=super::MAX_TURNS {
        if checkpoint.state.phase.terminal() {
            break;
        }
        let version = checkpoint.version;
        let candidates = candidates(rules, &checkpoint.state, policy, &mut prng);
        let mut accepted = false;
        for (index, action) in candidates.into_iter().enumerate() {
            let command = Command {
                id: command_id(version, index),
                match_id,
                expected_version: version,
                ruleset: rules.ruleset(),
                action,
            };
            let step = u64::from(step) + 1;
            let result = apply(
                rules,
                &checkpoint,
                &command,
                &secret,
                LogicalClock {
                    server_tick: step,
                    logical_time_ms: step * LOGICAL_ACTION_MS,
                },
            );
            let Ok(transition) = result else {
                continue;
            };
            multiplier_seen |= transition
                .next
                .state
                .board
                .iter()
                .flatten()
                .any(|tile| tile.multiplier > 1);
            checkpoint = transition.next;
            accepted = true;
            actions += 1;
            break;
        }
        if !accepted {
            break;
        }
    }
    Ok(Sample {
        state: checkpoint.state,
        actions,
        multiplier_seen,
    })
}

fn command_id(version: u64, attempt: usize) -> [u8; 16] {
    let mut id = [0u8; 16];
    let value = (version << 8) | u64::try_from(attempt).unwrap_or(0);
    id[8..].copy_from_slice(&value.to_be_bytes());
    id[7] = 1;
    id
}

/// Run the authored reducer for deterministic public-information matches.
pub fn simulate(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
) -> Result<SimulationReport, CoopError> {
    if seeds == 0 || seeds > 1_000 {
        return Err(CoopError::InvalidSeat);
    }
    let pets = &rules.config().pets;
    let initial = rules.allocate(std::array::from_fn(|index| SeatInput {
        account: format!("simulation-seat-{index}"),
        pet_id: pets[index % pets.len()].id.clone(),
        owned_pet_instance_id: format!("simulation-instance-{index}"),
        level: 1,
        artifact_power_pm: 0,
    }))?;
    let mut report = SimulationReport {
        boss_id: rules.selected_boss().id.clone(),
        content_digest: rules
            .digest()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
        policy,
        seeds,
        wins: 0,
        losses: 0,
        unresolved: 0,
        phase_two_reached: 0,
        total_actions: 0,
        average_rounds_milli: 0,
        average_actions_milli: 0,
        average_logical_duration_ms: 0,
        matches_with_multiplier: 0,
        contributions: initial
            .participants
            .each_ref()
            .map(|participant| SeatContribution {
                pet_id: participant.pet_id.clone(),
                damage: 0,
                healing: 0,
                shielding: 0,
            }),
    };
    let mut rounds = 0u64;
    for seed in 1..=u64::from(seeds) {
        let sample = play(rules, &initial, policy, seed)?;
        rounds += u64::from(sample.state.round_index);
        report.total_actions += sample.actions;
        report.phase_two_reached += u32::from(sample.state.boss.transformed);
        report.matches_with_multiplier += u32::from(sample.multiplier_seen);
        match sample.state.phase {
            CoopPhase::Won => report.wins += 1,
            CoopPhase::Lost => report.losses += 1,
            CoopPhase::Ready | CoopPhase::Playing => report.unresolved += 1,
        }
        for (total, participant) in report
            .contributions
            .iter_mut()
            .zip(sample.state.participants)
        {
            total.damage += participant.contribution_damage;
            total.healing += participant.contribution_healing;
            total.shielding += participant.contribution_shielding;
        }
    }
    report.average_rounds_milli = rounds * 1_000 / u64::from(seeds);
    report.average_actions_milli = report.total_actions * 1_000 / u64::from(seeds);
    report.average_logical_duration_ms =
        report.total_actions * LOGICAL_ACTION_MS / u64::from(seeds);
    Ok(report)
}
