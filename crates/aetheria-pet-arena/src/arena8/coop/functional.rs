use aetheria_game_core::{Error, Value, canonical::list};
use serde::{Deserialize, Serialize};

use super::config::{ConfigError, EffectTarget, ResourceConfig};
use super::{CELLS, CoopRules, CoopState, MatchOutcome, TileIdentity, event};

/// The function of a gem is independent of its user's Pet element.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TileKind {
    Sword,
    Mana,
    Rage,
    Heart,
    Shield,
    Special,
    Nature,
    Frost,
    Astral,
}

impl TileKind {
    /// The six natural kinds in historical functional bundles.
    pub const ALL: [Self; 6] = [
        Self::Sword,
        Self::Mana,
        Self::Rage,
        Self::Heart,
        Self::Shield,
        Self::Special,
    ];

    /// The shared natural spawn pool beginning with schema 6.
    pub const SHARED: [Self; 9] = [
        Self::Sword,
        Self::Mana,
        Self::Rage,
        Self::Heart,
        Self::Shield,
        Self::Special,
        Self::Nature,
        Self::Frost,
        Self::Astral,
    ];

    pub const fn advanced(self) -> bool {
        matches!(self, Self::Nature | Self::Frost | Self::Astral)
    }

    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn name(self) -> &'static str {
        match self {
            Self::Sword => "sword",
            Self::Mana => "mana",
            Self::Rage => "rage",
            Self::Heart => "heart",
            Self::Shield => "shield",
            Self::Special => "special",
            Self::Nature => "nature",
            Self::Frost => "frost",
            Self::Astral => "astral",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FunctionalTiles {
    pub spawn_weights: Vec<FunctionalSpawnWeight>,
    pub sword_contribution_pm: u32,
    pub mana_per_tile: u16,
    pub rage_per_tile: u16,
    pub heart: HeartPolicy,
    pub shield: ShieldPolicy,
    pub special: SpecialPolicy,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FunctionalSpawnWeight {
    pub kind: TileKind,
    pub weight: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum SupportTarget {
    #[serde(rename = "self")]
    Actor,
    LowestHpAlly,
    AllAllies,
}

impl SupportTarget {
    const fn effect_target(self) -> EffectTarget {
        match self {
            Self::Actor => EffectTarget::SelfActor,
            Self::LowestHpAlly => EffectTarget::LowestAlly,
            Self::AllAllies => EffectTarget::Allies,
        }
    }

    const fn name(self) -> &'static str {
        match self {
            Self::Actor => "self",
            Self::LowestHpAlly => "lowest-hp-ally",
            Self::AllAllies => "all-allies",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HeartPolicy {
    pub amount: u32,
    pub target: SupportTarget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShieldPolicy {
    pub amount: u32,
    pub target: SupportTarget,
    pub shield_cap_pm: u16,
    pub duration_turns: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SpecialPolicy {
    ResourceCombo { mana: u16, rage: u16 },
}

impl FunctionalTiles {
    pub(super) fn validate(&self, resources: &ResourceConfig) -> Result<(), ConfigError> {
        let SpecialPolicy::ResourceCombo { mana, rage } = self.special;
        if !(1..=10_000).contains(&self.sword_contribution_pm)
            || !(1..=resources.mana_cap).contains(&self.mana_per_tile)
            || !(1..=resources.rage_cap).contains(&self.rage_per_tile)
            || !(1..=100_000).contains(&self.heart.amount)
            || !(1..=100_000).contains(&self.shield.amount)
            || !(1..=1_000).contains(&self.shield.shield_cap_pm)
            || !(1..=32).contains(&self.shield.duration_turns)
            || !(1..=resources.mana_cap).contains(&mana)
            || !(1..=resources.rage_cap).contains(&rage)
        {
            return Err(ConfigError::FunctionalTiles);
        }
        Ok(())
    }

    pub(super) fn spawn_table(
        &self,
        shared_jewel_rng: bool,
    ) -> Result<([u32; TileKind::SHARED.len()], u32), ConfigError> {
        // Limit the shared table's integer precision while preserving legacy weights.
        const MAX_SHARED_WEIGHT: u32 = 1_000_000;
        let count = if shared_jewel_rng {
            TileKind::SHARED.len()
        } else {
            TileKind::ALL.len()
        };
        if self.spawn_weights.len() != count {
            return Err(ConfigError::SpawnWeights);
        }
        let mut table = [0; TileKind::SHARED.len()];
        let mut total = 0u32;
        for weight in &self.spawn_weights {
            let index = weight.kind.index();
            if index >= count
                || weight.weight == 0
                || (shared_jewel_rng && weight.weight > MAX_SHARED_WEIGHT)
                || table[index] != 0
            {
                return Err(ConfigError::SpawnWeights);
            }
            table[index] = weight.weight;
            total = total
                .checked_add(weight.weight)
                .ok_or(ConfigError::Arithmetic)?;
        }
        Ok((table, total))
    }

    pub(super) fn to_value(&self) -> Value {
        let number = |value: u32| Value::Uint(value.into());
        let text = |value: &str| Value::Text(value.into());
        let SpecialPolicy::ResourceCombo { mana, rage } = self.special;
        list([
            list(
                self.spawn_weights
                    .iter()
                    .map(|entry| list([text(entry.kind.name()), number(entry.weight)])),
            ),
            number(self.sword_contribution_pm),
            number(self.mana_per_tile.into()),
            number(self.rage_per_tile.into()),
            list([number(self.heart.amount), text(self.heart.target.name())]),
            list([
                number(self.shield.amount),
                text(self.shield.target.name()),
                number(self.shield.shield_cap_pm.into()),
                number(self.shield.duration_turns.into()),
            ]),
            list([
                text("resource-combo"),
                number(mana.into()),
                number(rage.into()),
            ]),
        ])
    }
}

impl CoopRules {
    pub(super) fn score_functional_match(
        &self,
        state: &mut CoopState,
        actor: usize,
        matched: &[bool; CELLS],
        rng: &mut aetheria_game_core::TurnRng,
        events: &mut Vec<Value>,
    ) -> Result<MatchOutcome, Error> {
        let policy = self
            .config
            .board
            .functional_tiles
            .as_ref()
            .ok_or(Error::InvalidState)?;
        // Each gem scales its own authored yield, using the published attack
        // or utility multiplier. Crossings are already deduplicated.
        let mut yields = [0u64; 6];
        let SpecialPolicy::ResourceCombo { mana, rage } = policy.special;
        let mut special_mana = 0u64;
        let mut special_rage = 0u64;
        let mut has_sword = false;
        for (cell, matched) in state.board.iter_mut().zip(matched) {
            if !matched {
                continue;
            }
            let tile = cell.take().ok_or(Error::InvalidState)?;
            let TileIdentity::Kind(kind) = tile.identity else {
                return Err(Error::InvalidState);
            };
            if kind.advanced() {
                continue; // Match-length effects resolve once per intersecting run group.
            }
            let multiplier = &self.config.multiplier;
            let scale = match kind {
                TileKind::Sword => multiplier.damage_weight(tile.multiplier),
                _ => multiplier.resource_weight(tile.multiplier),
            }
            .map_err(|_| Error::InvalidState)?;
            let scaled = |amount| u64::from(amount) * u64::from(scale) / 1_000;
            match kind {
                TileKind::Sword => {
                    has_sword = true;
                    yields[kind.index()] += scaled(policy.sword_contribution_pm);
                }
                TileKind::Nature | TileKind::Frost | TileKind::Astral => unreachable!(),
                TileKind::Mana => yields[kind.index()] += scaled(policy.mana_per_tile.into()),
                TileKind::Rage => yields[kind.index()] += scaled(policy.rage_per_tile.into()),
                TileKind::Heart => yields[kind.index()] += scaled(policy.heart.amount),
                TileKind::Shield => yields[kind.index()] += scaled(policy.shield.amount),
                TileKind::Special => {
                    special_mana += scaled(mana.into());
                    special_rage += scaled(rage.into());
                }
            }
        }

        let seat = &mut state.participants[actor];
        let before = (seat.mana, seat.rage);
        let mana_yield = yields[TileKind::Mana.index()] + special_mana;
        let rage_yield = yields[TileKind::Rage.index()] + special_rage;
        seat.mana = seat
            .mana
            .saturating_add(u16::try_from(mana_yield).unwrap_or(u16::MAX))
            .min(self.config.resources.mana_cap);
        seat.rage = seat
            .rage
            .saturating_add(u16::try_from(rage_yield).unwrap_or(u16::MAX))
            .min(self.config.resources.rage_cap);
        let (mana, special_mana) = resource_credit(seat.mana - before.0, mana_yield, special_mana);
        let (rage, special_rage) = resource_credit(seat.rage - before.1, rage_yield, special_rage);
        for (name, gain) in [
            ("mana", seat.mana - before.0),
            ("rage", seat.rage - before.1),
        ] {
            if gain > 0 {
                events.push(event(name, Some(actor as u8), gain.into()));
            }
        }
        self.apply_jewel_support(
            state,
            policy,
            actor,
            yields[TileKind::Heart.index()],
            yields[TileKind::Shield.index()],
            events,
        );
        let mut outcome = if has_sword {
            self.resolve_normal_attack(state, actor, yields[TileKind::Sword.index()], rng)?
        } else {
            MatchOutcome {
                damage: 0,
                critical: false,
                jewel_resources: [0; 4],
            }
        };
        outcome.jewel_resources = [mana, rage, special_mana, special_rage];
        Ok(outcome)
    }

    pub(super) fn apply_jewel_support(
        &self,
        state: &mut CoopState,
        policy: &FunctionalTiles,
        actor: usize,
        heart: u64,
        shield: u64,
        events: &mut Vec<Value>,
    ) {
        if heart > 0 {
            let amount = u32::try_from(heart).unwrap_or(u32::MAX);
            for target in self.targets(state, actor, policy.heart.target.effect_target()) {
                let seat = &mut state.participants[target];
                let before = seat.hp;
                seat.hp = seat.hp.saturating_add(amount).min(seat.max_hp);
                let healed = u64::from(seat.hp - before);
                state.participants[actor].contribution_healing = state.participants[actor]
                    .contribution_healing
                    .saturating_add(healed);
                events.push(event("heal", Some(target as u8), healed));
            }
        }
        if shield > 0 {
            let amount = u32::try_from(shield).unwrap_or(u32::MAX);
            for target in self.targets(state, actor, policy.shield.target.effect_target()) {
                let seat = &mut state.participants[target];
                let cap = u64::from(seat.max_hp) * u64::from(policy.shield.shield_cap_pm) / 1_000;
                let granted = amount.min((cap as u32).saturating_sub(seat.shield));
                if granted > 0 {
                    seat.shield += granted;
                    seat.shield_turns = seat.shield_turns.max(policy.shield.duration_turns);
                    state.participants[actor].contribution_shielding = state.participants[actor]
                        .contribution_shielding
                        .saturating_add(granted.into());
                    events.push(event("shield", Some(target as u8), granted.into()));
                }
            }
        }
    }
}

// In one batch ordinary and Special jewels grant a pooled resource. If both
// contribute and the grant caps, the reducer defines no priority between them.
fn resource_credit(granted: u16, total: u64, special: u64) -> (u16, u16) {
    if special == 0 {
        (granted, 0)
    } else if special == total {
        (0, granted)
    } else if u64::from(granted) == total {
        (granted - special as u16, special as u16)
    } else {
        (0, 0)
    }
}

#[cfg(test)]
mod receipt_tests {
    use super::resource_credit;

    #[test]
    fn a_binding_shared_cap_has_no_per_jewel_attribution() {
        assert_eq!(resource_credit(2, 5, 0), (2, 0));
        assert_eq!(resource_credit(2, 5, 5), (0, 2));
        assert_eq!(resource_credit(5, 5, 2), (3, 2));
        assert_eq!(resource_credit(3, 5, 2), (0, 0));
        assert_eq!(resource_credit(0, 3, 3), (0, 0));
    }
}
