//! Deterministic cooperative measurement harness.
//!
//! The policy sees only committed public state. It proposes actions in priority
//! order and lets the reducer reject illegal, unaffordable or out-of-turn ones,
//! so no cost, cooldown or balance rule is duplicated here.
use super::{ArtifactLoadout, EquippedArtifact, SkillLevelBinding};
use aetheria_game_core::{
    Command, Decision, Error, LogicalClock, Reducer, Ruleset, SecretSeed, TurnRng, Value, apply,
    begin,
};
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::collections::BTreeMap;

use super::config::EffectKind;
use super::{
    CELLS, CoopAction, CoopError, CoopPhase, CoopRules, CoopState, PendingAttack, SEATS, SeatInput,
    Tile, TileIdentity, TileKind, TurnObservation,
};

const LOGICAL_ACTION_MS: u64 = 1_000;
pub const DEFAULT_EVAL_BUDGET: u32 = 4_096;
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
    pub phase_two_actions: u64,
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
    pub contributions: Vec<SeatContribution>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisReport {
    pub seed_start: u32,
    #[serde(flatten)]
    pub report: SimulationReport,
    pub diagnostics: Diagnostics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub team_wipes: u32,
    pub round_limit_defeats: u32,
    pub other_defeats: u32,
    pub first_damage_turns_sum: u64,
    pub matches_with_damage: u32,
    pub transformation_turns_sum: u64,
    pub terminal_boss_hp_sum: u64,
    pub surviving_seats_sum: u64,
    pub damage_taken_by_seat: [u64; SEATS],
    pub attacks_received_by_seat: [u64; SEATS],
    pub terminal_mana_sum: u64,
    pub terminal_rage_sum: u64,
    pub ability_checks_blocked_by_resources: u64,
    pub ability_checks_blocked_by_cooldown: u64,
    pub ability_checks_ready: u64,
    pub immune_actor_turns: u64,
    pub guards: u64,
    pub healing_capacity: u64,
    pub mana_at_defeat: u64,
    pub rage_at_defeat: u64,
    pub survivals_by_seat: [u32; SEATS],
    pub board: BoardDiagnostics,
    pub combat: CombatDiagnostics,
    pub advanced_jewels: AdvancedDiagnostics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDiagnostics {
    /// One observation per committed playing turn, including the opening.
    pub legal_swaps_per_turn: BTreeMap<usize, u64>,
    /// Committed scoring waves per accepted swap, including the initiating clear.
    pub match_waves_per_swap: BTreeMap<usize, u64>,
    pub cascade_cap_events: u64,
    pub advanced_tiles_per_turn: BTreeMap<usize, u64>,
    pub refill_swap_checks: u64,
    pub dead_board_regenerations: u64,
    pub forced_cascade_regenerations: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub natural_spawns: Option<NaturalSpawnDiagnostics>,
}

/// Observations from schema 6 only. Every count vector follows `kind_order`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NaturalSpawnDiagnostics {
    pub kind_order: [&'static str; TileKind::SHARED.len()],
    /// Tiles placed by the valid opening builder.
    pub opening: [u64; TileKind::SHARED.len()],
    /// Fresh tiles drawn during all gravity and cascade passes.
    pub refill: [u64; TileKind::SHARED.len()],
    /// Tiles present on final recovered boards, excluding discarded attempts.
    pub recovery: [u64; TileKind::SHARED.len()],
}

impl Default for NaturalSpawnDiagnostics {
    fn default() -> Self {
        Self {
            kind_order: TileKind::SHARED.map(TileKind::name),
            opening: [0; TileKind::SHARED.len()],
            refill: [0; TileKind::SHARED.len()],
            recovery: [0; TileKind::SHARED.len()],
        }
    }
}

impl NaturalSpawnDiagnostics {
    fn accumulate(&mut self, counts: Self) {
        for (totals, counts) in [
            (&mut self.opening, counts.opening),
            (&mut self.refill, counts.refill),
            (&mut self.recovery, counts.recovery),
        ] {
            for (total, count) in totals.iter_mut().zip(counts) {
                *total += count;
            }
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatDiagnostics {
    pub player_turns: u64,
    pub boss_hp_damage: u64,
    pub mana_generated: u64,
    pub rage_generated: u64,
    pub healing_effective: u64,
    pub skill_healing_effective: u64,
    pub shielding_granted: u64,
    pub shield_absorbed: u64,
    pub first_skill_turns_sum: u64,
    pub matches_with_skill: u32,
    pub first_ultimate_turns_sum: u64,
    pub matches_with_ultimate: u32,
    pub budget_exhausted: u32,
    pub no_accepted_action: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedDiagnostics {
    pub tiles_generated_by_kind: BTreeMap<String, u64>,
    pub generation_no_ops_by_kind: BTreeMap<String, u64>,
    pub matched_groups_by_kind: BTreeMap<String, u64>,
    pub matched_group_sizes_by_kind: BTreeMap<String, BTreeMap<u64, u64>>,
    pub statuses_cleansed: u64,
    pub chilled_attacks: u64,
    pub chilled_damage_prevented_before_shield: u64,
    pub amplified_tiers: BTreeMap<u64, u64>,
    pub matches_using_advanced_jewels: u32,
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
    phase_two_actions: u64,
    state: CoopState,
    actions: u64,
    multiplier_seen: bool,
    swaps_using_visible_multiplier: u64,
    player_criticals: u64,
    casts_by_skill: BTreeMap<String, u64>,
    mana_spent: u64,
    rage_spent: u64,
}

/// The engine still applies and hashes the same decision. This captures only
/// transient measurements the durable state and events cannot represent.
struct ObservedReducer<'a> {
    rules: &'a CoopRules,
    last: Cell<TurnObservation>,
}

impl Reducer for ObservedReducer<'_> {
    type State = CoopState;
    type Action = CoopAction;

    fn ruleset(&self) -> Ruleset {
        self.rules.ruleset()
    }

    fn validate(&self, state: &CoopState) -> Result<(), Error> {
        self.rules.validate(state)
    }

    fn reduce(
        &self,
        state: &CoopState,
        action: &CoopAction,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<CoopState>, Error> {
        // Mirror the CoopRules Reducer contract. Its stamped command entry
        // point is exercised independently by authenticated runtime tests.
        let mut observation = TurnObservation {
            natural_spawns: self
                .rules
                .config()
                .shared_jewel_rng()
                .then(NaturalSpawnDiagnostics::default),
            ..TurnObservation::default()
        };
        let decision = self
            .rules
            .reduce_observed(state, *action, None, rng, &mut observation)?;
        self.last.set(observation);
        Ok(decision)
    }
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
                    let config = rules.config();
                    weight += match tile.identity {
                        TileIdentity::Element(element) => {
                            let element_weight = if element == own {
                                config.damage.own_tile_weight_pm
                            } else {
                                1000
                            };
                            u64::from(config.multiplier.damage_weight(tile.multiplier).ok()?)
                                * u64::from(element_weight)
                        }
                        TileIdentity::Kind(kind) => {
                            let policy = config.board.functional_tiles.as_ref()?;
                            let actor = &state.participants[state.active_seat];
                            let unit =
                                u64::from(config.multiplier.resource_weight(tile.multiplier).ok()?);
                            // Rank visible combat opportunities by damage, usable
                            // recovery/protection and missing resources. These
                            // are policy preferences, never reducer rules.
                            match kind {
                                TileKind::Sword => {
                                    u64::from(
                                        config.multiplier.damage_weight(tile.multiplier).ok()?,
                                    ) * u64::from(policy.sword_contribution_pm)
                                }
                                TileKind::Mana => {
                                    unit * 50
                                        * u64::from(
                                            policy
                                                .mana_per_tile
                                                .min(config.resources.mana_cap - actor.mana),
                                        )
                                }
                                TileKind::Rage => {
                                    unit * 50
                                        * u64::from(
                                            policy
                                                .rage_per_tile
                                                .min(config.resources.rage_cap - actor.rage),
                                        )
                                }
                                TileKind::Heart => {
                                    unit * 100
                                        * u64::from(
                                            policy.heart.amount.min(actor.max_hp - actor.hp),
                                        )
                                }
                                TileKind::Shield => unit * 100 * u64::from(policy.shield.amount),
                                TileKind::Special => {
                                    let super::functional::SpecialPolicy::ResourceCombo {
                                        mana,
                                        rage,
                                    } = policy.special;
                                    unit * 50
                                        * (u64::from(
                                            mana.min(config.resources.mana_cap - actor.mana),
                                        ) + u64::from(
                                            rage.min(config.resources.rage_cap - actor.rage),
                                        ))
                                }
                                // The policy will still take an advanced match
                                // that is its best legal visible move.
                                TileKind::Nature | TileKind::Frost | TileKind::Astral => 0,
                            }
                        }
                    };
                    count += 1;
                    multiplier |= tile.multiplier > 1;
                }
            }
            if count > 0 && (best.is_none() || weight > best_weight) {
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

fn legal_swap_count(rules: &CoopRules, state: &CoopState) -> usize {
    (0..CELLS)
        .flat_map(|first| [(first, first + 1), (first, first + super::SIDE)])
        .filter(|&(first, second)| rules.swap_matches(state, first, second))
        .count()
}

fn advanced_tile_count(board: &[Option<Tile>; CELLS]) -> usize {
    board
        .iter()
        .flatten()
        .filter(|tile| match tile.identity {
            TileIdentity::Kind(kind) => kind.advanced(),
            TileIdentity::Element(_) => false,
        })
        .count()
}

fn party_resources(state: &CoopState) -> (u64, u64) {
    state
        .participants
        .iter()
        .fold((0, 0), |(mana, rage), seat| {
            (mana + u64::from(seat.mana), rage + u64::from(seat.rage))
        })
}

fn record_action(
    diagnostics: &mut Diagnostics,
    state: &CoopState,
    next: &CoopState,
    action: CoopAction,
    costs: (u64, u64),
    events: &[Value],
) -> bool {
    use Value::{List, Text, Uint};
    let mut waves = 0;
    let mut used_advanced = false;
    for event in events {
        let List(fields) = event else { continue };
        let [Text(kind), seat, Uint(value)] = fields.as_slice() else {
            continue;
        };
        match kind.as_str() {
            "match" => {
                waves += 1;
                diagnostics.combat.boss_hp_damage += value;
            }
            "boss-damage" => diagnostics.combat.boss_hp_damage += value,
            "boss-dot" if matches!(seat, Value::Null) => diagnostics.combat.boss_hp_damage += value,
            "heal" => {
                diagnostics.combat.healing_effective += value;
                if !matches!(action, CoopAction::Swap { .. }) {
                    diagnostics.combat.skill_healing_effective += value;
                }
            }
            "cascade-cap" => diagnostics.board.cascade_cap_events += 1,
            "nature-cleanse" => diagnostics.advanced_jewels.statuses_cleansed += value,
            "chill-consumed" => diagnostics.advanced_jewels.chilled_attacks += 1,
            "chill-prevented" => {
                diagnostics
                    .advanced_jewels
                    .chilled_damage_prevented_before_shield += value;
            }
            "astral-upgrade" => {
                *diagnostics
                    .advanced_jewels
                    .amplified_tiers
                    .entry(*value)
                    .or_default() += 1;
            }
            "generated-nature" | "generated-frost" | "generated-astral" => {
                let jewel = kind.trim_start_matches("generated-");
                let (counts, count) = if *value == 0 {
                    (
                        &mut diagnostics.advanced_jewels.generation_no_ops_by_kind,
                        1,
                    )
                } else {
                    (
                        &mut diagnostics.advanced_jewels.tiles_generated_by_kind,
                        *value,
                    )
                };
                *counts.entry(jewel.into()).or_default() += count;
            }
            "matched-nature" | "matched-frost" | "matched-astral" => {
                used_advanced = true;
                let jewel = kind.trim_start_matches("matched-");
                let metrics = &mut diagnostics.advanced_jewels;
                *metrics
                    .matched_groups_by_kind
                    .entry(jewel.into())
                    .or_default() += 1;
                *metrics
                    .matched_group_sizes_by_kind
                    .entry(jewel.into())
                    .or_default()
                    .entry(*value)
                    .or_default() += 1;
            }
            _ => {}
        }
    }
    if matches!(action, CoopAction::Swap { .. }) {
        *diagnostics
            .board
            .match_waves_per_swap
            .entry(waves)
            .or_default() += 1;
    }
    diagnostics.combat.player_turns += u64::from(next.turn_index - state.turn_index);
    let (before_mana, before_rage) = party_resources(state);
    let (after_mana, after_rage) = party_resources(next);
    // Summing all seats keeps Rage transfers neutral. The committed delta plus
    // paid costs measures usable generation after caps.
    diagnostics.combat.mana_generated += (after_mana + costs.0).saturating_sub(before_mana);
    diagnostics.combat.rage_generated += (after_rage + costs.1).saturating_sub(before_rage);
    // Ability contribution may be credited to recipients on legacy bundles.
    diagnostics.combat.shielding_granted += state
        .participants
        .iter()
        .zip(&next.participants)
        .map(|(before, after)| after.contribution_shielding - before.contribution_shielding)
        .sum::<u64>();
    used_advanced
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
                if rules.config.shared_jewel_rng() {
                    if let Some(action) = visible_telegraph_response(rules, state) {
                        out.push(action);
                    }
                } else {
                    prioritize_support(rules, state, &mut out);
                }
            }
            if let Some(action) = swap.filter(|action| priority_swap && !out.contains(action)) {
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
            .zip(rules.opponent_element().ok())
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
/// A telegraph reveals its assigned damage and target count. Evaluate only the
/// first visible support effect and the already committed impact, never a refill
/// or future roll. Prefer a rescue, otherwise require appreciable mitigation.
fn visible_telegraph_response(rules: &CoopRules, state: &CoopState) -> Option<CoopAction> {
    let pending = state.pending.filter(|attack| attack.remaining == 1)?;
    let before = known_impact(rules, state.clone(), pending);
    let mut best = None;
    let mut consider = |action, preview| {
        let after = known_impact(rules, preview, pending);
        let preserves_life = after.0 > before.0;
        let saves_health =
            after.0 == before.0 && after.1.saturating_sub(before.1) > u64::from(pending.damage / 5);
        if (preserves_life || saves_health) && best.is_none_or(|(_, score)| after > score) {
            best = Some((action, after));
        }
    };

    // Authored support casts in this whitelist are deterministic. The dummy
    // stream has no match entropy. Exclude any preview that consumed a draw.
    let seed = SecretSeed::from_host_entropy([0; 32]);
    let mut dummy = seed.stream(Value::Text("visible-support".into()), 0).ok()?;
    for action in [
        CoopAction::Guard,
        CoopAction::Skill,
        CoopAction::Signature,
        CoopAction::Ultimate,
    ] {
        let Ok(cast) = rules.prepare_ability(state, action) else {
            continue;
        };
        let kind = cast.skill.effect.kind;
        if !matches!(
            kind,
            EffectKind::Heal | EffectKind::Shield | EffectKind::Cleanse
        ) && !(action == CoopAction::Guard && kind == EffectKind::Buff)
        {
            continue;
        }
        let mut preview = state.clone();
        let cursor = dummy.cursor();
        if rules
            .act_ability(&mut preview, action, &mut dummy, &mut Vec::new())
            .is_ok()
            && dummy.cursor() == cursor
        {
            consider(action, preview);
        }
    }

    for first in 0..CELLS {
        for second in [first + 1, first + super::SIDE] {
            if second < CELLS
                && super::adjacent(first, second)
                && let Some(preview) = preview_jewel_support(rules, state, first, second)
            {
                consider(
                    CoopAction::Swap {
                        first: first as u8,
                        second: second as u8,
                    },
                    preview,
                );
            }
        }
    }
    best.map(|(action, _)| action)
}

fn known_impact(rules: &CoopRules, mut state: CoopState, attack: PendingAttack) -> (usize, u64) {
    rules.apply_boss_attack(&mut state, attack.targets, attack.damage, &mut Vec::new());
    state
        .participants
        .into_iter()
        .fold((0, 0), |(alive, hp), seat| {
            (alive + usize::from(seat.alive), hp + u64::from(seat.hp))
        })
}

fn preview_jewel_support(
    rules: &CoopRules,
    state: &CoopState,
    first: usize,
    second: usize,
) -> Option<CoopState> {
    let policy = rules.config.board.functional_tiles.as_ref()?;
    let mut board = state.board;
    if board[first]?.identity == board[second]?.identity {
        return None;
    }
    board.swap(first, second);
    let matched = super::matched_cells(&board);
    if !matched[first] && !matched[second] {
        return None;
    }
    let mut visible_support = false;
    let (mut heart, mut shield) = (0, 0);
    for (marked, tile) in matched.into_iter().zip(board) {
        let Some(tile) = tile.filter(|_| marked) else {
            continue;
        };
        let (amount, total) = match tile.identity {
            TileIdentity::Kind(TileKind::Heart) => (policy.heart.amount, &mut heart),
            TileIdentity::Kind(TileKind::Shield) => (policy.shield.amount, &mut shield),
            TileIdentity::Kind(TileKind::Nature | TileKind::Frost) => {
                visible_support = true;
                continue;
            }
            _ => continue,
        };
        visible_support = true;
        let scale = rules
            .config
            .multiplier
            .resource_weight(tile.multiplier)
            .ok()?;
        *total += u64::from(amount) * u64::from(scale) / 1_000;
    }
    if !visible_support {
        return None;
    }
    let mut preview = state.clone();
    preview.board = board;
    let mut events = Vec::new();
    rules.advanced_matches(&mut preview, &mut events);
    rules.apply_jewel_support(
        &mut preview,
        policy,
        state.active_seat,
        heart,
        shield,
        &mut events,
    );
    Some(preview)
}

fn prioritize_support(rules: &CoopRules, state: &CoopState, out: &mut Vec<CoopAction>) {
    let active = &state.participants[state.active_seat];
    let low_health = |seat: &super::Participant| u64::from(seat.hp) * 2 < u64::from(seat.max_hp);
    let living = state.participants.iter().filter(|seat| seat.alive).count();
    if state.pending.is_some_and(|pending| {
        pending.remaining <= 1
            && (low_health(active)
                || (rules.seat_count() != 1 && usize::from(pending.targets) >= living))
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
    eval_budget: u32,
    mut diagnostics: Option<&mut Diagnostics>,
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
    let mut phase_two_actions = 0;
    let mut multiplier_seen = false;
    let mut swaps_using_visible_multiplier = 0;
    let mut player_criticals = 0;
    let mut casts_by_skill = BTreeMap::new();
    let mut mana_spent = 0;
    let mut rage_spent = 0;
    let mut first_damage_turn = None;
    let mut first_skill_turn = None;
    let mut first_ultimate_turn = None;
    let mut round_limit = false;
    let mut stalled = false;
    let mut used_advanced = false;
    let mut previous_board = None;
    let observer = diagnostics.is_some().then(|| ObservedReducer {
        rules,
        last: Cell::default(),
    });
    for step in 0..eval_budget {
        if checkpoint.state.phase.terminal() {
            break;
        }
        let state = &checkpoint.state;
        if state.phase == CoopPhase::Playing
            && let Some(diagnostics) = diagnostics.as_deref_mut()
        {
            let legal_swaps = match previous_board {
                Some((board, count)) if board == state.board => count,
                _ => {
                    let count = legal_swap_count(rules, state);
                    previous_board = Some((state.board, count));
                    count
                }
            };
            *diagnostics
                .board
                .legal_swaps_per_turn
                .entry(legal_swaps)
                .or_default() += 1;
            *diagnostics
                .board
                .advanced_tiles_per_turn
                .entry(advanced_tile_count(&state.board))
                .or_default() += 1;
            let seat = &state.participants[state.active_seat];
            let pet = rules
                .config()
                .pet(&seat.pet_id)
                .ok_or(CoopError::InvalidSeat)?;
            diagnostics.immune_actor_turns += u64::from(
                pet.element()
                    .ok()
                    .zip(rules.opponent_element().ok())
                    .is_some_and(|(element, boss)| rules.effectiveness(element, boss) == 0),
            );
            let slots = [
                CoopAction::Guard,
                CoopAction::Skill,
                CoopAction::Signature,
                CoopAction::Ultimate,
                CoopAction::FireZone,
            ];
            for (slot, skill_id) in pet.skill_ids().iter().enumerate().skip(1) {
                let Some(skill) = skill_id.and_then(|id| rules.config().skill(id)) else {
                    continue;
                };
                if seat.cooldowns[slot] > 0 {
                    diagnostics.ability_checks_blocked_by_cooldown += 1;
                } else if seat.mana < skill.mana_cost || seat.rage < skill.rage_cost {
                    diagnostics.ability_checks_blocked_by_resources += 1;
                } else if rules.prepare_ability(state, slots[slot]).is_ok() {
                    diagnostics.ability_checks_ready += 1;
                }
            }
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
            let clock = LogicalClock {
                server_tick: step,
                logical_time_ms: step * LOGICAL_ACTION_MS,
            };
            let result = match &observer {
                Some(observer) => apply(observer, &checkpoint, &command, &secret, clock),
                None => apply(rules, &checkpoint, &command, &secret, clock),
            };
            let Ok(transition) = result else {
                continue;
            };
            phase_two_actions += u64::from(checkpoint.state.boss.transformed);
            multiplier_seen |= transition
                .next
                .state
                .board
                .iter()
                .flatten()
                .any(|tile| tile.multiplier > 1);
            let mut costs = (0, 0);
            if let CoopAction::Swap { first, second } = action {
                let mut board = checkpoint.state.board;
                board.swap(usize::from(first), usize::from(second));
                swaps_using_visible_multiplier +=
                    u64::from(super::matched_cells(&board).into_iter().zip(board).any(
                        |(matched, tile)| matched && tile.is_some_and(|tile| tile.multiplier > 1),
                    ));
            } else if let Ok(cast) = rules.prepare_ability(&checkpoint.state, action) {
                *casts_by_skill.entry(cast.skill.id.clone()).or_default() += 1;
                costs = (
                    u64::from(cast.skill.mana_cost),
                    u64::from(cast.skill.rage_cost),
                );
                mana_spent += costs.0;
                rage_spent += costs.1;
                if cast.skill.effect.kind == EffectKind::Heal
                    && let Some(diagnostics) = diagnostics.as_deref_mut()
                {
                    let targets = rules.targets(state, state.active_seat, cast.skill.effect.target);
                    let per_target = super::scale_effect(cast.skill.effect.value, cast.power_pm)?;
                    diagnostics.healing_capacity += u64::from(per_target) * targets.len() as u64;
                }
            }
            player_criticals += transition.events.iter().filter(|event| matches!(event,
                aetheria_game_core::Value::List(fields) if matches!(fields.first(),Some(aetheria_game_core::Value::Text(kind)) if kind=="critical"))).count() as u64;
            if let Some(diagnostics) = diagnostics.as_deref_mut() {
                let next = &transition.next.state;
                if let Some(observer) = &observer {
                    let observation = observer.last.take();
                    diagnostics.board.refill_swap_checks += observation.refill_swap_checks;
                    diagnostics.board.dead_board_regenerations +=
                        observation.dead_board_regenerations;
                    diagnostics.board.forced_cascade_regenerations +=
                        observation.forced_cascade_regenerations;
                    diagnostics.combat.shield_absorbed += observation.shield_absorbed;
                    if let Some(counts) = observation.natural_spawns {
                        diagnostics
                            .board
                            .natural_spawns
                            .get_or_insert_default()
                            .accumulate(counts);
                    }
                }
                used_advanced |=
                    record_action(diagnostics, state, next, action, costs, &transition.events);
                if matches!(action, CoopAction::Skill) {
                    first_skill_turn.get_or_insert(next.turn_index);
                }
                if matches!(action, CoopAction::Ultimate) {
                    first_ultimate_turn.get_or_insert(next.turn_index);
                }
                if first_damage_turn.is_none()
                    && next
                        .participants
                        .iter()
                        .any(|seat| seat.contribution_damage > 0)
                {
                    first_damage_turn = Some(next.turn_index);
                }
                if !state.boss.transformed && next.boss.transformed {
                    diagnostics.transformation_turns_sum += u64::from(next.turn_index);
                }
                diagnostics.guards += u64::from(matches!(action, CoopAction::Guard));
                for event in &transition.events {
                    let aetheria_game_core::Value::List(fields) = event else {
                        continue;
                    };
                    use aetheria_game_core::Value::{Text, Uint};
                    match fields.as_slice() {
                        [Text(kind), Uint(seat), Uint(taken)] if kind == "boss-attack" => {
                            let seat = *seat as usize;
                            diagnostics.attacks_received_by_seat[seat] += 1;
                            diagnostics.damage_taken_by_seat[seat] += taken;
                        }
                        [Text(kind), _, _] if kind == "round-limit" => round_limit = true,
                        _ => {}
                    }
                }
            }
            checkpoint = transition.next;
            accepted = true;
            actions += 1;
            break;
        }
        if !accepted {
            stalled = true;
            break;
        }
    }
    if let Some(diagnostics) = diagnostics {
        if let Some(turn) = first_damage_turn {
            diagnostics.matches_with_damage += 1;
            diagnostics.first_damage_turns_sum += u64::from(turn);
        }
        let final_state = &checkpoint.state;
        if let Some(turn) = first_skill_turn {
            diagnostics.combat.matches_with_skill += 1;
            diagnostics.combat.first_skill_turns_sum += u64::from(turn);
        }
        if let Some(turn) = first_ultimate_turn {
            diagnostics.combat.matches_with_ultimate += 1;
            diagnostics.combat.first_ultimate_turns_sum += u64::from(turn);
        }
        if !final_state.phase.terminal() {
            diagnostics.combat.no_accepted_action += u32::from(stalled);
            diagnostics.combat.budget_exhausted += u32::from(!stalled);
        }
        diagnostics.advanced_jewels.matches_using_advanced_jewels += u32::from(used_advanced);
        if final_state.phase == CoopPhase::Lost {
            if round_limit {
                diagnostics.round_limit_defeats += 1;
            } else if final_state.participants.iter().all(|seat| !seat.alive) {
                diagnostics.team_wipes += 1;
            } else {
                diagnostics.other_defeats += 1;
            }
        }
        diagnostics.terminal_boss_hp_sum += u64::from(final_state.boss.hp);
        for (index, seat) in final_state.participants.iter().enumerate() {
            diagnostics.surviving_seats_sum += u64::from(seat.alive);
            diagnostics.survivals_by_seat[index] += u32::from(seat.alive);
            diagnostics.terminal_mana_sum += u64::from(seat.mana);
            diagnostics.terminal_rage_sum += u64::from(seat.rage);
            if final_state.phase == CoopPhase::Lost {
                diagnostics.mana_at_defeat += u64::from(seat.mana);
                diagnostics.rage_at_defeat += u64::from(seat.rage);
            }
        }
    }
    Ok(Sample {
        phase_two_actions,
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

/// Run the authored reducer with an explicit technical evaluation step budget.
pub fn simulate_with_budget(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
    eval_budget: u32,
) -> Result<SimulationReport, CoopError> {
    simulate_party_with_budget(rules, policy, seeds, None, eval_budget)
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
    simulate_party_with_budget(rules, policy, seeds, party, DEFAULT_EVAL_BUDGET)
}

pub fn simulate_party_with_budget(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
    party: Option<&[SimulationSeat; SEATS]>,
    eval_budget: u32,
) -> Result<SimulationReport, CoopError> {
    simulate_range(rules, policy, 1, seeds, party, eval_budget, None)
}

/// Compare one-seat play using the same visible-information policies as co-op.
pub fn simulate_solo(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
    seat: &SimulationSeat,
) -> Result<SimulationReport, CoopError> {
    simulate_solo_with_budget(rules, policy, seeds, seat, DEFAULT_EVAL_BUDGET)
}

pub fn simulate_solo_with_budget(
    rules: &CoopRules,
    policy: Policy,
    seeds: u32,
    seat: &SimulationSeat,
    eval_budget: u32,
) -> Result<SimulationReport, CoopError> {
    simulate_solo_range(rules, policy, 1, seeds, seat, eval_budget, None)
}

pub fn analyze_solo(
    rules: &CoopRules,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    seat: &SimulationSeat,
) -> Result<AnalysisReport, CoopError> {
    let mut diagnostics = Diagnostics::default();
    let report = simulate_solo_range(
        rules,
        policy,
        seed_start,
        seeds,
        seat,
        DEFAULT_EVAL_BUDGET,
        Some(&mut diagnostics),
    )?;
    Ok(AnalysisReport {
        seed_start,
        report,
        diagnostics,
    })
}

fn simulate_solo_range(
    rules: &CoopRules,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    seat: &SimulationSeat,
    eval_budget: u32,
    diagnostics: Option<&mut Diagnostics>,
) -> Result<SimulationReport, CoopError> {
    if seed_start == 0 || seeds == 0 || seeds > COMPARISON_MAX_SEEDS || eval_budget == 0 {
        return Err(CoopError::InvalidSeat);
    }
    let input = SeatInput {
        account: "simulation-seat-0".into(),
        pet_id: seat.pet_id.clone(),
        owned_pet_instance_id: "simulation-instance-0".into(),
        level: seat.level,
        artifact_power_pm: 0,
    };
    let mut entries = seat.artifacts.clone();
    entries.sort_by_key(|item| item.slot.code());
    let loadout = ArtifactLoadout {
        digest: ArtifactLoadout::digest(rules.digest(), &input, &entries),
        entries,
    };
    let mut initial = rules.allocate_solo(input, &loadout)?;
    rules.bind_skill_levels(&mut initial, std::slice::from_ref(&seat.skill_levels))?;
    run_samples(
        rules,
        &initial,
        policy,
        seed_start,
        seeds,
        eval_budget,
        diagnostics,
    )
}

/// Offline-only analysis with an explicit, bounded seed range. The online
/// Studio continues to use the existing simulation report and fixed seeds.
pub fn analyze_party(
    rules: &CoopRules,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    party: Option<&[SimulationSeat; SEATS]>,
) -> Result<AnalysisReport, CoopError> {
    analyze_party_with_budget(rules, policy, seed_start, seeds, party, DEFAULT_EVAL_BUDGET)
}

pub fn analyze_party_with_budget(
    rules: &CoopRules,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    party: Option<&[SimulationSeat; SEATS]>,
    eval_budget: u32,
) -> Result<AnalysisReport, CoopError> {
    let mut diagnostics = Diagnostics::default();
    let report = simulate_range(
        rules,
        policy,
        seed_start,
        seeds,
        party,
        eval_budget,
        Some(&mut diagnostics),
    )?;
    Ok(AnalysisReport {
        seed_start,
        report,
        diagnostics,
    })
}

fn simulate_range(
    rules: &CoopRules,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    party: Option<&[SimulationSeat; SEATS]>,
    eval_budget: u32,
    diagnostics: Option<&mut Diagnostics>,
) -> Result<SimulationReport, CoopError> {
    if seed_start == 0
        || seeds == 0
        || eval_budget == 0
        || (diagnostics.is_some() && seeds > COMPARISON_MAX_SEEDS)
        || seeds > 1_000
    {
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
    run_samples(
        rules,
        &initial,
        policy,
        seed_start,
        seeds,
        eval_budget,
        diagnostics,
    )
}

fn run_samples(
    rules: &CoopRules,
    initial: &CoopState,
    policy: Policy,
    seed_start: u32,
    seeds: u32,
    eval_budget: u32,
    mut diagnostics: Option<&mut Diagnostics>,
) -> Result<SimulationReport, CoopError> {
    let mut report = SimulationReport {
        boss_id: rules.encounter_id().into(),
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
        phase_two_actions: 0,
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
            .iter()
            .map(|participant| SeatContribution {
                pet_id: participant.pet_id.clone(),
                damage: 0,
                healing: 0,
                shielding: 0,
            })
            .collect(),
    };
    let mut rounds = 0u64;
    for seed in u64::from(seed_start)..u64::from(seed_start) + u64::from(seeds) {
        let sample = play(
            rules,
            initial,
            policy,
            seed,
            eval_budget,
            diagnostics.as_deref_mut(),
        )?;
        rounds += u64::from(sample.state.round_index);
        report.total_actions += sample.actions;
        report.phase_two_actions += sample.phase_two_actions;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_policy_values_visible_frost_when_it_prevents_a_knockout() {
        let bundle = include_bytes!(
            "../../../../../config/gameplay/arena8-coop-shared-rng-v1.candidate.json"
        );
        let rules = CoopRules::load(bundle, "cinder-terraces-warden".into()).unwrap();
        let ready = rules
            .allocate(std::array::from_fn(|index| SeatInput {
                account: format!("sample-account-{index}"),
                pet_id: "fire-coalwhisk".into(),
                owned_pet_instance_id: format!("sample-pet-{index}"),
                level: 20,
                artifact_power_pm: 0,
            }))
            .unwrap();
        let entropy = SecretSeed::from_host_entropy([7; 32]);
        let mut stream = entropy.stream(Value::Text("fixture".into()), 0).unwrap();
        let mut state = rules
            .reduce(&ready, CoopAction::Start, &mut stream)
            .unwrap()
            .state;
        state.board = std::array::from_fn(|index| {
            let kind = if [0, 1, 10].contains(&index) {
                TileKind::Frost
            } else {
                TileKind::ALL[(index / super::super::SIDE + 2 * (index % super::super::SIDE)) % 6]
            };
            Some(Tile {
                identity: TileIdentity::Kind(kind),
                multiplier: 1,
            })
        });
        state.participants[0].hp = 100;
        state.participants[0].defense = 8;
        state.pending = Some(PendingAttack {
            targets: 1,
            remaining: 1,
            damage: 110,
        });
        let before = state.clone();
        assert_eq!(
            visible_telegraph_response(&rules, &state),
            Some(CoopAction::Swap {
                first: 2,
                second: 10,
            })
        );
        assert_eq!(state, before);

        // Exclude a nominal mitigation when the committed hit is still fatal.
        state.pending.as_mut().unwrap().damage = 400;
        assert_eq!(visible_telegraph_response(&rules, &state), None);
    }

    #[test]
    fn observations_preserve_committed_decisions_and_distinguish_budget_exhaustion() {
        let bundle = include_bytes!(
            "../../../../../config/gameplay/arena8-coop-functional-v2.candidate.json"
        );
        let rules = CoopRules::load(bundle, "cinder-terraces-warden".into()).unwrap();
        let initial = rules
            .allocate(std::array::from_fn(|index| SeatInput {
                account: format!("sample-account-{index}"),
                pet_id: "fire-coalwhisk".into(),
                owned_pet_instance_id: format!("sample-pet-{index}"),
                level: 20,
                artifact_power_pm: 0,
            }))
            .unwrap();
        let secret = SecretSeed::from_host_entropy([7; 32]);
        let clock = LogicalClock {
            server_tick: 1,
            logical_time_ms: 1000,
        };
        let checkpoint = begin(&rules, [2; 16], initial, &secret, clock).unwrap();
        let observer = ObservedReducer {
            rules: &rules,
            last: Cell::default(),
        };
        let command = Command {
            id: command_id(0, 0),
            match_id: checkpoint.match_id,
            expected_version: checkpoint.version,
            ruleset: rules.ruleset(),
            action: CoopAction::Start,
        };
        let opening = apply(&rules, &checkpoint, &command, &secret, clock).unwrap();
        let swap = rules.legal_swap(&opening.next.state).unwrap();
        let command = Command {
            id: command_id(1, 0),
            expected_version: opening.next.version,
            action: CoopAction::Swap {
                first: swap.0,
                second: swap.1,
            },
            ..command
        };
        let original = apply(&rules, &opening.next, &command, &secret, clock).unwrap();
        let observed = apply(&observer, &opening.next, &command, &secret, clock).unwrap();
        assert_eq!(observed.next.audit_hash, original.next.audit_hash);
        assert_eq!(observed.next.rng_cursor, original.next.rng_cursor);
        assert_eq!(observed.events, original.events);
        assert!(observer.last.take().refill_swap_checks > 0);

        let analysis = analyze_party_with_budget(&rules, Policy::Basic, 1, 1, None, 1).unwrap();
        assert_eq!(analysis.report.unresolved, 1);
        assert_eq!(analysis.report.losses, 0);
        assert_eq!(analysis.diagnostics.combat.budget_exhausted, 1);
    }
}
