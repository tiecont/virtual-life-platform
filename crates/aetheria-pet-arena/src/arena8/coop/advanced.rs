//! Schema 5 conversions run only on an explicitly bound encounter or cast.
//! No conversion, cleanse, chill or amplification consumes entropy.
use super::{
    CELLS, ConfigError, CoopConfig, CoopRules, CoopState, Participant, SIDE, StatusKind, Tile,
    TileIdentity, TileKind, event, matched_cells,
};
use aetheria_game_core::{Value, canonical::list};
use serde::Deserialize;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvancedJewels {
    pub nature_actor_limits: [u8; 3],
    pub nature_ally_limit_at_five: u8,
    pub frost_reduction_pm: [u16; 3],
    pub astral_upgrade_limits: [u8; 3],
    pub occupancy_limit: u8,
    pub encounters: Vec<AdvancedEncounter>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdvancedEncounter {
    pub encounter_id: String,
    pub opening: Option<Conversion>,
    pub skills: Vec<SkillConversion>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SkillConversion {
    pub skill_id: String,
    pub conversion: Conversion,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Conversion {
    pub kind: TileKind,
    pub count: u8,
}

impl Conversion {
    fn to_value(self) -> Value {
        list([
            Value::Text(self.kind.name().into()),
            Value::Uint(self.count.into()),
        ])
    }
}

pub(super) fn present_policy<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<AdvancedJewels>, D::Error> {
    AdvancedJewels::deserialize(deserializer).map(Some)
}

impl AdvancedJewels {
    pub(super) fn validate(&self, config: &CoopConfig) -> Result<(), ConfigError> {
        fn tiered<T: Ord + Copy>(values: [T; 3], min: T, max: T) -> bool {
            values.is_sorted() && values[0] >= min && values[2] <= max
        }
        // Four durable status slots per seat, 64 cells per board and a global x8 ceiling.
        if !tiered(self.nature_actor_limits, 1, 4)
            || !(1..=4).contains(&self.nature_ally_limit_at_five)
            || !tiered(self.frost_reduction_pm, 1, 999)
            || !tiered(self.astral_upgrade_limits, 1, CELLS as u8)
            || !(3..=CELLS as u8).contains(&self.occupancy_limit)
            || config
                .multiplier
                .schedule
                .iter()
                .flat_map(|s| &s.tiers)
                .any(|t| t.multiplier > 8)
        {
            return Err(ConfigError::FunctionalTiles);
        }
        let mut encounter_ids = BTreeSet::new();
        for enc in &self.encounters {
            if !encounter_ids.insert(enc.encounter_id.as_str())
                || !config.bosses().iter().any(|boss| {
                    boss.id == enc.encounter_id
                        || boss
                            .regular
                            .as_ref()
                            .is_some_and(|r| r.id == enc.encounter_id)
                })
            {
                return Err(ConfigError::Boss);
            }
            let mut skill_ids = BTreeSet::new();
            for skill in &enc.skills {
                if !skill_ids.insert(skill.skill_id.as_str())
                    || config.skill(&skill.skill_id).is_none()
                {
                    return Err(ConfigError::Skill);
                }
            }
            for conversion in enc
                .opening
                .iter()
                .chain(enc.skills.iter().map(|skill| &skill.conversion))
            {
                if !conversion.kind.advanced()
                    || !(3..=5).contains(&conversion.count)
                    || conversion.count > self.occupancy_limit
                {
                    return Err(ConfigError::FunctionalTiles);
                }
            }
        }
        Ok(())
    }

    pub(super) fn to_value(&self) -> Value {
        let encs = self.encounters.iter().map(|enc| {
            list([
                Value::Text(enc.encounter_id.clone()),
                enc.opening.map_or(Value::Null, Conversion::to_value),
                list(
                    enc.skills
                        .iter()
                        .map(|s| list([Value::Text(s.skill_id.clone()), s.conversion.to_value()])),
                ),
            ])
        });
        list([
            Value::Text("advanced-jewels-v1".into()),
            list(self.nature_actor_limits.map(|n| Value::Uint(n.into()))),
            Value::Uint(self.nature_ally_limit_at_five.into()),
            list(self.frost_reduction_pm.map(|n| Value::Uint(n.into()))),
            list(self.astral_upgrade_limits.map(|n| Value::Uint(n.into()))),
            Value::Uint(self.occupancy_limit.into()),
            list(encs),
        ])
    }
}

fn advanced_kind(tile: Option<Tile>) -> Option<TileKind> {
    match tile?.identity {
        TileIdentity::Kind(kind) if kind.advanced() => Some(kind),
        _ => None,
    }
}

impl CoopRules {
    /// Render only effects produced by this accepted authoritative command.
    /// The sealed canonical snapshot and audit event encodings remain unchanged.
    pub fn reduce_for_member_receipt(
        &self,
        state: &CoopState,
        command: super::CoopCommand,
        rng: &mut aetheria_game_core::TurnRng,
        feedback: &mut Vec<Value>,
    ) -> Result<aetheria_game_core::Decision<CoopState>, aetheria_game_core::Error> {
        let Some(policy) = &self.config.advanced_jewels else {
            return self.reduce_stamped(state, command.action, command.server_timestamp_ms, rng);
        };
        let mut observed = super::TurnObservation::default();
        let decision = self.reduce_observed(
            state,
            command.action,
            command.server_timestamp_ms,
            rng,
            &mut observed,
        )?;
        let mut damage = 0;
        let mut healing = [0; super::SEATS];
        let mut shields = [0; super::SEATS];
        let mut cells = observed.amplified_cells;
        let mut armed = state.chill_reduction_pm.unwrap_or(0);
        for entry in &decision.events {
            let Value::List(row) = entry else { continue };
            let [Value::Text(kind), seat, Value::Uint(value)] = row.as_slice() else {
                continue;
            };
            // Only swaps emit tile yields. Casts can also emit heal/shield
            // events but never get attributed to Heart or Shield jewels.
            if matches!(command.action, super::CoopAction::Swap { .. })
                && let Value::Uint(target) = seat
            {
                let target = *target as usize;
                match kind.as_str() {
                    "match" => damage += value,
                    "heal" => healing[target] += value,
                    "shield" => shields[target] += value,
                    _ => {}
                }
            }
            let (label, amount, cell) = match kind.as_str() {
                "nature-cleanse" | "chill-consumed" => (kind.as_str(), *value, Value::Null),
                "matched-frost" => {
                    let tier = ((*value).clamp(3, 5) - 3) as usize;
                    armed = armed.max(policy.frost_reduction_pm[tier]);
                    ("chill-armed", u64::from(armed), Value::Null)
                }
                "astral-upgrade" if cells != 0 => {
                    let cell = cells.trailing_zeros();
                    cells &= cells - 1;
                    (kind.as_str(), *value, Value::Uint(cell.into()))
                }
                _ => continue,
            };
            feedback.push(list([
                Value::Text(label.into()),
                seat.clone(),
                Value::Uint(amount),
                cell,
            ]));
            if feedback.len() >= CELLS {
                break;
            }
        }
        // Preserve the existing advanced rows first; ordinary chips aggregate
        // cascades by source and recipient and share the same 64-row bound.
        let mut chip = |kind: &str, seat: usize, amount: u64| {
            if amount > 0 && feedback.len() < CELLS {
                feedback.push(list([
                    Value::Text(kind.into()),
                    Value::Uint(seat as u64),
                    Value::Uint(amount),
                    Value::Null,
                ]));
            }
        };
        chip("sword-damage", state.active_seat, damage);
        for (kind, amount) in ["mana-gain", "rage-gain", "special-mana", "special-rage"]
            .into_iter()
            .zip(observed.jewel_resources)
        {
            chip(kind, state.active_seat, amount.into());
        }
        for seat in 0..state.participants.len() {
            chip("heart-heal", seat, healing[seat]);
            chip("shield-grant", seat, shields[seat]);
        }
        Ok(decision)
    }

    pub(super) fn advanced_encounter(&self) -> Option<&AdvancedEncounter> {
        self.config
            .advanced_jewels
            .as_ref()?
            .encounters
            .iter()
            .find(|enc| enc.encounter_id == self.encounter_id())
    }

    pub(super) fn valid_advanced_state(&self, state: &CoopState) -> bool {
        let Some(policy) = &self.config.advanced_jewels else {
            return state.chill_reduction_pm.is_none()
                && state
                    .board
                    .iter()
                    .all(|tile| advanced_kind(*tile).is_none());
        };
        let encounter = self.advanced_encounter();
        let allowed = |kind| {
            encounter.is_some_and(|enc| {
                enc.opening.is_some_and(|c| c.kind == kind)
                    || enc.skills.iter().any(|s| s.conversion.kind == kind)
            })
        };
        if state.chill_reduction_pm.is_some_and(|chill| {
            !allowed(TileKind::Frost)
                || state.phase != super::CoopPhase::Playing
                || !policy.frost_reduction_pm.contains(&chill)
        }) {
            return false;
        }
        let mut count = 0;
        for kind in state.board.iter().filter_map(|tile| advanced_kind(*tile)) {
            count += 1;
            if !allowed(kind) || count > policy.occupancy_limit {
                return false;
            }
        }
        true
    }

    pub(super) fn convert_skill(
        &self,
        state: &mut CoopState,
        skill_id: &str,
        events: &mut Vec<Value>,
    ) {
        if !state.phase.terminal()
            && let Some(binding) = self
                .advanced_encounter()
                .and_then(|enc| enc.skills.iter().find(|s| s.skill_id == skill_id))
        {
            self.convert_group(state, binding.conversion, events);
        }
    }

    pub(super) fn convert_group(
        &self,
        state: &mut CoopState,
        conversion: Conversion,
        events: &mut Vec<Value>,
    ) {
        let Some(policy) = &self.config.advanced_jewels else {
            return;
        };
        let occupied = state
            .board
            .iter()
            .filter(|tile| advanced_kind(**tile).is_some())
            .count();
        let applied = occupied + usize::from(conversion.count)
            <= usize::from(policy.occupancy_limit)
            && place_conversion(&mut state.board, conversion);
        events.push(event(
            &format!("generated-{}", conversion.kind.name()),
            None,
            if applied { conversion.count.into() } else { 0 },
        ));
    }

    pub(super) fn advanced_matches(&self, state: &mut CoopState, events: &mut Vec<Value>) -> usize {
        let Some(policy) = &self.config.advanced_jewels else {
            return 0;
        };
        let actor = state.active_seat;
        let mut upgrades = 0;
        for group in match_groups(&state.board) {
            let size = group.count_ones();
            let tier = (size.min(5) - 3) as usize;
            let kind = advanced_kind(state.board[group.trailing_zeros() as usize])
                .expect("matched advanced group");
            events.push(event(
                &format!("matched-{}", kind.name()),
                Some(actor as u8),
                size.into(),
            ));
            match kind {
                TileKind::Nature => {
                    cleanse(
                        &mut state.participants[actor],
                        actor,
                        policy.nature_actor_limits[tier],
                        events,
                    );
                    if tier == 2
                        && let Some((seat, ally)) =
                            state
                                .participants
                                .iter_mut()
                                .enumerate()
                                .find(|(seat, pet)| {
                                    *seat != actor
                                        && pet.alive
                                        && pet.statuses.iter().any(cleansable)
                                })
                    {
                        cleanse(ally, seat, policy.nature_ally_limit_at_five, events);
                    }
                }
                TileKind::Frost => {
                    state.chill_reduction_pm = Some(
                        state
                            .chill_reduction_pm
                            .unwrap_or(0)
                            .max(policy.frost_reduction_pm[tier]),
                    );
                }
                TileKind::Astral => upgrades += usize::from(policy.astral_upgrade_limits[tier]),
                _ => unreachable!(),
            }
        }
        upgrades
    }

    pub(super) fn amplify(
        &self,
        state: &mut CoopState,
        survivors: u64,
        mut count: usize,
        events: &mut Vec<Value>,
    ) -> u64 {
        if count == 0 {
            return 0;
        }
        let clock = self.escalation_clock(state);
        let Some(stage) = self
            .config
            .multiplier
            .schedule
            .iter()
            .rev()
            .find(|s| s.from <= clock)
        else {
            return 0;
        };
        let mut upgraded_cells = 0;
        for (index, cell) in state.board.iter_mut().enumerate() {
            if survivors & (1 << index) == 0 {
                continue;
            }
            let Some(tile) = cell else {
                continue;
            };
            if advanced_kind(Some(*tile)).is_some() {
                continue;
            }
            if let Some(next) = stage
                .tiers
                .iter()
                .map(|t| t.multiplier)
                .filter(|m| *m > tile.multiplier && *m <= 8)
                .min()
            {
                tile.multiplier = next;
                upgraded_cells |= 1u64 << index;
                events.push(event(
                    "astral-upgrade",
                    Some(state.active_seat as u8),
                    next.into(),
                ));
                count -= 1;
                if count == 0 {
                    break;
                }
            }
        }
        upgraded_cells
    }
}

// Vulnerability is the existing cleansable Pet status. Buffs, expired slots,
// permanent modifiers, encounter state and Boss marks do not participate.
fn cleansable(slot: &Option<super::Status>) -> bool {
    slot.is_some_and(|s| s.kind == StatusKind::Vulnerability && s.turns > 0 && s.value > 0)
}

fn cleanse(pet: &mut Participant, seat: usize, limit: u8, events: &mut Vec<Value>) {
    if !pet.alive {
        return;
    }
    for slot in pet
        .statuses
        .iter_mut()
        .filter(|s| cleansable(s))
        .take(limit.into())
    {
        *slot = None;
        events.push(event("nature-cleanse", Some(seat as u8), 1));
    }
}

// Intersecting runs are one group. Parallel or adjacent disjoint runs stay
// separate. The lowest board index orders simultaneous effects.
fn match_groups(board: &[Option<Tile>; CELLS]) -> Vec<u64> {
    let mut groups: Vec<u64> = Vec::new();
    for i in 0..CELLS {
        let Some(kind) = advanced_kind(board[i]) else {
            continue;
        };
        for (stride, fits) in [(1, i % SIDE + 2 < SIDE), (SIDE, i / SIDE + 2 < SIDE)] {
            if !fits
                || advanced_kind(board[i + stride]) != Some(kind)
                || advanced_kind(board[i + 2 * stride]) != Some(kind)
            {
                continue;
            }
            let mut run = (1u64 << i) | (1u64 << (i + stride)) | (1u64 << (i + 2 * stride));
            groups.retain(|group| {
                if run & group != 0 {
                    run |= group;
                    false
                } else {
                    true
                }
            });
            groups.push(run);
        }
    }
    groups.sort_by_key(|g| g.trailing_zeros());
    groups
}

// Row-major anchor, horizontal before vertical. Place a near-run with one
// basic gap and a same-kind orthogonal donor. Commit only if the original
// board remains settled and exchanging the donor makes the entire group.
fn place_conversion(board: &mut [Option<Tile>; CELLS], conversion: Conversion) -> bool {
    let n = usize::from(conversion.count);
    let basic = |tile: Option<Tile>| matches!(tile, Some(Tile {identity: TileIdentity::Kind(k), ..}) if !k.advanced());
    for first in 0..CELLS {
        for (stride, pos, cross, cross_pos) in [
            (1, first % SIDE, SIDE, first / SIDE),
            (SIDE, first / SIDE, 1, first % SIDE),
        ] {
            if pos + n > SIDE || !(0..n).all(|i| basic(board[first + i * stride])) {
                continue;
            }
            // Split the line into runs of at most two on either side of its gap.
            let gap = first + (n / 2) * stride;
            for donor in [
                (cross_pos > 0).then(|| gap - cross),
                (cross_pos + 1 < SIDE).then(|| gap + cross),
            ]
            .into_iter()
            .flatten()
            {
                if !basic(board[donor]) {
                    continue;
                }
                let mut trial = *board;
                for index in (0..n)
                    .map(|i| first + i * stride)
                    .filter(|i| *i != gap)
                    .chain([donor])
                {
                    trial[index] = Some(Tile {
                        identity: TileIdentity::Kind(conversion.kind),
                        multiplier: 1,
                    });
                }
                if !matched_cells(&trial).into_iter().any(|m| m) {
                    *board = trial;
                    return true;
                }
            }
        }
    }
    false
}
