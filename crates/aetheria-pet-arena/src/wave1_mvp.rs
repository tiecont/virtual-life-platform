//! Offline Wave 1 MVP rules. This is separate from the frozen v1 reducer and
//! does not allocate, persist, or authorize a production match.
use aetheria_game_core::{Value, canonical, canonical::list};
use serde::{Deserialize, Serialize};

pub const RULESET_ID: &str = "aetheria-pet-arena-wave1-mvp";
pub const RULESET_VERSION: u32 = 1;
pub const MAX_LEVEL: u8 = 60;
pub const FEATURED_LIMITED_ID: &str = "pet-v3-fire-icarus";
pub const STANDARD_POOL: [&str; 6] = [
    "pet-v31-fire-cindrelis",
    "pet-v31-water-marivell",
    "pet-v31-electric-quorion",
    "pet-v31-ghost-vesperyn",
    "pet-v31-ground-gravorn",
    "pet-v31-light-aurelune",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CoreElement {
    Fire,
    Water,
    Electric,
    Ghost,
    Ground,
    Light,
}

pub const CORE_ELEMENTS: [CoreElement; 6] = [
    CoreElement::Fire,
    CoreElement::Water,
    CoreElement::Electric,
    CoreElement::Ghost,
    CoreElement::Ground,
    CoreElement::Light,
];

// Attack rows in CORE_ELEMENTS order. Values are permille and stay within the
// released candidate taxonomy: neutral, advantage, resistance, immunity.
pub const EFFECTIVENESS: [[u16; 6]; 6] = [
    [800, 800, 1000, 1000, 1000, 1000],
    [1250, 800, 1000, 1000, 1250, 1000],
    [1000, 1250, 800, 1000, 0, 1000],
    [1000, 1000, 1000, 1250, 1000, 800],
    [1250, 1000, 1250, 1000, 1000, 1000],
    [1000, 1000, 1000, 1250, 1000, 800],
];

impl CoreElement {
    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn multiplier_against(self, defender: Self) -> u16 {
        EFFECTIVENESS[self.index()][defender.index()]
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Stats {
    pub hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EvolutionThreshold {
    pub stage: u8,
    pub level: u8,
    pub multiplier_permille: u16,
    pub unlock: &'static str,
}

pub const EVOLUTION_THRESHOLDS: [EvolutionThreshold; 3] = [
    EvolutionThreshold {
        stage: 1,
        level: 20,
        multiplier_permille: 1100,
        unlock: "second-skill-and-map-2",
    },
    EvolutionThreshold {
        stage: 2,
        level: 40,
        multiplier_permille: 1250,
        unlock: "signature-slot-and-boss-assist",
    },
    EvolutionThreshold {
        stage: 3,
        level: 60,
        multiplier_permille: 1500,
        unlock: "ultimate-skill-and-mastery-aura",
    },
];

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EvolutionView {
    pub element: CoreElement,
    pub level: u8,
    pub stage: u8,
    pub stats: Stats,
    pub unlocks: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MvpError {
    InvalidElement,
    InvalidLevel,
    InvalidMap,
    LockedMap,
    AlreadyCleared,
    InvalidActions,
    Arithmetic,
    InvalidBanner,
    InvalidEntropy,
}

fn base_stats(element: CoreElement) -> Stats {
    match element {
        CoreElement::Fire => Stats {
            hp: 100,
            attack: 24,
            defense: 12,
            speed: 14,
        },
        CoreElement::Water => Stats {
            hp: 115,
            attack: 19,
            defense: 16,
            speed: 11,
        },
        CoreElement::Electric => Stats {
            hp: 95,
            attack: 25,
            defense: 11,
            speed: 16,
        },
        CoreElement::Ghost => Stats {
            hp: 105,
            attack: 22,
            defense: 13,
            speed: 15,
        },
        CoreElement::Ground => Stats {
            hp: 130,
            attack: 17,
            defense: 20,
            speed: 8,
        },
        CoreElement::Light => Stats {
            hp: 110,
            attack: 21,
            defense: 15,
            speed: 13,
        },
    }
}

fn scale(value: u32, permille: u32) -> Result<u32, MvpError> {
    let scaled = u64::from(value)
        .checked_mul(u64::from(permille))
        .ok_or(MvpError::InvalidElement)?
        / 1000;
    u32::try_from(scaled).map_err(|_| MvpError::Arithmetic)
}

pub fn evolution_stage(level: u8) -> Result<u8, MvpError> {
    if !(1..=MAX_LEVEL).contains(&level) {
        return Err(MvpError::InvalidLevel);
    }
    Ok(EVOLUTION_THRESHOLDS
        .iter()
        .filter(|threshold| level >= threshold.level)
        .count() as u8)
}

pub fn evolution(element: CoreElement, level: u8) -> Result<EvolutionView, MvpError> {
    let stage = evolution_stage(level)?;
    let threshold = stage
        .checked_sub(1)
        .and_then(|index| EVOLUTION_THRESHOLDS.get(usize::from(index)));
    let stage_permille = threshold.map_or(1000, |value| value.multiplier_permille);
    let growth_permille = 1000_u32
        .checked_add(35 * u32::from(level.saturating_sub(1)))
        .ok_or(MvpError::Arithmetic)?;
    let base = base_stats(element);
    let transformed = |value: u32| -> Result<u32, MvpError> {
        scale(scale(value, growth_permille)?, u32::from(stage_permille))
    };
    Ok(EvolutionView {
        element,
        level,
        stage,
        stats: Stats {
            hp: transformed(base.hp)?,
            attack: transformed(base.attack)?,
            defense: transformed(base.defense)?,
            speed: transformed(base.speed)?,
        },
        unlocks: EVOLUTION_THRESHOLDS
            .iter()
            .filter(|value| level >= value.level)
            .map(|value| value.unlock.into())
            .collect(),
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Encounter {
    pub id: &'static str,
    pub element: CoreElement,
    pub hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub boss: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct MapEncounter {
    pub id: &'static str,
    pub name: &'static str,
    pub element: CoreElement,
    pub regular: Encounter,
    pub boss: Encounter,
}

const fn encounter(
    id: &'static str,
    element: CoreElement,
    hp: u32,
    attack: u32,
    defense: u32,
    boss: bool,
) -> Encounter {
    Encounter {
        id,
        element,
        hp,
        attack,
        defense,
        boss,
    }
}

#[allow(clippy::too_many_arguments)]
const fn map(
    id: &'static str,
    name: &'static str,
    element: CoreElement,
    regular_hp: u32,
    regular_attack: u32,
    regular_defense: u32,
    boss_hp: u32,
    boss_attack: u32,
    boss_defense: u32,
) -> MapEncounter {
    MapEncounter {
        id,
        name,
        element,
        regular: encounter(
            "regular",
            element,
            regular_hp,
            regular_attack,
            regular_defense,
            false,
        ),
        boss: encounter("boss", element, boss_hp, boss_attack, boss_defense, true),
    }
}

pub const MAPS: [MapEncounter; 6] = [
    map(
        "cinder-terraces",
        "Cinder Terraces",
        CoreElement::Fire,
        70,
        8,
        5,
        150,
        12,
        8,
    ),
    map(
        "tideglass-lagoon",
        "Tideglass Lagoon",
        CoreElement::Water,
        90,
        10,
        7,
        190,
        14,
        10,
    ),
    map(
        "stormcoil-fields",
        "Stormcoil Fields",
        CoreElement::Electric,
        110,
        12,
        9,
        230,
        16,
        12,
    ),
    map(
        "lantern-necropolis",
        "Lantern Necropolis",
        CoreElement::Ghost,
        130,
        14,
        11,
        270,
        18,
        14,
    ),
    map(
        "ochre-labyrinth",
        "Ochre Labyrinth",
        CoreElement::Ground,
        150,
        16,
        13,
        310,
        20,
        16,
    ),
    map(
        "dawn-prism-sanctum",
        "Dawn Prism Sanctum",
        CoreElement::Light,
        180,
        18,
        15,
        360,
        22,
        18,
    ),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArenaAction {
    Strike,
    Guard,
    Skill,
    PowerSkill,
    Signature,
    Ultimate,
    FireZone,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EncounterResult {
    pub encounter: &'static str,
    pub won: bool,
    pub turns: u8,
    pub remaining_hp: u32,
    pub enemy_hp: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct MapResult {
    pub map: &'static str,
    pub regular: EncounterResult,
    pub boss: Option<EncounterResult>,
    pub won: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Campaign {
    cleared_mask: u8,
    revision: u16,
}

impl Campaign {
    pub const fn new() -> Self {
        Self {
            cleared_mask: 0,
            revision: 0,
        }
    }

    pub const fn cleared_mask(&self) -> u8 {
        self.cleared_mask
    }

    pub const fn revision(&self) -> u16 {
        self.revision
    }

    pub fn next_map(&self) -> Option<&'static MapEncounter> {
        MAPS.iter()
            .enumerate()
            .find(|(index, _)| self.cleared_mask & (1 << index) == 0)
            .map(|(_, value)| value)
    }

    pub fn play(
        &self,
        map: &'static MapEncounter,
        element: CoreElement,
        level: u8,
        actions: &[ArenaAction],
    ) -> Result<(Self, MapResult), MvpError> {
        let index = MAPS
            .iter()
            .position(|value| value.id == map.id)
            .ok_or(MvpError::InvalidMap)?;
        if self.cleared_mask & (1 << index) != 0 {
            return Err(MvpError::AlreadyCleared);
        }
        if index > 0 && self.cleared_mask & (1 << (index - 1)) == 0 {
            return Err(MvpError::LockedMap);
        }
        let result = replay_map(map, element, level, actions, actions)?;
        let next = if result.won {
            Self {
                cleared_mask: self.cleared_mask | (1 << index),
                revision: self.revision.checked_add(1).ok_or(MvpError::Arithmetic)?,
            }
        } else {
            self.clone()
        };
        Ok((next, result))
    }
}

impl Default for Campaign {
    fn default() -> Self {
        Self::new()
    }
}

// Pure replay mirrored by the local/test HTTP adapter and shared parity vectors.
// It intentionally has no clear, lock, receipt or persistence state.
pub fn replay_map(
    map: &'static MapEncounter,
    element: CoreElement,
    level: u8,
    actions: &[ArenaAction],
    boss_actions: &[ArenaAction],
) -> Result<MapResult, MvpError> {
    let view = evolution(element, level)?;
    let regular = simulate(view.stats, view.stage, element, map.regular, actions)?;
    let boss = if regular.won {
        Some(simulate(
            view.stats,
            view.stage,
            element,
            map.boss,
            boss_actions,
        )?)
    } else {
        None
    };
    let won = regular.won && boss.as_ref().is_some_and(|value| value.won);
    Ok(MapResult {
        map: map.id,
        regular,
        boss,
        won,
    })
}

fn damage(attack: u32, power: u16, multiplier: u16, defense: u32) -> Result<u32, MvpError> {
    if multiplier == 0 {
        return Ok(0);
    }
    let numerator = u64::from(attack)
        .checked_mul(u64::from(power))
        .and_then(|value| value.checked_mul(u64::from(multiplier)))
        .and_then(|value| value.checked_mul(100))
        .ok_or(MvpError::Arithmetic)?;
    let denominator = 1_000_000_u64
        .checked_mul(u64::from(100_u32.saturating_add(defense)))
        .ok_or(MvpError::Arithmetic)?;
    u32::try_from((numerator / denominator).max(1)).map_err(|_| MvpError::Arithmetic)
}

fn simulate(
    player: Stats,
    stage: u8,
    element: CoreElement,
    enemy: Encounter,
    actions: &[ArenaAction],
) -> Result<EncounterResult, MvpError> {
    if actions.is_empty() || actions.len() > 32 {
        return Err(MvpError::InvalidActions);
    }
    let mut health = player.hp;
    let mut enemy_health = enemy.hp;
    let mut cooldown = 0_u8;
    let mut turns = 0_u8;
    let mut rage = 0_u8;
    let mut fire_zone_turns = 0_u8;
    for action in actions.iter().take(12) {
        turns += 1;
        cooldown = cooldown.saturating_sub(1);
        let (power, shield) = match action {
            ArenaAction::Strike => (1000, false),
            ArenaAction::Guard => (0, true),
            ArenaAction::Skill if cooldown == 0 => {
                cooldown = 3;
                rage = 0;
                (1800, false)
            }
            ArenaAction::Skill => (1000, false),
            ArenaAction::PowerSkill => {
                if stage < 1 || cooldown != 0 {
                    return Err(MvpError::InvalidActions);
                }
                rage = 0;
                cooldown = 3;
                (2050, false)
            }
            ArenaAction::Signature | ArenaAction::Ultimate | ArenaAction::FireZone => {
                let unlock = if *action == ArenaAction::Ultimate {
                    3
                } else {
                    2
                };
                if stage < unlock
                    || rage < 100
                    || cooldown != 0
                    || (*action == ArenaAction::FireZone && element != CoreElement::Fire)
                {
                    return Err(MvpError::InvalidActions);
                }
                let power = match action {
                    ArenaAction::Ultimate => 2800,
                    ArenaAction::FireZone => 2100,
                    _ => 2300,
                };
                rage = 0;
                cooldown = 3;
                (power, false)
            }
        };
        if power <= 1000 {
            rage = (rage + 34).min(100);
        }
        if power > 0 {
            let hit = damage(
                player.attack,
                power,
                element.multiplier_against(enemy.element),
                enemy.defense,
            )?;
            enemy_health = enemy_health.saturating_sub(hit);
        }
        if fire_zone_turns > 0 {
            enemy_health = enemy_health.saturating_sub(damage(
                player.attack,
                350,
                element.multiplier_against(enemy.element),
                enemy.defense,
            )?);
            fire_zone_turns -= 1;
        }
        if *action == ArenaAction::FireZone {
            fire_zone_turns = 2;
        }
        if enemy_health == 0 {
            return Ok(EncounterResult {
                encounter: enemy.id,
                won: true,
                turns,
                remaining_hp: health,
                enemy_hp: 0,
            });
        }
        let mut retaliation = damage(
            enemy.attack,
            1000,
            enemy.element.multiplier_against(element),
            player.defense,
        )?;
        if shield {
            retaliation = retaliation.div_ceil(2);
        }
        health = health.saturating_sub(retaliation);
        if health == 0 {
            return Ok(EncounterResult {
                encounter: enemy.id,
                won: false,
                turns,
                remaining_hp: 0,
                enemy_hp: enemy_health,
            });
        }
    }
    Ok(EncounterResult {
        encounter: enemy.id,
        won: false,
        turns,
        remaining_hp: health,
        enemy_hp: enemy_health,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct BannerState {
    pub misses: u8,
    pub guaranteed: bool,
    pub revision: u32,
}

impl BannerState {
    pub const fn new() -> Self {
        Self {
            misses: 0,
            guaranteed: false,
            revision: 0,
        }
    }
}

impl Default for BannerState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PullEntropy {
    pub s_roll: u32,
    pub featured_roll: u32,
    pub off_rate_ticket: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PullResult {
    pub pet_id: &'static str,
    pub featured: bool,
}

pub fn s_probability_ppm(pull_number: u8) -> Result<u32, MvpError> {
    if !(1..=80).contains(&pull_number) {
        return Err(MvpError::InvalidEntropy);
    }
    if pull_number < 60 {
        return Ok(8_000);
    }
    if pull_number == 80 {
        return Ok(1_000_000);
    }
    Ok(8_000 + (u32::from(pull_number) - 59) * 49_600)
}

pub fn resolve_pulls(
    before: BannerState,
    entropy: &[PullEntropy],
) -> Result<(BannerState, Vec<PullResult>), MvpError> {
    if !(1..=10).contains(&entropy.len()) || (entropy.len() > 1 && entropy.len() != 10) {
        return Err(MvpError::InvalidEntropy);
    }
    if before.misses > 79 {
        return Err(MvpError::InvalidBanner);
    }
    let mut state = before;
    let mut results = Vec::with_capacity(entropy.len());
    for draw in entropy {
        if draw.s_roll >= 1_000_000 || draw.featured_roll >= 1_000_000 || draw.off_rate_ticket >= 6
        {
            return Err(MvpError::InvalidEntropy);
        }
        let chance = s_probability_ppm(state.misses.saturating_add(1))?;
        if draw.s_roll >= chance {
            state.misses = state.misses.checked_add(1).ok_or(MvpError::InvalidBanner)?;
        } else {
            let featured = state.guaranteed || draw.featured_roll < 500_000;
            let pet_id = if featured {
                FEATURED_LIMITED_ID
            } else {
                STANDARD_POOL[usize::from(draw.off_rate_ticket)]
            };
            state.misses = 0;
            state.guaranteed = !featured;
            results.push(PullResult { pet_id, featured });
        }
        state.revision = state
            .revision
            .checked_add(1)
            .ok_or(MvpError::InvalidBanner)?;
    }
    Ok((state, results))
}

pub fn canonical_manifest() -> Value {
    list([
        Value::Text(RULESET_ID.into()),
        Value::Uint(RULESET_VERSION.into()),
        Value::Uint(MAX_LEVEL.into()),
        list(CORE_ELEMENTS.iter().map(|element| {
            list([
                Value::Text(format!("{element:?}").to_ascii_lowercase()),
                list(
                    CORE_ELEMENTS
                        .iter()
                        .map(|defender| Value::Uint(element.multiplier_against(*defender).into())),
                ),
            ])
        })),
        list(EVOLUTION_THRESHOLDS.iter().map(|threshold| {
            list([
                Value::Uint(threshold.stage.into()),
                Value::Uint(threshold.level.into()),
                Value::Uint(threshold.multiplier_permille.into()),
                Value::Text(threshold.unlock.into()),
            ])
        })),
        list(MAPS.iter().map(|map| {
            list([
                Value::Text(map.id.into()),
                Value::Text(format!("{:?}", map.element).to_ascii_lowercase()),
                Value::Text(map.regular.id.into()),
                Value::Uint(map.regular.hp.into()),
                Value::Uint(map.regular.attack.into()),
                Value::Uint(map.regular.defense.into()),
                Value::Text(map.boss.id.into()),
                Value::Uint(map.boss.hp.into()),
                Value::Uint(map.boss.attack.into()),
                Value::Uint(map.boss.defense.into()),
            ])
        })),
        list([
            Value::Bool(false),
            Value::Bool(false),
            Value::Text(FEATURED_LIMITED_ID.into()),
            list(STANDARD_POOL.iter().map(|id| Value::Text((*id).into()))),
            Value::Uint(500_000),
            Value::Uint(8_000),
            Value::Uint(60),
            Value::Uint(80),
        ]),
    ])
}

pub fn rules_hash() -> Result<[u8; 32], MvpError> {
    canonical::hash("aetheria.pet-arena-wave1-mvp.v1", &canonical_manifest())
        .map_err(|_| MvpError::Arithmetic)
}

pub fn rules_hash_hex() -> Result<String, MvpError> {
    Ok(rules_hash()?
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const POLICY: [ArenaAction; 12] = [
        ArenaAction::Skill,
        ArenaAction::Strike,
        ArenaAction::Guard,
        ArenaAction::Strike,
        ArenaAction::Skill,
        ArenaAction::Strike,
        ArenaAction::Guard,
        ArenaAction::Strike,
        ArenaAction::Skill,
        ArenaAction::Strike,
        ArenaAction::Guard,
        ArenaAction::Strike,
    ];

    #[test]
    fn six_core_elements_have_a_bounded_complete_matrix() {
        assert_eq!(CORE_ELEMENTS.len(), 6);
        for (index, attacker) in CORE_ELEMENTS.iter().enumerate() {
            for (defender_index, defender) in CORE_ELEMENTS.iter().enumerate() {
                assert!(matches!(
                    attacker.multiplier_against(*defender),
                    0 | 800 | 1000 | 1250
                ));
                assert_eq!(
                    attacker.multiplier_against(*defender),
                    EFFECTIVENESS[index][defender_index]
                );
            }
        }
        assert_eq!(
            CoreElement::Electric.multiplier_against(CoreElement::Ground),
            0
        );
        assert_eq!(
            CoreElement::Ground.multiplier_against(CoreElement::Electric),
            1250
        );
    }

    #[test]
    fn evolution_changes_only_at_twenty_forty_and_sixty() {
        assert_eq!(evolution_stage(1), Ok(0));
        assert_eq!(evolution_stage(19), Ok(0));
        assert_eq!(evolution_stage(20), Ok(1));
        assert_eq!(evolution_stage(39), Ok(1));
        assert_eq!(evolution_stage(40), Ok(2));
        assert_eq!(evolution_stage(59), Ok(2));
        assert_eq!(evolution_stage(60), Ok(3));
        assert_eq!(evolution_stage(0), Err(MvpError::InvalidLevel));
        assert_eq!(evolution_stage(61), Err(MvpError::InvalidLevel));
        let nineteen = evolution(CoreElement::Fire, 19).unwrap();
        let twenty = evolution(CoreElement::Fire, 20).unwrap();
        assert_eq!(twenty.stage, 1);
        assert!(twenty.stats.attack > nineteen.stats.attack);
        assert!(
            !nineteen
                .unlocks
                .iter()
                .any(|unlock| unlock == "second-skill-and-map-2")
        );
        assert!(
            twenty
                .unlocks
                .iter()
                .any(|unlock| unlock == "second-skill-and-map-2")
        );
    }

    #[test]
    fn campaign_requires_order_and_completes_all_six_maps_and_bosses() {
        let mut campaign = Campaign::new();
        assert_eq!(
            campaign.play(&MAPS[1], MAPS[1].element, 60, &POLICY),
            Err(MvpError::LockedMap)
        );
        for map in &MAPS {
            let (next, result) = campaign.play(map, map.element, 60, &POLICY).unwrap();
            assert!(result.won, "{:?}", result);
            assert!(result.regular.won);
            assert!(result.boss.as_ref().is_some_and(|boss| boss.won));
            campaign = next;
        }
        assert_eq!(campaign.cleared_mask(), 0b11_1111);
        assert_eq!(campaign.revision(), 6);
        assert!(campaign.next_map().is_none());
        assert_eq!(
            campaign.play(&MAPS[5], MAPS[5].element, 60, &POLICY),
            Err(MvpError::AlreadyCleared)
        );
    }

    #[test]
    fn campaign_bounds_actions_and_rejects_loss_as_progress() {
        let (next, result) = Campaign::new()
            .play(&MAPS[0], CoreElement::Fire, 1, &[ArenaAction::Guard; 12])
            .unwrap();
        assert!(!result.won);
        assert_eq!(next.cleared_mask(), 0);
        assert_eq!(
            Campaign::new().play(&MAPS[0], CoreElement::Fire, 1, &[]),
            Err(MvpError::InvalidActions)
        );
        assert_eq!(
            Campaign::new().play(&MAPS[0], CoreElement::Fire, 1, &[ArenaAction::Strike; 33]),
            Err(MvpError::InvalidActions)
        );
    }

    #[test]
    fn featured_off_rate_guarantee_and_hard_pity_are_deterministic() {
        let hit = PullEntropy {
            s_roll: 0,
            featured_roll: 0,
            off_rate_ticket: 0,
        };
        let (state, result) = resolve_pulls(BannerState::new(), &[hit]).unwrap();
        assert_eq!(
            result,
            vec![PullResult {
                pet_id: FEATURED_LIMITED_ID,
                featured: true
            }]
        );
        assert!(!state.guaranteed);
        let off_rate = PullEntropy {
            featured_roll: 500_000,
            off_rate_ticket: 5,
            ..hit
        };
        let (state, result) = resolve_pulls(BannerState::new(), &[off_rate]).unwrap();
        assert_eq!(result[0].pet_id, STANDARD_POOL[5]);
        assert!(state.guaranteed);
        let (state, result) = resolve_pulls(
            BannerState {
                misses: 79,
                guaranteed: false,
                revision: 0,
            },
            &[PullEntropy {
                s_roll: 999_999,
                ..hit
            }],
        )
        .unwrap();
        assert_eq!(result[0].pet_id, FEATURED_LIMITED_ID);
        assert_eq!(state.misses, 0);
    }

    #[test]
    fn ten_pulls_preserve_order_and_standard_misses_never_grant_lower_rank() {
        let entropy: [PullEntropy; 10] = std::array::from_fn(|index| PullEntropy {
            s_roll: if index % 3 == 0 { 999_999 } else { 0 },
            featured_roll: if index % 2 == 0 { 500_000 } else { 499_999 },
            off_rate_ticket: (index % 6) as u8,
        });
        let (state, results) = resolve_pulls(BannerState::new(), &entropy).unwrap();
        assert_eq!(state.revision, 10);
        assert_eq!(results.len(), 6);
        for result in results {
            assert!(STANDARD_POOL.contains(&result.pet_id) || result.pet_id == FEATURED_LIMITED_ID);
        }
        assert_eq!(
            resolve_pulls(
                BannerState::new(),
                &[PullEntropy {
                    s_roll: 1_000_000,
                    featured_roll: 0,
                    off_rate_ticket: 0
                }]
            ),
            Err(MvpError::InvalidEntropy)
        );
    }

    #[test]
    fn manifest_and_rules_hash_are_stable_and_publish_nothing() {
        assert!(matches!(
            canonical_manifest(),
            Value::List(ref values) if values.len() == 7
        ));
        assert_eq!(rules_hash(), rules_hash());
        assert_eq!(rules_hash_hex().unwrap().len(), 64);
        assert!(
            !rules_hash_hex()
                .unwrap()
                .chars()
                .any(|value| !value.is_ascii_hexdigit())
        );
    }

    #[derive(serde::Deserialize)]
    struct ReplayVectorFile {
        vectors: Vec<ReplayVector>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ReplayVector {
        name: String,
        map_id: String,
        element: CoreElement,
        level: u8,
        actions: Vec<ArenaAction>,
        boss_actions: Vec<ArenaAction>,
        expected: ExpectedReplay,
    }

    #[derive(serde::Deserialize)]
    struct ExpectedReplay {
        won: bool,
        regular: ExpectedEncounter,
        boss: Option<ExpectedEncounter>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ExpectedEncounter {
        won: bool,
        turns: u8,
        remaining_hp: u32,
        enemy_hp: u32,
    }

    #[test]
    fn shared_replay_vectors_match_typescript_expectations() {
        let file: ReplayVectorFile = serde_json::from_str(include_str!(
            "../../../tests/fixtures/pet-arena-wave1-replay-vectors.json"
        ))
        .unwrap();
        assert_eq!(file.vectors.len(), 10);
        for vector in file.vectors {
            let map = MAPS
                .iter()
                .find(|map| map.id == vector.map_id.as_str())
                .unwrap_or_else(|| panic!("unknown fixture map: {}", vector.name));
            let result = replay_map(
                map,
                vector.element,
                vector.level,
                &vector.actions,
                &vector.boss_actions,
            )
            .unwrap();
            assert_eq!(result.won, vector.expected.won, "{}", vector.name);
            assert_eq!(
                result.regular.won, vector.expected.regular.won,
                "{} regular won",
                vector.name
            );
            assert_eq!(
                result.regular.turns, vector.expected.regular.turns,
                "{} regular turns",
                vector.name
            );
            assert_eq!(
                result.regular.remaining_hp, vector.expected.regular.remaining_hp,
                "{} regular hp",
                vector.name
            );
            assert_eq!(
                result.regular.enemy_hp, vector.expected.regular.enemy_hp,
                "{} regular enemy hp",
                vector.name
            );
            match (result.boss, vector.expected.boss) {
                (None, None) => {}
                (Some(actual), Some(expected)) => {
                    assert_eq!(actual.won, expected.won, "{} boss won", vector.name);
                    assert_eq!(actual.turns, expected.turns, "{} boss turns", vector.name);
                    assert_eq!(
                        actual.remaining_hp, expected.remaining_hp,
                        "{} boss hp",
                        vector.name
                    );
                    assert_eq!(
                        actual.enemy_hp, expected.enemy_hp,
                        "{} boss enemy hp",
                        vector.name
                    );
                }
                _ => panic!("boss result mismatch: {}", vector.name),
            }
        }
    }
}
