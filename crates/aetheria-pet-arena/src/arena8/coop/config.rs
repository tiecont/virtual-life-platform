//! Typed, versioned cooperative gameplay configuration.
//!
//! PostgreSQL owns the authoritative bundle; this module only describes,
//! validates and hashes its shape. There are no production gameplay numbers and
//! no fallback defaults: deserialization rejects missing or unknown fields and
//! [`CoopConfig::validate`] rejects duplicated, unreferenced, unsupported or
//! out-of-range values, so an absent or invalid bundle fails closed.
//!
//! Structural engine capability (board side, cell count, seat count, the six
//! MVP elements and the minimum match run) lives in the engine. Everything an
//! author tunes lives here.

use super::loadout::ArtifactCatalog;
use crate::arena8::{
    Element,
    binding::{IDENTITIES, RosterState},
};
use crate::wave1_mvp::{FEATURED_LIMITED_ID, MAPS, STANDARD_POOL};
use aetheria_game_core::Value;
use aetheria_game_core::canonical::{hash, list};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

/// Engine capability a bundle must declare compatibility with.
pub const ENGINE_CAPABILITY: &str = "arena8-coop-v1";
/// Supported bundle schema version.
pub const CONFIG_SCHEMA_VERSION: u32 = 2;
const HISTORICAL_SCHEMA_VERSION: u32 = 1;
/// Structural ceiling on cascade depth. The authored value may be lower.
pub const MAX_CASCADE_LIMIT: u8 = 64;
/// Structural maximum independent of the cap authored for an individual skill.
pub const MAX_SKILL_LEVEL: u8 = 10;
/// Canonical domain separation for the bundle digest.
pub const DIGEST_DOMAIN: &str = "aetheria.arena8-coop.config.v1";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoopConfig {
    pub schema_version: u32,
    pub engine_capability: String,
    pub config_id: String,
    pub content_revision: u32,
    pub board: BoardConfig,
    pub party: PartyConfig,
    pub resources: ResourceConfig,
    pub damage: DamageConfig,
    pub(super) artifacts: Option<ArtifactCatalog>,
    pub elements: Vec<ElementProfile>,
    pub multiplier: MultiplierConfig,
    boss: Option<BossConfig>,
    #[serde(default)]
    bosses: Option<Vec<BossConfig>>,
    pub skills: Vec<SkillConfig>,
    pub pets: Vec<PetConfig>,
    pub rewards: RewardsConfig,
}

/// Settlement rewards authored per clear and per loss. The engine validates and
/// binds these values; Nest pays them idempotently from the committed proposal.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RewardsConfig {
    pub clear_achievement_points: u32,
    pub clear_coins: u32,
    pub clear_exp: u32,
    pub loss_achievement_points: u32,
    pub loss_coins: u32,
    pub loss_exp: u32,
}

impl RewardsConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if [
            self.clear_achievement_points,
            self.clear_coins,
            self.clear_exp,
            self.loss_achievement_points,
            self.loss_coins,
            self.loss_exp,
        ]
        .iter()
        .any(|value| *value > 1_000_000)
        {
            return Err(ConfigError::Rewards);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        list([
            Value::Uint(u64::from(self.clear_achievement_points)),
            Value::Uint(u64::from(self.clear_coins)),
            Value::Uint(u64::from(self.clear_exp)),
            Value::Uint(u64::from(self.loss_achievement_points)),
            Value::Uint(u64::from(self.loss_coins)),
            Value::Uint(u64::from(self.loss_exp)),
        ])
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BoardConfig {
    pub spawn_weights: Vec<SpawnWeight>,
    pub dead_board_policy: DeadBoardPolicy,
    pub generation_attempts: u16,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpawnWeight {
    pub element: String,
    pub weight: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DeadBoardPolicy {
    Regenerate,
    Shuffle,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartyConfig {
    pub seats: u8,
    pub max_rounds: u16,
    pub max_cascades: u8,
    pub turn_timeout_ms: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceConfig {
    pub mana_cap: u16,
    pub rage_cap: u16,
    pub mana_per_tile: u16,
    pub mana_own_bonus: u16,
    pub rage_per_tile: u16,
    pub rage_per_guard: u16,
    pub rage_per_damage_taken: u16,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DamageConfig {
    /// Attack contribution scale in permille.
    pub attack_scale_pm: u32,
    /// Board contribution scale in permille.
    pub contribution_scale_pm: u32,
    /// Weight of a matched tile whose element matches the actor's Pet.
    pub own_tile_weight_pm: u32,
    pub defense_divisor: u32,
    pub crit_roll_basis: u32,
    pub(super) artifact_scale_pm: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementProfile {
    pub element: String,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub crit_rate_bp: u16,
    pub crit_damage_bp: u16,
    /// Additive critical damage in basis points when attacking the encounter Boss.
    pub boss_crit_damage_bonus_bp: Option<u16>,
    pub hp_growth: u32,
    pub attack_growth: u32,
    pub defense_growth: u32,
    /// Attacker effectiveness in permille, keyed by defender element.
    pub effectiveness: Vec<ElementWeight>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementWeight {
    pub element: String,
    pub permille: u16,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum EscalationClock {
    Turn,
    Round,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MultiplierConfig {
    pub clock_unit: EscalationClock,
    pub schedule: Vec<MultiplierStage>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MultiplierStage {
    /// Inclusive activation boundary on the escalation clock.
    pub from: u16,
    pub tiers: Vec<MultiplierTier>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MultiplierTier {
    pub multiplier: u8,
    pub weight: u32,
    /// Damage contribution weight in permille (1000 = baseline x1).
    pub damage_weight_pm: u32,
    /// Resource contribution weight in permille.
    pub resource_weight_pm: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncounterPayout {
    pub achievement_points: u32,
    pub coins: u32,
    pub exp: u32,
    pub materials: u32,
}

impl EncounterPayout {
    fn to_value(&self) -> Value {
        list(
            [
                self.achievement_points,
                self.coins,
                self.exp,
                self.materials,
            ]
            .map(|v| Value::Uint(u64::from(v))),
        )
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if [
            self.achievement_points,
            self.coins,
            self.exp,
            self.materials,
        ]
        .into_iter()
        .any(|v| v > 1_000_000)
        {
            return Err(ConfigError::Rewards);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncounterRewards {
    /// Successful combat commands per seat, excluding the initial Start command.
    pub minimum_actions: Option<ParticipationThreshold>,
    /// Eligible species in canonical recruitment order, if authored.
    pub recruitment_pet_ids: Option<Vec<String>>,
    pub first_clear: EncounterPayout,
    pub repeat_clear: EncounterPayout,
    pub defeat: EncounterPayout,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParticipationThreshold {
    pub victory: u16,
    pub defeat: u16,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BossConfig {
    pub id: String,
    pub map_id: Option<String>,
    /// Published campaign clear required to host a room for this Boss.
    /// Nest enforces it before room creation.
    pub required_map_clear: Option<String>,
    pub name: String,
    pub element: String,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub crit_rate_bp: u16,
    pub crit_damage_bp: u16,
    pub phase: PhaseConfig,
    pub attack_model: BossAttackModel,
    pub telegraph_turns: u8,
    /// Achievement Points an account must hold to create a room for this Boss.
    /// Authored and published; the engine carries it into the content digest but
    /// does not spend it during combat.
    pub required_room_points: u32,
    pub reward_policy: Option<EncounterRewards>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhaseConfig {
    /// Remaining-HP threshold that triggers the phase change, in basis points.
    pub threshold_bp: u16,
    /// Phase-2 maximum-HP growth over phase-1 maximum, in basis points.
    pub max_growth_bp: u16,
    /// Phase-2 current HP as basis points of the new maximum.
    pub current_bp: u16,
    /// Phase-2 attack as permille of the phase-1 attack.
    pub phase2_attack_pm: u16,
    pub excess_damage: ExcessDamage,
    /// Phase-2 attack targets this many defenders per enemy turn.
    pub attack_targets: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExcessDamage {
    Discard,
    Carry,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BossAttackModel {
    pub base_damage: u32,
    pub per_round_damage: u32,
    pub defense_divisor: u32,
    pub minimum_damage: u32,
    pub vulnerability: Option<BossVulnerability>,
    pub target_priority: Option<BossTargetPriority>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BossTargetPriority {
    HighestMana,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BossVulnerability {
    /// Bonus incoming damage in permille after the attack that applies it.
    pub value_pm: u16,
    pub duration_turns: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SkillKind {
    Skill,
    Signature,
    Ultimate,
    Guard,
    FireZone,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SkillConfig {
    pub id: String,
    pub kind: SkillKind,
    pub mana_cost: u16,
    pub rage_cost: u16,
    pub cooldown_turns: u8,
    pub power_pm: u32,
    pub crit_eligible: bool,
    pub effect: EffectConfig,
    pub upgrade_levels: Option<Vec<SkillUpgrade>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SkillUpgrade {
    pub materials: u32,
    pub power_pm: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectConfig {
    pub kind: EffectKind,
    pub target: EffectTarget,
    pub value: u32,
    pub duration_turns: u8,
    /// Multiplier applied per matching source stack (1000 = no stacking).
    pub stacking_pm: u16,
    pub contribution: Option<SupportContribution>,
    /// Number of damage packets in a chain cast against the Boss.
    pub hits: Option<u8>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SupportContribution {
    Caster,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EffectKind {
    Damage,
    DamageOverTime,
    Heal,
    Shield,
    Buff,
    Debuff,
    RageTransfer,
    ManaRestore,
    Cleanse,
    ChainDamage,
    Curse,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EffectTarget {
    Boss,
    SelfActor,
    Allies,
    LowestAlly,
    LowestRageAlly,
    LowestManaAlly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetConfig {
    pub id: String,
    pub element: String,
    pub rarity: String,
    pub power_class: String,
    pub catalog: Option<PetCatalog>,
    pub growth: Option<PetGrowth>,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub crit_rate_bp: u16,
    pub crit_damage_bp: u16,
    pub skill: String,
    pub signature: String,
    pub ultimate: String,
    pub guard: String,
    #[serde(default)]
    pub fire_zone: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetCatalog {
    pub name: String,
    pub map_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PetGrowth {
    pub curve: String,
    pub health_bp: u16,
    pub attack_bp: u16,
    pub defense_bp: u16,
    pub bias_pm: i16,
}

impl PetGrowth {
    pub fn stat(&self, base: u32, rate: u16, steps: u32) -> Result<u32, ConfigError> {
        let factor = u64::try_from(1000 + i32::from(self.bias_pm)).map_err(|_| ConfigError::Pet)?;
        let increase = u64::from(base) * u64::from(rate) * u64::from(steps) * factor / 10_000_000;
        u32::try_from(u64::from(base) + increase).map_err(|_| ConfigError::Arithmetic)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigError {
    Malformed,
    Identity,
    ElementSet,
    DuplicateElement,
    Effectiveness,
    SpawnWeights,
    Party,
    Resources,
    Damage,
    MultiplierSchedule,
    Boss,
    BossPhase,
    DuplicateSkill,
    MissingSkill,
    Skill,
    MissingPet,
    DuplicatePet,
    Pet,
    PetBudget,
    MissingReference,
    Arithmetic,
    Rewards,
    Artifact,
}

impl ConfigError {
    pub const fn message(self) -> &'static str {
        match self {
            Self::Malformed => "gameplay configuration is missing or malformed",
            Self::Identity => "gameplay configuration identity or capability is unsupported",
            Self::ElementSet => "gameplay configuration must define the six elements",
            Self::DuplicateElement => "gameplay configuration repeats an element",
            Self::Effectiveness => "gameplay elemental matrix is incomplete or invalid",
            Self::SpawnWeights => "gameplay board spawn weights are invalid",
            Self::Party => "gameplay party structure is invalid",
            Self::Resources => "gameplay resource configuration is invalid",
            Self::Damage => "gameplay damage configuration is invalid",
            Self::MultiplierSchedule => "gameplay multiplier schedule is invalid",
            Self::Boss => "gameplay Boss configuration is invalid",
            Self::BossPhase => "gameplay Boss phase configuration is outside the supported range",
            Self::DuplicateSkill => "gameplay configuration repeats a skill id",
            Self::MissingSkill => "gameplay configuration has no skills",
            Self::Skill => "gameplay skill configuration is invalid",
            Self::MissingPet => "gameplay configuration has no Pets",
            Self::DuplicatePet => "gameplay configuration repeats a Pet id",
            Self::Pet => "gameplay Pet configuration is invalid",
            Self::PetBudget => "gameplay Pet stats exceed the elemental budget",
            Self::MissingReference => "gameplay configuration references a missing skill",
            Self::Arithmetic => "gameplay configuration numeric bounds are unsafe",
            Self::Rewards => "gameplay reward configuration is outside the supported range",
            Self::Artifact => "gameplay Artifact configuration or loadout is invalid",
        }
    }
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for ConfigError {}

impl CoopConfig {
    /// Parse an authoritative bundle. Unknown or missing fields are rejected.
    pub fn parse(bytes: &[u8]) -> Result<Self, ConfigError> {
        if bytes.is_empty() || bytes.len() > 1_048_576 {
            return Err(ConfigError::Malformed);
        }
        let config: Self = serde_json::from_slice(bytes).map_err(|_| ConfigError::Malformed)?;
        config.validate()?;
        Ok(config)
    }

    /// Full semantic validation of the configuration graph.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if !matches!(
            self.schema_version,
            HISTORICAL_SCHEMA_VERSION | CONFIG_SCHEMA_VERSION
        ) || self.engine_capability != ENGINE_CAPABILITY
            || self.config_id.is_empty()
            || self.config_id.len() > 64
            || !self
                .config_id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
            || self.content_revision == 0
        {
            return Err(ConfigError::Identity);
        }
        self.board.validate()?;
        self.party.validate()?;
        self.resources.validate()?;
        self.damage.validate()?;
        match (&self.artifacts, self.damage.artifact_scale_pm) {
            (None, Some(_)) => {} // Previously published scalar-based bundles.
            (Some(artifacts), None) if self.schema_version == CONFIG_SCHEMA_VERSION => {
                artifacts.validate()?;
            }
            _ => return Err(ConfigError::Artifact),
        }
        let elements = self.element_index()?;
        let mut immunity = false;
        for profile in &self.elements {
            if self.schema_version == HISTORICAL_SCHEMA_VERSION
                && profile.boss_crit_damage_bonus_bp.is_some()
            {
                return Err(ConfigError::ElementSet);
            }
            profile.validate()?;
            // The MVP matrix intentionally carries at least one immunity across
            // the whole attacker/defender graph, not one per attacker row.
            immunity |= profile.effectiveness_table()?.contains(&0);
        }
        if !immunity {
            return Err(ConfigError::Effectiveness);
        }
        self.multiplier.validate()?;
        let bosses = match (self.schema_version, &self.boss, &self.bosses) {
            (HISTORICAL_SCHEMA_VERSION, Some(boss), None) => std::slice::from_ref(boss),
            (CONFIG_SCHEMA_VERSION, None, Some(bosses))
                if !bosses.is_empty() && bosses.len() <= 6 =>
            {
                bosses
            }
            _ => return Err(ConfigError::Boss),
        };
        let mut boss_ids = BTreeSet::new();
        let mut map_ids = BTreeSet::new();
        let mut prerequisites = BTreeMap::new();
        for boss in bosses {
            match (self.schema_version, boss.map_id.as_deref()) {
                (HISTORICAL_SCHEMA_VERSION, None) => (),
                (CONFIG_SCHEMA_VERSION, Some(map)) if stable_id(map) && map_ids.insert(map) => (),
                _ => return Err(ConfigError::Boss),
            }
            if !stable_id(&boss.id) || !boss_ids.insert(&boss.id) {
                return Err(ConfigError::Boss);
            }
            if self.schema_version == HISTORICAL_SCHEMA_VERSION
                && (boss.attack_model.vulnerability.is_some()
                    || boss.attack_model.target_priority.is_some())
            {
                return Err(ConfigError::Boss);
            }
            if let Some(required) = boss.required_map_clear.as_deref() {
                let map = boss.map_id.as_deref().ok_or(ConfigError::Boss)?;
                prerequisites.insert(map, required);
            }
            boss.validate(elements)?;
            if let Some(pet_ids) = boss
                .reward_policy
                .as_ref()
                .and_then(|policy| policy.recruitment_pet_ids.as_deref())
            {
                self.validate_recruitment(boss, pet_ids)?;
            }
        }
        for &map in prerequisites.keys() {
            let mut visited = BTreeSet::new();
            let mut current = map;
            while let Some(&required) = prerequisites.get(current) {
                if !map_ids.contains(required) || !visited.insert(current) {
                    return Err(ConfigError::Boss);
                }
                current = required;
            }
        }
        let skills = self.skill_index()?;
        self.pets_validate(elements, &skills)?;
        self.rewards.validate()?;
        Ok(())
    }

    /// Canonical digest bound into the immutable match snapshot.
    pub fn digest(&self) -> [u8; 32] {
        hash(DIGEST_DOMAIN, &self.to_value()).expect("bounded authored configuration")
    }

    /// Canonical value used for the digest.
    pub fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Uint(u64::from(self.schema_version)),
            Value::Text(self.engine_capability.clone()),
            Value::Text(self.config_id.clone()),
            Value::Uint(u64::from(self.content_revision)),
            self.board.to_value(),
            self.party.to_value(),
            self.resources.to_value(),
            self.damage.to_value(),
            Value::List(self.elements.iter().map(ElementProfile::to_value).collect()),
            self.multiplier.to_value(),
            match &self.boss {
                Some(boss) => boss.to_value(),
                None => Value::List(self.bosses().iter().map(BossConfig::to_value).collect()),
            },
            Value::List(self.skills.iter().map(SkillConfig::to_value).collect()),
            Value::List(self.pets.iter().map(PetConfig::to_value).collect()),
            self.rewards.to_value(),
        ];
        if let Some(artifacts) = &self.artifacts {
            fields.push(artifacts.to_value());
        }
        Value::List(fields)
    }

    pub fn has_artifact_catalog(&self) -> bool {
        self.artifacts.is_some()
    }

    pub fn bosses(&self) -> &[BossConfig] {
        self.boss.as_ref().map_or_else(
            || self.bosses.as_deref().unwrap_or_default(),
            std::slice::from_ref,
        )
    }

    /// Element profiles in canonical element order.
    pub fn element_index(&self) -> Result<[&ElementProfile; 6], ConfigError> {
        if self.elements.len() != 6 {
            return Err(ConfigError::ElementSet);
        }
        let mut seen = [false; 6];
        let mut rows: [Option<&ElementProfile>; 6] = [None; 6];
        for profile in &self.elements {
            let element = parse_element(&profile.element)?;
            if std::mem::replace(&mut seen[element.index()], true) {
                return Err(ConfigError::DuplicateElement);
            }
            rows[element.index()] = Some(profile);
        }
        Ok([
            rows[0].ok_or(ConfigError::ElementSet)?,
            rows[1].ok_or(ConfigError::ElementSet)?,
            rows[2].ok_or(ConfigError::ElementSet)?,
            rows[3].ok_or(ConfigError::ElementSet)?,
            rows[4].ok_or(ConfigError::ElementSet)?,
            rows[5].ok_or(ConfigError::ElementSet)?,
        ])
    }

    pub fn skill(&self, id: &str) -> Option<&SkillConfig> {
        self.skills.iter().find(|skill| skill.id == id)
    }

    pub fn pet(&self, id: &str) -> Option<&PetConfig> {
        self.pets.iter().find(|pet| pet.id == id)
    }

    fn skill_index(&self) -> Result<BTreeMap<&str, &SkillConfig>, ConfigError> {
        let mut skills = BTreeMap::new();
        if self.skills.is_empty() {
            return Err(ConfigError::MissingSkill);
        }
        for skill in &self.skills {
            if skill.id.is_empty() || skill.id.len() > 64 {
                return Err(ConfigError::Skill);
            }
            if self.schema_version == HISTORICAL_SCHEMA_VERSION
                && (skill.effect.contribution.is_some() || skill.effect.kind.is_extended())
            {
                return Err(ConfigError::Skill);
            }
            if self.schema_version == HISTORICAL_SCHEMA_VERSION && skill.upgrade_levels.is_some() {
                return Err(ConfigError::Skill);
            }
            skill.validate(&self.resources)?;
            if skills.insert(skill.id.as_str(), skill).is_some() {
                return Err(ConfigError::DuplicateSkill);
            }
        }
        Ok(skills)
    }

    fn validate_recruitment(
        &self,
        boss: &BossConfig,
        pet_ids: &[String],
    ) -> Result<(), ConfigError> {
        let map = MAPS
            .iter()
            .find(|map| Some(map.id) == boss.map_id.as_deref())
            .ok_or(ConfigError::Rewards)?;
        if pet_ids.is_empty() {
            return Err(ConfigError::Rewards);
        }
        let mut previous = None;
        for pet_id in pet_ids {
            let pet = self
                .pets
                .iter()
                .find(|pet| pet.id == *pet_id)
                .ok_or(ConfigError::Rewards)?;
            let (index, identity) = IDENTITIES
                .iter()
                .enumerate()
                .find(|(_, identity)| identity.id == pet_id)
                .ok_or(ConfigError::Rewards)?;
            let legendary = matches!(
                identity.id,
                "fire-pyrecrown"
                    | "water-lagoonarch"
                    | "electric-stormdiadem"
                    | "ground-faultwarden"
                    | "ghost-lanternwake"
                    | "light-dawnarchon"
            );
            let rarity = if legendary {
                "map-legendary"
            } else {
                "map-regular"
            };
            // Match the Wave 1 catalog preference: regulars in roster order,
            // then the map Legendary. The published order pins the selection.
            let priority = (legendary, index);
            if identity.roster_state != RosterState::Active
                || identity.family != "core"
                || identity.id == FEATURED_LIMITED_ID
                || STANDARD_POOL.contains(&identity.id)
                || identity.element.index() != map.element.index()
                || pet.element()? != identity.element
                || pet.rarity != rarity
                || pet
                    .catalog
                    .as_ref()
                    .and_then(|catalog| catalog.map_id.as_deref())
                    != Some(map.id)
                || previous.is_some_and(|prior| prior >= priority)
            {
                return Err(ConfigError::Rewards);
            }
            previous = Some(priority);
        }
        Ok(())
    }

    fn pets_validate(
        &self,
        elements: [&ElementProfile; 6],
        skills: &BTreeMap<&str, &SkillConfig>,
    ) -> Result<(), ConfigError> {
        if self.pets.is_empty() {
            return Err(ConfigError::MissingPet);
        }
        let mut seen = BTreeSet::new();
        let individual_growth = self.pets.iter().any(|pet| pet.growth.is_some());
        for pet in &self.pets {
            if individual_growth {
                let growth = pet.growth.as_ref().ok_or(ConfigError::Pet)?;
                if self.schema_version == HISTORICAL_SCHEMA_VERSION
                    || !matches!(
                        growth.curve.as_str(),
                        "steady" | "focused" | "bulwark" | "dragon" | "agile"
                    )
                    || growth.bias_pm.unsigned_abs() > 100
                    || [growth.health_bp, growth.attack_bp, growth.defense_bp]
                        .iter()
                        .any(|&rate| rate > 250)
                {
                    return Err(ConfigError::Pet);
                }
                growth.stat(pet.max_hp, growth.health_bp, 99)?;
                growth.stat(pet.attack, growth.attack_bp, 99)?;
                growth.stat(pet.defense, growth.defense_bp, 99)?;
            }
            if pet.id.is_empty() || pet.id.len() > 64 || pet.max_hp == 0 || pet.attack == 0 {
                return Err(ConfigError::Pet);
            }
            match (self.schema_version, &pet.catalog) {
                (HISTORICAL_SCHEMA_VERSION, None) => (),
                (CONFIG_SCHEMA_VERSION, Some(catalog))
                    if catalog.name.trim() == catalog.name
                        && !catalog.name.is_empty()
                        && catalog.name.len() <= 128
                        && catalog.map_id.as_deref().is_none_or(stable_id)
                        && matches!(pet.power_class.as_str(), "s" | "a" | "b")
                        && matches!(
                            pet.rarity.as_str(),
                            "limited-s"
                                | "standard-s"
                                | "map-legendary"
                                | "map-regular"
                                | "family-exploration"
                        )
                        && !crate::arena8::binding::identity(&pet.id).is_some_and(|identity| {
                            identity.roster_state == crate::arena8::binding::RosterState::Candidate
                        }) => {}
                _ => return Err(ConfigError::Pet),
            }
            if pet.crit_rate_bp > 10_000 || pet.crit_damage_bp == 0 {
                return Err(ConfigError::Pet);
            }
            if !seen.insert(pet.id.as_str()) {
                return Err(ConfigError::DuplicatePet);
            }
            let element = parse_element(&pet.element)?;
            let profile = elements[element.index()];
            if profile.boss_crit_damage_bonus_bp.is_some_and(|bonus| {
                pet.crit_damage_bp < 10_000 || pet.crit_damage_bp.checked_add(bonus).is_none()
            }) {
                return Err(ConfigError::Pet);
            }
            // A Pet keeps its individual identity but must stay within the
            // authored elemental budget envelope.
            if pet.max_hp > profile.max_hp.saturating_mul(4)
                || pet.attack > profile.attack.saturating_mul(4)
                || pet.defense > profile.defense.saturating_mul(4)
            {
                return Err(ConfigError::PetBudget);
            }
            for (binding, kind) in [
                (Some(&pet.skill), SkillKind::Skill),
                (Some(&pet.signature), SkillKind::Signature),
                (Some(&pet.ultimate), SkillKind::Ultimate),
                (Some(&pet.guard), SkillKind::Guard),
                (pet.fire_zone.as_ref(), SkillKind::FireZone),
            ] {
                if let Some(binding) = binding {
                    let skill = skills
                        .get(binding.as_str())
                        .ok_or(ConfigError::MissingReference)?;
                    if skill.effect.kind.is_extended() && skill.kind != kind {
                        return Err(ConfigError::Skill);
                    }
                }
            }
        }
        Ok(())
    }
}

impl BoardConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.spawn_weights.len() != 6 {
            return Err(ConfigError::SpawnWeights);
        }
        let mut seen = [false; 6];
        let mut total = 0u32;
        for weight in &self.spawn_weights {
            let element = parse_element(&weight.element)?;
            if weight.weight == 0 || std::mem::replace(&mut seen[element.index()], true) {
                return Err(ConfigError::SpawnWeights);
            }
            total = total
                .checked_add(weight.weight)
                .ok_or(ConfigError::Arithmetic)?;
        }
        if total == 0 || self.generation_attempts < 1 {
            return Err(ConfigError::SpawnWeights);
        }
        Ok(())
    }

    /// Weighted element spawn table in canonical element order.
    pub fn spawn_table(&self) -> Result<([u32; 6], u32), ConfigError> {
        let mut table = [0u32; 6];
        for weight in &self.spawn_weights {
            table[parse_element(&weight.element)?.index()] = weight.weight;
        }
        let total = table
            .iter()
            .try_fold(0u32, |acc, value| acc.checked_add(*value))
            .ok_or(ConfigError::Arithmetic)?;
        if total == 0 {
            return Err(ConfigError::SpawnWeights);
        }
        Ok((table, total))
    }

    fn to_value(&self) -> Value {
        list([
            Value::List(
                self.spawn_weights
                    .iter()
                    .map(|weight| {
                        list([
                            Value::Text(weight.element.clone()),
                            Value::Uint(u64::from(weight.weight)),
                        ])
                    })
                    .collect(),
            ),
            Value::Text(dead_board_name(self.dead_board_policy).into()),
            Value::Uint(u64::from(self.generation_attempts)),
        ])
    }
}

impl PartyConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if usize::from(self.seats) != crate::arena8::coop::SEATS
            || self.max_rounds == 0
            || self.max_rounds > 1_000
            || self.max_cascades == 0
            || self.max_cascades > MAX_CASCADE_LIMIT
            || self.turn_timeout_ms < 1_000
        {
            return Err(ConfigError::Party);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        list([
            Value::Uint(u64::from(self.seats)),
            Value::Uint(u64::from(self.max_rounds)),
            Value::Uint(u64::from(self.max_cascades)),
            Value::Uint(u64::from(self.turn_timeout_ms)),
        ])
    }
}

impl ResourceConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.mana_cap == 0
            || self.rage_cap == 0
            || self.mana_per_tile > self.mana_cap
            || self.rage_per_tile > self.rage_cap
            || self.rage_per_guard > self.rage_cap
            || self.rage_per_damage_taken > self.rage_cap
        {
            return Err(ConfigError::Resources);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        list([
            Value::Uint(u64::from(self.mana_cap)),
            Value::Uint(u64::from(self.rage_cap)),
            Value::Uint(u64::from(self.mana_per_tile)),
            Value::Uint(u64::from(self.mana_own_bonus)),
            Value::Uint(u64::from(self.rage_per_tile)),
            Value::Uint(u64::from(self.rage_per_guard)),
            Value::Uint(u64::from(self.rage_per_damage_taken)),
        ])
    }
}

impl DamageConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.attack_scale_pm == 0
            || self.contribution_scale_pm == 0
            || self.own_tile_weight_pm < 1_000
            || self.own_tile_weight_pm > 10_000
            || self.defense_divisor == 0
            || self.crit_roll_basis == 0
            || !(10_000..=1_000_000).contains(&self.crit_roll_basis)
            || self.artifact_scale_pm == Some(0)
        {
            return Err(ConfigError::Damage);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        list([
            Value::Uint(u64::from(self.attack_scale_pm)),
            Value::Uint(u64::from(self.contribution_scale_pm)),
            Value::Uint(u64::from(self.own_tile_weight_pm)),
            Value::Uint(u64::from(self.defense_divisor)),
            Value::Uint(u64::from(self.crit_roll_basis)),
            self.artifact_scale_pm
                .map_or(Value::Null, |scale| Value::Uint(u64::from(scale))),
        ])
    }
}

impl MultiplierConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.schedule.is_empty() || self.schedule[0].from != 0 {
            return Err(ConfigError::MultiplierSchedule);
        }
        let mut previous = None;
        for stage in &self.schedule {
            if let Some(boundary) = previous
                && stage.from <= boundary
            {
                return Err(ConfigError::MultiplierSchedule);
            }
            previous = Some(stage.from);
            if stage.tiers.is_empty() {
                return Err(ConfigError::MultiplierSchedule);
            }
            let mut seen = BTreeSet::new();
            let mut total = 0u64;
            for tier in &stage.tiers {
                if tier.multiplier == 0
                    || tier.weight == 0
                    || !seen.insert(tier.multiplier)
                    || tier.damage_weight_pm > 100_000
                {
                    return Err(ConfigError::MultiplierSchedule);
                }
                total += u64::from(tier.weight);
            }
            if total == 0 {
                return Err(ConfigError::MultiplierSchedule);
            }
        }
        if !self.schedule[0]
            .tiers
            .iter()
            .any(|tier| tier.multiplier == 1)
        {
            return Err(ConfigError::MultiplierSchedule);
        }
        // A tile spawned under one stage survives into later stages. The same
        // multiplier therefore must resolve to the same authored weights in
        // every stage, so a tile can never silently change meaning.
        let mut weights: BTreeMap<u8, (u32, u32)> = BTreeMap::new();
        for stage in &self.schedule {
            for tier in &stage.tiers {
                match weights.get(&tier.multiplier) {
                    Some((damage, resource))
                        if *damage != tier.damage_weight_pm
                            || *resource != tier.resource_weight_pm =>
                    {
                        return Err(ConfigError::MultiplierSchedule);
                    }
                    Some(_) => {}
                    None => {
                        weights.insert(
                            tier.multiplier,
                            (tier.damage_weight_pm, tier.resource_weight_pm),
                        );
                    }
                }
            }
        }
        Ok(())
    }

    /// Authored damage contribution of an existing tile multiplier.
    pub fn damage_weight(&self, multiplier: u8) -> Result<u32, ConfigError> {
        self.weights()
            .get(&multiplier)
            .map(|weights| weights.0)
            .ok_or(ConfigError::MultiplierSchedule)
    }

    /// Authored resource contribution of an existing tile multiplier.
    pub fn resource_weight(&self, multiplier: u8) -> Result<u32, ConfigError> {
        self.weights()
            .get(&multiplier)
            .map(|weights| weights.1)
            .ok_or(ConfigError::MultiplierSchedule)
    }

    fn weights(&self) -> BTreeMap<u8, (u32, u32)> {
        let mut weights = BTreeMap::new();
        for stage in &self.schedule {
            for tier in &stage.tiers {
                weights
                    .entry(tier.multiplier)
                    .or_insert((tier.damage_weight_pm, tier.resource_weight_pm));
            }
        }
        weights
    }

    fn to_value(&self) -> Value {
        list([
            Value::Text(
                match self.clock_unit {
                    EscalationClock::Turn => "turn",
                    EscalationClock::Round => "round",
                }
                .into(),
            ),
            Value::List(
                self.schedule
                    .iter()
                    .map(|stage| {
                        list([
                            Value::Uint(u64::from(stage.from)),
                            Value::List(
                                stage
                                    .tiers
                                    .iter()
                                    .map(|tier| {
                                        list([
                                            Value::Uint(u64::from(tier.multiplier)),
                                            Value::Uint(u64::from(tier.weight)),
                                            Value::Uint(u64::from(tier.damage_weight_pm)),
                                            Value::Uint(u64::from(tier.resource_weight_pm)),
                                        ])
                                    })
                                    .collect(),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ])
    }

    /// Weighted tier for the given escalation clock, with no modulo bias inside
    /// the caller-provided roll range (`roll < basis`).
    pub fn tier_for(&self, clock: u16, roll: u32) -> Result<&MultiplierTier, ConfigError> {
        let stage = self
            .schedule
            .iter()
            .rev()
            .find(|stage| stage.from <= clock)
            .ok_or(ConfigError::MultiplierSchedule)?;
        let total = stage
            .tiers
            .iter()
            .try_fold(0u64, |acc, tier| acc.checked_add(u64::from(tier.weight)));
        let total = total.ok_or(ConfigError::Arithmetic)?;
        if total == 0 {
            return Err(ConfigError::MultiplierSchedule);
        }
        let mut point = u64::from(roll) % total;
        for tier in &stage.tiers {
            let weight = u64::from(tier.weight);
            if point < weight {
                return Ok(tier);
            }
            point -= weight;
        }
        stage.tiers.last().ok_or(ConfigError::MultiplierSchedule)
    }

    /// Total weight budget of the stage active at `clock`.
    pub fn weight_budget(&self, clock: u16) -> Result<u32, ConfigError> {
        let stage = self
            .schedule
            .iter()
            .rev()
            .find(|stage| stage.from <= clock)
            .ok_or(ConfigError::MultiplierSchedule)?;
        let total = stage
            .tiers
            .iter()
            .try_fold(0u32, |acc, tier| acc.checked_add(tier.weight));
        total
            .filter(|total| *total > 0)
            .ok_or(ConfigError::MultiplierSchedule)
    }
}

impl ElementProfile {
    /// Effectiveness matrix must be complete, in range and non-degenerate.
    pub fn effectiveness_table(&self) -> Result<[u16; 6], ConfigError> {
        if self.effectiveness.len() != 6 {
            return Err(ConfigError::Effectiveness);
        }
        let mut table = [0u16; 6];
        let mut seen = [false; 6];
        for row in &self.effectiveness {
            let defender = parse_element(&row.element)?;
            if row.permille > 3_000 || std::mem::replace(&mut seen[defender.index()], true) {
                return Err(ConfigError::Effectiveness);
            }
            table[defender.index()] = row.permille;
        }
        if seen.iter().filter(|value| **value).count() != 6 || table.iter().all(|value| *value == 0)
        {
            return Err(ConfigError::Effectiveness);
        }
        Ok(table)
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if self.max_hp == 0
            || self.attack == 0
            || self.defense == 0
            || self.crit_rate_bp > 10_000
            || self.crit_damage_bp < 10_000
            || self.crit_damage_bp > 40_000
            || self
                .boss_crit_damage_bonus_bp
                .is_some_and(|bonus| !(1..=10_000).contains(&bonus))
        {
            return Err(ConfigError::ElementSet);
        }
        self.effectiveness_table()?;
        Ok(())
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Text(self.element.clone()),
            Value::Uint(u64::from(self.max_hp)),
            Value::Uint(u64::from(self.attack)),
            Value::Uint(u64::from(self.defense)),
            Value::Uint(u64::from(self.crit_rate_bp)),
            Value::Uint(u64::from(self.crit_damage_bp)),
            Value::Uint(u64::from(self.hp_growth)),
            Value::Uint(u64::from(self.attack_growth)),
            Value::Uint(u64::from(self.defense_growth)),
            Value::List(
                self.effectiveness
                    .iter()
                    .map(|row| {
                        list([
                            Value::Text(row.element.clone()),
                            Value::Uint(u64::from(row.permille)),
                        ])
                    })
                    .collect(),
            ),
        ];
        if let Some(bonus) = self.boss_crit_damage_bonus_bp {
            fields.push(Value::Uint(u64::from(bonus)));
        }
        Value::List(fields)
    }
}

impl BossConfig {
    fn validate(&self, elements: [&ElementProfile; 6]) -> Result<(), ConfigError> {
        let element = parse_element(&self.element)?;
        if self.id.is_empty()
            || self.name.is_empty()
            || self.max_hp == 0
            || self.attack == 0
            || self.defense == 0
            || self.crit_rate_bp > 10_000
            || self.crit_damage_bp < 10_000
            || self.telegraph_turns == 0
            || self.telegraph_turns > 8
            || self.required_room_points > 1_000_000
            || elements[element.index()].element != self.element
        {
            return Err(ConfigError::Boss);
        }
        if let Some(policy) = &self.reward_policy {
            if self.map_id.is_none()
                || policy.minimum_actions.as_ref().is_some_and(|limits| {
                    limits.victory > super::MAX_TURNS || limits.defeat > super::MAX_TURNS
                })
            {
                return Err(ConfigError::Rewards);
            }
            for payout in [&policy.first_clear, &policy.repeat_clear, &policy.defeat] {
                payout.validate()?;
            }
        }
        self.phase.validate()?;
        if self.phase2_current_hp()? == 0 {
            return Err(ConfigError::BossPhase);
        }
        self.attack_model.validate()?;
        Ok(())
    }

    pub fn element(&self) -> Result<Element, ConfigError> {
        parse_element(&self.element)
    }

    /// Phase-2 threshold in HP points.
    pub fn phase_threshold(&self) -> u32 {
        u32::try_from(u64::from(self.max_hp) * u64::from(self.phase.threshold_bp) / 10_000)
            .unwrap_or(u32::MAX)
    }

    /// Phase-2 maximum HP.
    pub fn phase2_max_hp(&self) -> Result<u32, ConfigError> {
        u64::from(self.max_hp)
            .checked_mul(10_000 + u64::from(self.phase.max_growth_bp))
            .and_then(|value| value.checked_div(10_000))
            .and_then(|value| u32::try_from(value).ok())
            .ok_or(ConfigError::Arithmetic)
    }

    /// Phase-2 initial current HP.
    pub fn phase2_current_hp(&self) -> Result<u32, ConfigError> {
        u64::from(self.phase2_max_hp()?)
            .checked_mul(u64::from(self.phase.current_bp))
            .and_then(|value| value.checked_div(10_000))
            .and_then(|value| u32::try_from(value).ok())
            .ok_or(ConfigError::Arithmetic)
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Text(self.id.clone()),
            Value::Text(self.name.clone()),
            Value::Text(self.element.clone()),
            Value::Uint(u64::from(self.max_hp)),
            Value::Uint(u64::from(self.attack)),
            Value::Uint(u64::from(self.defense)),
            Value::Uint(u64::from(self.crit_rate_bp)),
            Value::Uint(u64::from(self.crit_damage_bp)),
            self.phase.to_value(),
            self.attack_model.to_value(),
            Value::Uint(u64::from(self.telegraph_turns)),
            Value::Uint(u64::from(self.required_room_points)),
        ];
        if let Some(map_id) = &self.map_id {
            fields.push(Value::Text(map_id.clone()));
        }
        if let Some(p) = &self.reward_policy {
            let mut payouts = vec![
                p.first_clear.to_value(),
                p.repeat_clear.to_value(),
                p.defeat.to_value(),
            ];
            if let Some(limits) = &p.minimum_actions {
                payouts.push(list([
                    Value::Uint(u64::from(limits.victory)),
                    Value::Uint(u64::from(limits.defeat)),
                ]));
            }
            if let Some(pet_ids) = &p.recruitment_pet_ids {
                payouts.push(list(pet_ids.iter().cloned().map(Value::Text)));
            }
            fields.push(Value::List(payouts));
        }
        if let Some(required) = &self.required_map_clear {
            // Append only when authored to preserve existing published digests.
            fields.push(Value::Text(required.clone()));
        }
        Value::List(fields)
    }
}

pub(super) fn stable_id(value: &str) -> bool {
    (3..=64).contains(&value.len())
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

impl PhaseConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        // Owner design range: transition 20-30%, growth 50-100%, current 80%.
        if !(1_500..=3_500).contains(&self.threshold_bp)
            || !(5_000..=10_000).contains(&self.max_growth_bp)
            || !(1..=10_000).contains(&self.current_bp)
            || self.phase2_attack_pm == 0
            || self.attack_targets == 0
            || self.attack_targets > 4
        {
            return Err(ConfigError::BossPhase);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        list([
            Value::Uint(u64::from(self.threshold_bp)),
            Value::Uint(u64::from(self.max_growth_bp)),
            Value::Uint(u64::from(self.current_bp)),
            Value::Uint(u64::from(self.phase2_attack_pm)),
            Value::Text(
                match self.excess_damage {
                    ExcessDamage::Discard => "discard",
                    ExcessDamage::Carry => "carry",
                }
                .into(),
            ),
            Value::Uint(u64::from(self.attack_targets)),
        ])
    }
}

impl BossAttackModel {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.base_damage == 0 || self.defense_divisor == 0 || self.minimum_damage == 0 {
            return Err(ConfigError::Boss);
        }
        if self.vulnerability.is_some_and(|status| {
            !(1..=9_000).contains(&status.value_pm) || !(2..=32).contains(&status.duration_turns)
        }) {
            return Err(ConfigError::Boss);
        }
        Ok(())
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Uint(u64::from(self.base_damage)),
            Value::Uint(u64::from(self.per_round_damage)),
            Value::Uint(u64::from(self.defense_divisor)),
            Value::Uint(u64::from(self.minimum_damage)),
        ];
        if let Some(status) = self.vulnerability {
            fields.push(list([
                Value::Uint(u64::from(status.value_pm)),
                Value::Uint(u64::from(status.duration_turns)),
            ]));
        }
        if let Some(priority) = self.target_priority {
            fields.push(Value::Text(match priority {
                BossTargetPriority::HighestMana => "highest-mana".into(),
            }));
        }
        Value::List(fields)
    }
}

impl SkillConfig {
    fn validate(&self, resources: &ResourceConfig) -> Result<(), ConfigError> {
        if self.id.is_empty()
            || self.id.len() > 64
            || self.power_pm == 0
            || self.effect.duration_turns > 32
            || self.effect.stacking_pm == 0
            || self.effect.stacking_pm > 10_000
        {
            return Err(ConfigError::Skill);
        }
        if let Some(upgrades) = &self.upgrade_levels {
            if upgrades.is_empty() || upgrades.len() >= usize::from(MAX_SKILL_LEVEL) {
                return Err(ConfigError::Skill);
            }
            let mut previous = self.power_pm;
            for upgrade in upgrades {
                if !(1..=1_000_000).contains(&upgrade.materials)
                    || upgrade.power_pm <= previous
                    || upgrade.power_pm > 10_000
                {
                    return Err(ConfigError::Skill);
                }
                previous = upgrade.power_pm;
            }
        }
        self.effect.validate()?;
        if !self.effect.kind.is_extended() {
            return Ok(());
        }
        if matches!(self.kind, SkillKind::Guard | SkillKind::FireZone)
            || self.mana_cost > resources.mana_cap
            || self.rage_cost > resources.rage_cap
            || self.crit_eligible && self.effect.kind != EffectKind::ChainDamage
        {
            return Err(ConfigError::Skill);
        }
        for power in std::iter::once(self.power_pm).chain(
            self.upgrade_levels
                .iter()
                .flatten()
                .map(|upgrade| upgrade.power_pm),
        ) {
            self.validate_utility_power(resources, power)?;
        }
        Ok(())
    }

    fn validate_utility_power(
        &self,
        resources: &ResourceConfig,
        power: u32,
    ) -> Result<(), ConfigError> {
        let scaled_value = u64::from(self.effect.value) * u64::from(power) / 1_000;
        match self.effect.kind {
            EffectKind::RageTransfer
                if !(1..=u64::from(resources.rage_cap)).contains(&scaled_value)
                    || self.rage_cost == resources.rage_cap =>
            {
                Err(ConfigError::Skill)
            }
            EffectKind::ManaRestore
                if !(1..=u64::from(resources.mana_cap)).contains(&scaled_value) =>
            {
                Err(ConfigError::Skill)
            }
            EffectKind::Curse if !(1..=9_000).contains(&scaled_value) => Err(ConfigError::Skill),
            EffectKind::Cleanse if power != 1_000 => Err(ConfigError::Skill),
            EffectKind::ChainDamage if !(1..=u64::from(u32::MAX)).contains(&scaled_value) => {
                Err(ConfigError::Skill)
            }
            _ => Ok(()),
        }
    }

    pub fn max_level(&self) -> u8 {
        self.upgrade_levels
            .as_ref()
            .map_or(1, |levels| 1 + levels.len() as u8)
    }

    pub fn power_at(&self, level: u8) -> Option<u32> {
        match level {
            0 => None,
            1 => Some(self.power_pm),
            level => self
                .upgrade_levels
                .as_ref()?
                .get(usize::from(level) - 2)
                .map(|upgrade| upgrade.power_pm),
        }
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Text(self.id.clone()),
            Value::Text(skill_kind_name(self.kind).into()),
            Value::Uint(u64::from(self.mana_cost)),
            Value::Uint(u64::from(self.rage_cost)),
            Value::Uint(u64::from(self.cooldown_turns)),
            Value::Uint(u64::from(self.power_pm)),
            Value::Bool(self.crit_eligible),
            self.effect.to_value(),
        ];
        if self.effect.contribution.is_some() {
            fields.push(Value::Text("caster".into()));
        }
        if let Some(upgrades) = &self.upgrade_levels {
            fields.push(list(upgrades.iter().map(|upgrade| {
                list([
                    Value::Uint(u64::from(upgrade.materials)),
                    Value::Uint(u64::from(upgrade.power_pm)),
                ])
            })));
        }
        Value::List(fields)
    }
}

impl EffectConfig {
    fn validate(&self) -> Result<(), ConfigError> {
        if self.value == 0
            || self.contribution.is_some()
                && (!matches!(self.kind, EffectKind::Heal | EffectKind::Shield)
                    || matches!(self.target, EffectTarget::Boss))
        {
            return Err(ConfigError::Skill);
        }
        if self.kind.is_extended() {
            return self.validate_extended();
        }
        if self.hits.is_some()
            || matches!(
                self.target,
                EffectTarget::LowestRageAlly | EffectTarget::LowestManaAlly
            )
        {
            return Err(ConfigError::Skill);
        }
        if matches!(self.kind, EffectKind::Buff | EffectKind::Debuff) && self.duration_turns == 0 {
            return Err(ConfigError::Skill);
        }
        if matches!(self.kind, EffectKind::Damage | EffectKind::DamageOverTime)
            && !matches!(self.target, EffectTarget::Boss)
        {
            return Err(ConfigError::Skill);
        }
        Ok(())
    }

    fn validate_extended(&self) -> Result<(), ConfigError> {
        if self.kind == EffectKind::Curse {
            return if self.target == EffectTarget::Boss
                && self.hits.is_none()
                && (1..=32).contains(&self.duration_turns)
                && self.stacking_pm == 1000
            {
                Ok(())
            } else {
                Err(ConfigError::Skill)
            };
        }
        if self.duration_turns != 0 || self.stacking_pm != 1_000 {
            return Err(ConfigError::Skill);
        }
        match (self.kind, self.target, self.hits) {
            (EffectKind::RageTransfer, EffectTarget::LowestRageAlly, None)
            | (EffectKind::ManaRestore, EffectTarget::LowestManaAlly, None)
            | (EffectKind::ChainDamage, EffectTarget::Boss, Some(2..=8)) => Ok(()),
            (EffectKind::Cleanse, EffectTarget::Allies | EffectTarget::SelfActor, None)
                if self.value == 1 =>
            {
                Ok(())
            }
            _ => Err(ConfigError::Skill),
        }
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Text(effect_kind_name(self.kind).into()),
            Value::Text(effect_target_name(self.target).into()),
            Value::Uint(u64::from(self.value)),
            Value::Uint(u64::from(self.duration_turns)),
            Value::Uint(u64::from(self.stacking_pm)),
        ];
        if let Some(hits) = self.hits {
            fields.push(Value::Uint(u64::from(hits)));
        }
        Value::List(fields)
    }
}

impl EffectKind {
    fn is_extended(self) -> bool {
        matches!(
            self,
            Self::RageTransfer
                | Self::ManaRestore
                | Self::Cleanse
                | Self::ChainDamage
                | Self::Curse
        )
    }
}

impl PetConfig {
    pub fn element(&self) -> Result<Element, ConfigError> {
        parse_element(&self.element)
    }

    pub fn skill_ids(&self) -> [Option<&str>; 5] {
        [
            Some(&self.guard),
            Some(&self.skill),
            Some(&self.signature),
            Some(&self.ultimate),
            self.fire_zone.as_deref(),
        ]
    }

    fn to_value(&self) -> Value {
        let mut fields = vec![
            Value::Text(self.id.clone()),
            Value::Text(self.element.clone()),
            Value::Text(self.rarity.clone()),
            Value::Text(self.power_class.clone()),
            Value::Uint(u64::from(self.max_hp)),
            Value::Uint(u64::from(self.attack)),
            Value::Uint(u64::from(self.defense)),
            Value::Uint(u64::from(self.crit_rate_bp)),
            Value::Uint(u64::from(self.crit_damage_bp)),
            Value::Text(self.skill.clone()),
            Value::Text(self.signature.clone()),
            Value::Text(self.ultimate.clone()),
            Value::Text(self.guard.clone()),
            Value::Text(self.fire_zone.clone().unwrap_or_default()),
        ];
        if let Some(catalog) = &self.catalog {
            fields.push(list([
                Value::Text(catalog.name.clone()),
                catalog
                    .map_id
                    .as_ref()
                    .map_or(Value::Null, |id| Value::Text(id.clone())),
            ]));
        }
        if let Some(growth) = &self.growth {
            fields.push(list([
                Value::Text(growth.curve.clone()),
                Value::Uint(u64::from(growth.health_bp)),
                Value::Uint(u64::from(growth.attack_bp)),
                Value::Uint(u64::from(growth.defense_bp)),
                Value::Int(i64::from(growth.bias_pm)),
            ]));
        }
        Value::List(fields)
    }
}

pub fn parse_element(value: &str) -> Result<Element, ConfigError> {
    match value {
        "fire" => Ok(Element::Fire),
        "water" => Ok(Element::Water),
        "electric" => Ok(Element::Electric),
        "ghost" => Ok(Element::Ghost),
        "ground" => Ok(Element::Ground),
        "light" => Ok(Element::Light),
        _ => Err(ConfigError::ElementSet),
    }
}

const fn dead_board_name(policy: DeadBoardPolicy) -> &'static str {
    match policy {
        DeadBoardPolicy::Regenerate => "regenerate",
        DeadBoardPolicy::Shuffle => "shuffle",
    }
}

const fn skill_kind_name(kind: SkillKind) -> &'static str {
    match kind {
        SkillKind::Skill => "skill",
        SkillKind::Signature => "signature",
        SkillKind::Ultimate => "ultimate",
        SkillKind::Guard => "guard",
        SkillKind::FireZone => "fire-zone",
    }
}

const fn effect_kind_name(kind: EffectKind) -> &'static str {
    match kind {
        EffectKind::Damage => "damage",
        EffectKind::DamageOverTime => "damage-over-time",
        EffectKind::Heal => "heal",
        EffectKind::Shield => "shield",
        EffectKind::Buff => "buff",
        EffectKind::Debuff => "debuff",
        EffectKind::RageTransfer => "rage-transfer",
        EffectKind::ManaRestore => "mana-restore",
        EffectKind::Cleanse => "cleanse",
        EffectKind::ChainDamage => "chain-damage",
        EffectKind::Curse => "curse",
    }
}

const fn effect_target_name(target: EffectTarget) -> &'static str {
    match target {
        EffectTarget::Boss => "boss",
        EffectTarget::SelfActor => "self-actor",
        EffectTarget::Allies => "allies",
        EffectTarget::LowestAlly => "lowest-ally",
        EffectTarget::LowestRageAlly => "lowest-rage-ally",
        EffectTarget::LowestManaAlly => "lowest-mana-ally",
    }
}
