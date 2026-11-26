//! Deterministic cooperative measurement harness.
//!
//! The policy sees only committed public state. It proposes actions in priority
//! order and lets the reducer reject illegal, unaffordable or out-of-turn ones,
//! so no cost, cooldown or balance rule is duplicated here.
use aetheria_game_core::{Command, LogicalClock, SecretSeed, apply, begin};
use serde::Serialize;

use super::{CoopAction, CoopError, CoopPhase, CoopRules, CoopState, SeatInput};

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
    pub policy: Policy,
    pub seeds: u32,
    pub wins: u32,
    pub losses: u32,
    pub unresolved: u32,
    pub phase_two_reached: u32,
    pub total_actions: u64,
    pub average_rounds_milli: u64,
    pub average_actions_milli: u64,
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
    let mut out = Vec::with_capacity(5);
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
            for index in (1..out.len()).rev() {
                let pick = usize::try_from(prng.next() % (index as u64 + 1)).unwrap_or(0);
                out.swap(index, pick);
            }
        }
        Policy::Tactical => {
            out.extend([
                CoopAction::Ultimate,
                CoopAction::Signature,
                CoopAction::Skill,
            ]);
            if let Some(swap) = swap {
                out.push(swap);
            }
            out.push(CoopAction::Guard);
        }
        Policy::Coordinated => {
            let active = &state.participants[state.active_seat];
            let wounded = state.participants.iter().any(|participant| {
                participant.alive && u64::from(participant.hp) * 2 < u64::from(participant.max_hp)
            });
            // Water is the authored sustain archetype; a coordinated team leans
            // on its support skill while an ally is hurt.
            if wounded && active.pet_id == "coralline" {
                out.push(CoopAction::Skill);
            }
            out.extend([
                CoopAction::Ultimate,
                CoopAction::Signature,
                CoopAction::Skill,
            ]);
            if let Some(swap) = swap {
                out.push(swap);
            }
            out.push(CoopAction::Guard);
        }
    }
    out
}
fn play(rules: &CoopRules, policy: Policy, seed: u64) -> (CoopPhase, u16, u64, bool) {
    let mut seats = Vec::new();
    for (index, pet) in rules.config().pets.iter().take(4).enumerate() {
        seats.push(SeatInput {
            account: format!("simulation-seat-{index}"),
            pet_id: pet.id.clone(),
            level: 1,
            artifact_power_pm: 1_000,
        });
    }
    let seats: [SeatInput; 4] = seats.try_into().expect("four cooperative Pets");
    let state = rules
        .allocate(seats)
        .expect("validated simulation allocation");
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
    let mut checkpoint = match begin(rules, match_id, state, &secret, clock) {
        Ok(checkpoint) => checkpoint,
        Err(_) => return (CoopPhase::Lost, 1, 0, false),
    };
    let mut prng = SplitMix(seed ^ 0xA5A5_5A5A_1234_5678);
    let mut actions = 0u64;
    let mut phase_two = false;
    for step in 0..super::MAX_TURNS {
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
                    logical_time_ms: step * 1_000,
                },
            );
            let Ok(transition) = result else {
                continue;
            };
            if transition.next.state.boss.phase == 2 {
                phase_two = true;
            }
            checkpoint = transition.next;
            accepted = true;
            actions += 1;
            break;
        }
        if !accepted {
            break;
        }
    }
    let state = &checkpoint.state;
    if state.phase.terminal() {
        phase_two |= state.boss.phase == 2;
    }
    (state.phase, state.round_index, actions, phase_two)
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
    let mut wins = 0u32;
    let mut losses = 0u32;
    let mut unresolved = 0u32;
    let mut phase_two = 0u32;
    let mut rounds = 0u64;
    let mut actions = 0u64;
    for seed in 1..=u64::from(seeds) {
        let (phase, round, count, transformed) = play(rules, policy, seed);
        rounds += u64::from(round);
        actions += count;
        if transformed {
            phase_two += 1;
        }
        match phase {
            CoopPhase::Won => wins += 1,
            CoopPhase::Lost => losses += 1,
            CoopPhase::Ready | CoopPhase::Playing => unresolved += 1,
        }
    }
    Ok(SimulationReport {
        policy,
        seeds,
        wins,
        losses,
        unresolved,
        phase_two_reached: phase_two,
        total_actions: actions,
        average_rounds_milli: rounds.saturating_mul(1_000) / u64::from(seeds),
        average_actions_milli: actions.saturating_mul(1_000) / u64::from(seeds),
    })
}
