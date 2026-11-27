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
}

impl TileKind {
    pub const ALL: [Self; 6] = [
        Self::Sword,
        Self::Mana,
        Self::Rage,
        Self::Heart,
        Self::Shield,
        Self::Special,
    ];

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
        self.spawn_table()?;
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

    pub(super) fn spawn_table(&self) -> Result<([u32; 6], u32), ConfigError> {
        if self.spawn_weights.len() != TileKind::ALL.len() {
            return Err(ConfigError::SpawnWeights);
        }
        let mut table = [0u32; 6];
        let mut total = 0u32;
        for weight in &self.spawn_weights {
            if weight.weight == 0 || table[weight.kind.index()] != 0 {
                return Err(ConfigError::SpawnWeights);
            }
            table[weight.kind.index()] = weight.weight;
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
        let mut mana_yield = 0u64;
        let mut rage_yield = 0u64;
        let mut has_sword = false;
        for (cell, matched) in state.board.iter_mut().zip(matched) {
            if !matched {
                continue;
            }
            let tile = cell.take().ok_or(Error::InvalidState)?;
            let TileIdentity::Kind(kind) = tile.identity else {
                return Err(Error::InvalidState);
            };
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
                TileKind::Mana => mana_yield += scaled(policy.mana_per_tile.into()),
                TileKind::Rage => rage_yield += scaled(policy.rage_per_tile.into()),
                TileKind::Heart => yields[kind.index()] += scaled(policy.heart.amount),
                TileKind::Shield => yields[kind.index()] += scaled(policy.shield.amount),
                TileKind::Special => {
                    mana_yield += scaled(mana.into());
                    rage_yield += scaled(rage.into());
                }
            }
        }

        let seat = &mut state.participants[actor];
        let before = (seat.mana, seat.rage);
        seat.mana = seat
            .mana
            .saturating_add(u16::try_from(mana_yield).unwrap_or(u16::MAX))
            .min(self.config.resources.mana_cap);
        seat.rage = seat
            .rage
            .saturating_add(u16::try_from(rage_yield).unwrap_or(u16::MAX))
            .min(self.config.resources.rage_cap);
        for (name, gain) in [
            ("mana", seat.mana - before.0),
            ("rage", seat.rage - before.1),
        ] {
            if gain > 0 {
                events.push(event(name, Some(actor as u8), gain.into()));
            }
        }
        let heart = yields[TileKind::Heart.index()];
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
        let shield = yields[TileKind::Shield.index()];
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
        if has_sword {
            self.resolve_normal_attack(state, actor, yields[TileKind::Sword.index()], rng)
        } else {
            Ok(MatchOutcome {
                damage: 0,
                critical: false,
            })
        }
    }
}
