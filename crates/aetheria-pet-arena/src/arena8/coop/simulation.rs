//! Deterministic cooperative measurement harness.
//!
//! The policy sees only committed public state. It proposes actions in priority
//! order and lets the reducer reject illegal, unaffordable or out-of-turn ones,
//! so no cost, cooldown or balance rule is duplicated here.
use super::{ArtifactLoadout, EquippedArtifact, SkillLevelBinding};
use aetheria_game_core::{Command, LogicalClock, SecretSeed, apply, begin};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
    pub swaps_using_visible_multiplier: u64,
    pub player_criticals: u64,
    pub ability_casts: u64,
    pub casts_by_skill: BTreeMap<String, u64>,
    pub mana_spent: u64,
    pub rage_spent: u64,
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
    swaps_using_visible_multiplier: u64,
    player_criticals: u64,
    casts_by_skill: BTreeMap<String, u64>,
    mana_spent: u64,
    rage_spent: u64,
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

/// Rank only runs already visible after exchanging adjacent tiles. No refill,
/// cascade, critical roll or future Boss action is sampled by the policy.
fn visible_swap(rules: &CoopRules, state: &CoopState) -> Option<(CoopAction, bool)> {
    let own = rules
        .config()
        .pet(&state.participants[state.active_seat].pet_id)?
        .element()
        .ok()?;
    let mut best = None;
    let mut best_weight = 0;
    for first in 0..super::CELLS {
        for second in [first + 1, first + super::SIDE] {
            if second >= super::CELLS || !super::adjacent(first, second) {
                continue;
            }
            let mut board = state.board;
            board.swap(first, second);
            let mut weight = 0u64;
            let mut count = 0;
            let mut multiplier = false;
            for (matched, tile) in super::matched_cells(&board).into_iter().zip(board) {
                if let Some(tile) = tile.filter(|_| matched) {
                    let element_weight = if tile.element == own {
                        rules.config().damage.own_tile_weight_pm
                    } else {
                        1000
                    };
                    weight += u64::from(
                        rules
                            .config()
                            .multiplier
                            .damage_weight(tile.multiplier)
                            .ok()?,
                    ) * u64::from(element_weight);
                    count += 1;
                    multiplier |= tile.multiplier > 1;
                }
            }
            if weight > best_weight {
                best_weight = weight;
                best = Some((
                    CoopAction::Swap {
                        first: first as u8,
                        second: second as u8,
                    },
                    count >= 4 || multiplier,
                ));
            }
        }
    }
    best
}

// Sample a legal move from the visible board independently of the private
// match RNG. The random policy then chooses between swapping and casting.
fn random_visible_swap(
    rules: &CoopRules,
    state: &CoopState,
    prng: &mut SplitMix,
) -> Option<CoopAction> {
    let mut choices = Vec::new();
    for first in 0..super::CELLS {
        for second in [first + 1, first + super::SIDE] {
            if rules.swap_matches(state, first, second) {
                choices.push(CoopAction::Swap {
                    first: first as u8,
                    second: second as u8,
                });
            }
        }
    }
    if choices.is_empty() {
        return None;
    }
    let index = prng.next() % choices.len() as u64;
    Some(choices[index as usize])
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
    let (swap, priority_swap) = match policy {
        Policy::Random => (random_visible_swap(rules, state, prng), false),
        Policy::Tactical | Policy::Coordinated => visible_swap(rules, state)
            .map_or((None, false), |(action, priority)| (Some(action), priority)),
        Policy::Basic => (
            rules
                .legal_swap(state)
                .map(|(first, second)| CoopAction::Swap { first, second }),
            false,
        ),
    };
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
            if let Some(action) = swap.filter(|_| priority_swap) {
                out.push(action);
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
    if matches!(policy, Policy::Tactical | Policy::Coordinated) {
        let actor_element = rules
            .config()
            .pet(&state.participants[state.active_seat].pet_id)
            .and_then(|pet| pet.element().ok());
        let immune = actor_element
            .zip(rules.selected_boss().element().ok())
            .is_some_and(|(actor, boss)| rules.effectiveness(actor, boss) == 0);
        if immune {
            // Keep a legal last resort for custom kits with no support or board move.
            out.sort_by_key(|action| {
                rules.prepare_ability(state, *action).is_ok_and(|cast| {
                    matches!(
                        cast.skill.effect.kind,
                        EffectKind::Damage | EffectKind::DamageOverTime | EffectKind::ChainDamage
                    )
                })
            });
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
    let mut swaps_using_visible_multiplier = 0;
    let mut player_criticals = 0;
    let mut casts_by_skill = BTreeMap::new();
    let mut mana_spent = 0;
    let mut rage_spent = 0;
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
            if let CoopAction::Swap { first, second } = action {
                let mut board = checkpoint.state.board;
                board.swap(usize::from(first), usize::from(second));
                swaps_using_visible_multiplier +=
                    u64::from(super::matched_cells(&board).into_iter().zip(board).any(
                        |(matched, tile)| matched && tile.is_some_and(|tile| tile.multiplier > 1),
                    ));
            } else if let Ok(cast) = rules.prepare_ability(&checkpoint.state, action) {
                *casts_by_skill.entry(cast.skill.id.clone()).or_default() += 1;
                mana_spent += u64::from(cast.skill.mana_cost);
                rage_spent += u64::from(cast.skill.rage_cost);
            }
            player_criticals += transition.events.iter().filter(|event| matches!(event,
                aetheria_game_core::Value::List(fields) if matches!(fields.first(),Some(aetheria_game_core::Value::Text(kind)) if kind=="critical"))).count() as u64;
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
        swaps_using_visible_multiplier,
        player_criticals,
        casts_by_skill,
        mana_spent,
        rage_spent,
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
    simulate_party(rules, policy, seeds, None)
}

/// Hypothetical loadouts use the same binding and eligibility checks as a match.
/// Account and instance identities are local to each simulation seat.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulationSeat {
    pub pet_id: String,
    pub level: u8,
    pub artifacts: Vec<EquippedArtifact>,
    pub skill_levels: Vec<SkillLevelBinding>,
}

pub fn simulate_party(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
    party: Option<&[SimulationSeat; SEATS]>,
) -> Result<SimulationReport, CoopError> {
    if seeds == 0 || seeds > 1_000 {
        return Err(CoopError::InvalidSeat);
    }
    let pets = &rules.config().pets;
    let seats = std::array::from_fn(|index| SeatInput {
        account: format!("simulation-seat-{index}"),
        pet_id: party.map_or_else(
            || pets[index % pets.len()].id.clone(),
            |p| p[index].pet_id.clone(),
        ),
        owned_pet_instance_id: format!("simulation-instance-{index}"),
        level: party.map_or(1, |p| p[index].level),
        artifact_power_pm: 0,
    });
    let mut initial =
        if let Some(party) = party.filter(|p| p.iter().any(|s| !s.artifacts.is_empty())) {
            let mut instances = std::collections::BTreeSet::new();
            if !party
                .iter()
                .flat_map(|seat| &seat.artifacts)
                .all(|item| instances.insert(&item.artifact_id))
            {
                return Err(CoopError::InvalidSeat);
            }
            let loadouts = std::array::from_fn(|index| {
                let mut entries = party[index].artifacts.clone();
                entries.sort_by_key(|item| item.slot.code());
                ArtifactLoadout {
                    digest: ArtifactLoadout::digest(rules.digest(), &seats[index], &entries),
                    entries,
                }
            });
            rules.allocate_with_loadouts(seats, &loadouts)?
        } else {
            rules.allocate(seats)?
        };
    if let Some(party) = party {
        rules.bind_skill_levels(
            &mut initial,
            &party.each_ref().map(|seat| seat.skill_levels.clone()),
        )?;
    }
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
        swaps_using_visible_multiplier: 0,
        player_criticals: 0,
        ability_casts: 0,
        casts_by_skill: BTreeMap::new(),
        mana_spent: 0,
        rage_spent: 0,
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
        report.swaps_using_visible_multiplier += sample.swaps_using_visible_multiplier;
        report.player_criticals += sample.player_criticals;
        for (skill_id, casts) in sample.casts_by_skill {
            report.ability_casts += casts;
            *report.casts_by_skill.entry(skill_id).or_default() += casts;
        }
        report.mana_spent += sample.mana_spent;
        report.rage_spent += sample.rage_spent;
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
