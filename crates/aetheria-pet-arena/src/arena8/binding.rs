//! Bounded, versioned Arena8 content binding.
//!
//! The frozen \`arena8\` v1 tables describe six fixed Pets by array index. This
//! module replaces that assumption with an explicit, versioned binding between
//! the canonical Wave A roster identities and their combat profiles. It is
//! content data plus pure derivation; it owns no I/O and grants no acquisition,
//! banner, art, media or publication authority.
//!
//! Rules that keep distinct Pets distinct:
//! - every bindable identity carries its own authored base stats, growth curve
//!   reference and bounded growth bias;
//! - an identity without an authored profile is never defaulted to another
//!   identity's profile, it resolves to an actionable readiness state;
//! - the six Off-rate candidates stay gated with their owner action text and
//!   have no combat profile at all;
//! - the six verified-slice identities (three starters, Icarus, one Dragon and
//!   one Bird) are marked \`Playable\`; the remaining 49 active identities are
//!   \`Bound\`, which is bindable but outside the verified playable slice.
//!
//! Every table is bounded and every derived value is validated. A change to any
//! table, bound, stat semantic or encounter revision changes the pinned digest
//! and fails closed until the version is re-pinned.

use aetheria_game_core::{Error as CoreError, Value, canonical, canonical::list};
use serde::{Deserialize, Serialize};

use super::Element;
use super::model::{ENCOUNTERS, SignatureKind};

pub const BINDING_ID: &str = "aetheria-pet-arena-arena8-binding";
pub const BINDING_VERSION: u32 = 2;
pub const BOUND_RULESET_ID: &str = "aetheria-pet-arena-arena8-pve";
pub const BOUND_RULESET_VERSION: u32 = 2;
pub const ROSTER_ID: &str = "aetheria-wave-a-canonical-roster";
pub const ROSTER_VERSION: &str = "wave-a-v1";
pub const SNAPSHOT_SCHEMA_VERSION: u16 = 1;
/// Encounter tables are the frozen arena8 v1 tables; the revision is part of the
/// match snapshot so a later encounter rebalance cannot rewrite an allocated match.
pub const ENCOUNTER_REVISION: u32 = 1;

pub const MIN_LEVEL: u8 = 1;
pub const MAX_LEVEL: u8 = 60;

pub const ACTIVE_IDENTITY_COUNT: usize = 55;
pub const CANDIDATE_IDENTITY_COUNT: usize = 6;
pub const IDENTITY_COUNT: usize = ACTIVE_IDENTITY_COUNT + CANDIDATE_IDENTITY_COUNT;

pub const MIN_BASE_HEALTH: u32 = 150;
pub const MAX_BASE_HEALTH: u32 = 370;
pub const MIN_BASE_ATTACK: u32 = 16;
pub const MAX_BASE_ATTACK: u32 = 36;
pub const MIN_BASE_DEFENSE: u32 = 8;
pub const MAX_BASE_DEFENSE: u32 = 28;

/// Hard combat ceilings after growth and active Artifact modifiers.
pub const MAX_COMBAT_HEALTH: u32 = 800;
pub const MAX_COMBAT_ATTACK: u32 = 120;
pub const MAX_COMBAT_DEFENSE: u32 = 90;

pub const MAX_GROWTH_BP: u16 = 250;
pub const MAX_GROWTH_BIAS_BP: i16 = 100;
pub const GROWTH_BP_SCALE: u64 = 10_000;

pub const ARTIFACT_SLOT_COUNT: usize = 3;
pub const MAX_ARTIFACT_LEVEL: u8 = 5;
pub const ZERO_MODIFIER_CAP: u16 = 0;
/// Structural worst case for one stat across three slots: three S-rank caps.
pub const MAX_TOTAL_MODIFIER: u16 = 108;

const OD_1_ACTION: &str = "BLOCKED_OWNER_BANNER_DECISION (OD-1): acquisition, banner entry, gacha membership and gameplay presence are withheld until the owner approves a banner design and rate, defers the layer or rejects it; do not bind this identity";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CombatStats {
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
}

/// Flat Artifact modifiers. \`speed\` is recorded because the account-facing
/// Wave A Artifact catalog exposes it; see \`ARTIFACT_STAT_SEMANTICS\` for its
/// combat effect in this ruleset.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct ArtifactModifiers {
    pub hp: u16,
    pub attack: u16,
    pub defense: u16,
    pub speed: u16,
}

impl ArtifactModifiers {
    pub const ZERO: Self = Self {
        hp: 0,
        attack: 0,
        defense: 0,
        speed: 0,
    };

    pub fn checked_add(self, other: Self) -> Option<Self> {
        Some(Self {
            hp: self.hp.checked_add(other.hp)?,
            attack: self.attack.checked_add(other.attack)?,
            defense: self.defense.checked_add(other.defense)?,
            speed: self.speed.checked_add(other.speed)?,
        })
    }
}

/// Shared growth curves. Identities reference one of these and add their own
/// bounded bias, so growth stays one authored shape per archetype instead of 55
/// independent formulas, while every identity's totals remain distinct.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GrowthCurve {
    pub id: &'static str,
    pub health_bp: u16,
    pub attack_bp: u16,
    pub defense_bp: u16,
}

impl GrowthCurve {
    pub const STEADY: Self = Self {
        id: "steady",
        health_bp: 120,
        attack_bp: 100,
        defense_bp: 90,
    };
    pub const FOCUSED: Self = Self {
        id: "focused",
        health_bp: 80,
        attack_bp: 150,
        defense_bp: 50,
    };
    pub const BULWARK: Self = Self {
        id: "bulwark",
        health_bp: 150,
        attack_bp: 60,
        defense_bp: 130,
    };
    pub const DRAGON: Self = Self {
        id: "dragon",
        health_bp: 140,
        attack_bp: 120,
        defense_bp: 100,
    };
    pub const AGILE: Self = Self {
        id: "agile",
        health_bp: 100,
        attack_bp: 160,
        defense_bp: 60,
    };
}

pub const GROWTH_CURVES: [GrowthCurve; 5] = [
    GrowthCurve::STEADY,
    GrowthCurve::FOCUSED,
    GrowthCurve::BULWARK,
    GrowthCurve::DRAGON,
    GrowthCurve::AGILE,
];

pub fn growth_curve(id: &str) -> Option<&'static GrowthCurve> {
    GROWTH_CURVES.iter().find(|curve| curve.id == id)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PetProfile {
    pub base: CombatStats,
    pub growth: GrowthCurve,
    pub growth_bias_bp: i16,
    pub signature: SignatureKind,
}

impl PetProfile {
    /// Base plus shared-curve growth plus this identity's bounded bias.
    /// Pure integer arithmetic: the same inputs always produce the same stats.
    pub fn grown(&self, level: u8) -> Result<CombatStats, BindingError> {
        if !(MIN_LEVEL..=MAX_LEVEL).contains(&level) {
            return Err(BindingError::InvalidLevel);
        }
        let bias = 1_000_i64 + i64::from(self.growth_bias_bp);
        Ok(CombatStats {
            health: grown_stat(self.base.health, self.growth.health_bp, level, bias)?,
            attack: grown_stat(self.base.attack, self.growth.attack_bp, level, bias)?,
            defense: grown_stat(self.base.defense, self.growth.defense_bp, level, bias)?,
        })
    }

    /// Every ability this identity can ever unlock, independent of level.
    pub fn skills(&self) -> Vec<SkillId> {
        if self.signature == SignatureKind::FireZone {
            vec![
                SkillId::SharedSkill,
                SkillId::Signature,
                SkillId::FireZone,
                SkillId::Ultimate,
                SkillId::Guard,
            ]
        } else {
            vec![
                SkillId::SharedSkill,
                SkillId::Signature,
                SkillId::Ultimate,
                SkillId::Guard,
            ]
        }
    }

    /// Complete authored ability set. Owner decision: Pet level never gates
    /// access to an authored skill; Mana, Rage, cooldown, phase and ownership
    /// remain the authoritative combat checks.
    pub fn skills_at(&self, level: u8) -> Vec<SkillId> {
        if !(MIN_LEVEL..=MAX_LEVEL).contains(&level) {
            return Vec::new();
        }
        self.skills()
    }
}

/// `base` plus the shared curve's proportional growth for that stat.
fn grown_stat(base: u32, bp: u16, level: u8, bias: i64) -> Result<u32, BindingError> {
    if bp > MAX_GROWTH_BP || !(MIN_LEVEL..=MAX_LEVEL).contains(&level) {
        return Err(BindingError::UnboundedContent);
    }
    let steps = u64::from(level - MIN_LEVEL);
    let numerator = u64::from(base)
        * u64::from(bp)
        * steps
        * u64::try_from(bias).map_err(|_| BindingError::UnboundedContent)?;
    let growth = numerator / (GROWTH_BP_SCALE * 1_000);
    let growth = u32::try_from(growth).map_err(|_| BindingError::UnboundedContent)?;
    base.checked_add(growth)
        .ok_or(BindingError::UnboundedContent)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SkillId {
    SharedSkill,
    Signature,
    FireZone,
    Ultimate,
    Guard,
}

impl SkillId {
    pub const fn code(self) -> u8 {
        match self {
            Self::SharedSkill => 0,
            Self::Signature => 1,
            Self::FireZone => 2,
            Self::Ultimate => 3,
            Self::Guard => 4,
        }
    }

    /// Historical compatibility helper. Owner decision: every authored skill
    /// is available from Pet Lv1, so no ability has a level unlock gate.
    pub const fn unlock_level(self) -> u8 {
        1
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArtifactSlot {
    Core,
    Aegis,
    Rune,
}

impl ArtifactSlot {
    pub const fn code(self) -> u8 {
        match self {
            Self::Core => 0,
            Self::Aegis => 1,
            Self::Rune => 2,
        }
    }
}

pub const ARTIFACT_SLOTS: [ArtifactSlot; ARTIFACT_SLOT_COUNT] =
    [ArtifactSlot::Core, ArtifactSlot::Aegis, ArtifactSlot::Rune];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ArtifactRank {
    D,
    C,
    B,
    A,
    S,
}

impl ArtifactRank {
    pub const fn code(self) -> u8 {
        match self {
            Self::D => 0,
            Self::C => 1,
            Self::B => 2,
            Self::A => 3,
            Self::S => 4,
        }
    }

    pub const fn modifier_cap(self) -> u16 {
        match self {
            Self::D => 8,
            Self::C => 12,
            Self::B => 18,
            Self::A => 26,
            Self::S => 36,
        }
    }

    /// D Lv1 / C Lv10 / B Lv20 / A Lv40 / S Lv60. Pet level only: presentation
    /// power class is never an equipment gate.
    pub const fn level_requirement(self) -> u8 {
        match self {
            Self::D => 1,
            Self::C => 10,
            Self::B => 20,
            Self::A => 40,
            Self::S => 60,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArtifactDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub slot: ArtifactSlot,
    pub rank: ArtifactRank,
    pub modifiers: ArtifactModifiers,
    pub per_level: ArtifactModifiers,
}

impl ArtifactDefinition {
    pub fn effective(&self, upgrade_level: u8) -> Result<ArtifactModifiers, BindingError> {
        if !(1..=MAX_ARTIFACT_LEVEL).contains(&upgrade_level) {
            return Err(BindingError::InvalidArtifactLevel);
        }
        let steps = u16::from(upgrade_level - 1);
        let modifiers = ArtifactModifiers {
            hp: self.modifiers.hp + self.per_level.hp * steps,
            attack: self.modifiers.attack + self.per_level.attack * steps,
            defense: self.modifiers.defense + self.per_level.defense * steps,
            speed: self.modifiers.speed + self.per_level.speed * steps,
        };
        let cap = self.rank.modifier_cap();
        if [
            modifiers.hp,
            modifiers.attack,
            modifiers.defense,
            modifiers.speed,
        ]
        .iter()
        .any(|value| *value > cap)
        {
            return Err(BindingError::ArtifactModifierOutOfBounds);
        }
        Ok(modifiers)
    }
}

/// Combat projection of the account-facing Wave A Artifact catalog. The Nest
/// module remains the inventory, ownership and upgrade authority; these are the
/// only values the runtime recomputes and trusts.
pub const ARTIFACT_DEFINITIONS: [ArtifactDefinition; 7] = [
    ArtifactDefinition {
        id: "core-emberglass",
        name: "Emberglass Core",
        slot: ArtifactSlot::Core,
        rank: ArtifactRank::D,
        modifiers: ArtifactModifiers {
            hp: 4,
            attack: 2,
            defense: 0,
            speed: 0,
        },
        per_level: ArtifactModifiers {
            hp: 1,
            attack: 0,
            defense: 0,
            speed: 0,
        },
    },
    ArtifactDefinition {
        id: "core-amberlattice",
        name: "Amber Lattice",
        slot: ArtifactSlot::Core,
        rank: ArtifactRank::C,
        modifiers: ArtifactModifiers {
            hp: 6,
            attack: 3,
            defense: 1,
            speed: 0,
        },
        per_level: ArtifactModifiers {
            hp: 1,
            attack: 0,
            defense: 0,
            speed: 0,
        },
    },
    ArtifactDefinition {
        id: "rune-mistquill",
        name: "Mist Quill",
        slot: ArtifactSlot::Rune,
        rank: ArtifactRank::C,
        modifiers: ArtifactModifiers {
            hp: 0,
            attack: 4,
            defense: 0,
            speed: 2,
        },
        per_level: ArtifactModifiers {
            hp: 0,
            attack: 1,
            defense: 0,
            speed: 0,
        },
    },
    ArtifactDefinition {
        id: "aegis-bastionplate",
        name: "Bastion Plate",
        slot: ArtifactSlot::Aegis,
        rank: ArtifactRank::B,
        modifiers: ArtifactModifiers {
            hp: 8,
            attack: 0,
            defense: 5,
            speed: 0,
        },
        per_level: ArtifactModifiers {
            hp: 2,
            attack: 0,
            defense: 1,
            speed: 0,
        },
    },
    ArtifactDefinition {
        id: "rune-whisperknot",
        name: "Whisper Knot",
        slot: ArtifactSlot::Rune,
        rank: ArtifactRank::B,
        modifiers: ArtifactModifiers {
            hp: 0,
            attack: 6,
            defense: 0,
            speed: 3,
        },
        per_level: ArtifactModifiers {
            hp: 0,
            attack: 1,
            defense: 0,
            speed: 1,
        },
    },
    ArtifactDefinition {
        id: "core-prismheart",
        name: "Prism Heart",
        slot: ArtifactSlot::Core,
        rank: ArtifactRank::A,
        modifiers: ArtifactModifiers {
            hp: 12,
            attack: 6,
            defense: 3,
            speed: 0,
        },
        per_level: ArtifactModifiers {
            hp: 2,
            attack: 1,
            defense: 0,
            speed: 0,
        },
    },
    ArtifactDefinition {
        id: "rune-temporal-seal",
        name: "Temporal Seal",
        slot: ArtifactSlot::Rune,
        rank: ArtifactRank::S,
        modifiers: ArtifactModifiers {
            hp: 8,
            attack: 10,
            defense: 0,
            speed: 6,
        },
        per_level: ArtifactModifiers {
            hp: 1,
            attack: 2,
            defense: 0,
            speed: 1,
        },
    },
];

pub fn artifact_definition(id: &str) -> Option<&'static ArtifactDefinition> {
    ARTIFACT_DEFINITIONS
        .iter()
        .find(|definition| definition.id == id)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ArtifactStat {
    Hp,
    Attack,
    Defense,
    Speed,
}

impl ArtifactStat {
    pub const fn code(self) -> u8 {
        match self {
            Self::Hp => 0,
            Self::Attack => 1,
            Self::Defense => 2,
            Self::Speed => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StatEffect {
    /// Adds to the pet's maximum and starting health.
    Health,
    /// Adds to the pet's attack for every damage formula.
    Attack,
    /// Adds to the pet's defense in every damage formula.
    Defense,
    /// Explicitly has no combat effect in this ruleset.
    Inactive,
}

impl StatEffect {
    pub const fn code(self) -> u8 {
        match self {
            Self::Health => 0,
            Self::Attack => 1,
            Self::Defense => 2,
            Self::Inactive => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArtifactStatSemantics {
    pub stat: ArtifactStat,
    pub effect: StatEffect,
    pub reason: &'static str,
}

/// Explicit Artifact stat semantics. \`speed\` is recorded, validated and
/// projected, but marked inactive instead of being silently mapped onto an
/// unrelated effect. arena8 has no initiative or turn-order model.
pub const ARTIFACT_STAT_SEMANTICS: [ArtifactStatSemantics; 4] = [
    ArtifactStatSemantics {
        stat: ArtifactStat::Hp,
        effect: StatEffect::Health,
        reason: "adds to maximum and starting health",
    },
    ArtifactStatSemantics {
        stat: ArtifactStat::Attack,
        effect: StatEffect::Attack,
        reason: "adds to attack for board, skill, signature, fire-zone and ultimate damage",
    },
    ArtifactStatSemantics {
        stat: ArtifactStat::Defense,
        effect: StatEffect::Defense,
        reason: "adds to defense in every incoming and outgoing damage formula",
    },
    ArtifactStatSemantics {
        stat: ArtifactStat::Speed,
        effect: StatEffect::Inactive,
        reason: "INACTIVE: arena8 has no initiative, turn-order or cooldown-recovery model, so speed is recorded in the snapshot and projection but never applied to combat",
    },
];

pub fn stat_semantics(stat: ArtifactStat) -> &'static ArtifactStatSemantics {
    ARTIFACT_STAT_SEMANTICS
        .iter()
        .find(|semantics| semantics.stat == stat)
        .expect("every artifact stat has authored semantics")
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RosterState {
    Active,
    Candidate,
}

impl RosterState {
    pub const fn code(self) -> u8 {
        match self {
            Self::Active => 0,
            Self::Candidate => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Readiness {
    /// Authored profile and inside the verified playable slice.
    Playable,
    /// Authored profile, bindable for a match, outside the verified slice.
    Bound,
    /// Active identity with no authored profile. Never defaulted.
    PendingProfile { action: &'static str },
    /// Candidate identity that may not be minted, bound or played.
    GatedCandidate { action: &'static str },
}

impl Readiness {
    pub const fn code(self) -> u8 {
        match self {
            Self::Playable => 0,
            Self::Bound => 1,
            Self::PendingProfile { .. } => 2,
            Self::GatedCandidate { .. } => 3,
        }
    }

    pub const fn action(self) -> &'static str {
        match self {
            Self::Playable | Self::Bound => "",
            Self::PendingProfile { action } | Self::GatedCandidate { action } => action,
        }
    }

    pub const fn bindable(self) -> bool {
        matches!(self, Self::Playable | Self::Bound)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PetIdentity {
    pub id: &'static str,
    pub name: &'static str,
    pub family: &'static str,
    pub element: super::Element,
    pub roster_state: RosterState,
    pub readiness: Readiness,
    pub profile: Option<PetProfile>,
}

/// All 61 canonical roster identities in canonical roster order. Only the 55
/// active identities have a profile; the six candidates are gated and carry none.
pub const IDENTITIES: [PetIdentity; IDENTITY_COUNT] = [
    PetIdentity {
        id: "pet-v3-fire-icarus",
        name: "Icarus",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 210,
                attack: 26,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 0,
            signature: SignatureKind::FireZone,
        }),
    },
    PetIdentity {
        id: "pet-v31-fire-cindrelis",
        name: "Cindrelis",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 240,
                attack: 24,
                defense: 20,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-v31-water-marivell",
        name: "Marivell",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 250,
                attack: 22,
                defense: 18,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-v31-electric-quorion",
        name: "Quorion",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 200,
                attack: 28,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-v31-ghost-vesperyn",
        name: "Vesperyn",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 215,
                attack: 25,
                defense: 15,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: -15,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-v31-ground-gravorn",
        name: "Gravorn",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 300,
                attack: 20,
                defense: 24,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -10,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-v31-light-aurelune",
        name: "Aurelune",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 235,
                attack: 23,
                defense: 16,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-pyrecrown",
        name: "Pyrecrown",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 315,
                attack: 29,
                defense: 20,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-lagoonarch",
        name: "Lagoonarch",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 330,
                attack: 26,
                defense: 23,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-stormdiadem",
        name: "Stormdiadem",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 295,
                attack: 31,
                defense: 17,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -15,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-faultwarden",
        name: "Faultwarden",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 355,
                attack: 24,
                defense: 27,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-lanternwake",
        name: "Lanternwake",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 305,
                attack: 28,
                defense: 19,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 10,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-dawnarchon",
        name: "Dawnarchon",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 320,
                attack: 27,
                defense: 22,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: -20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-coalwhisk",
        name: "Coalwhisk",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 180,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-emberloom",
        name: "Emberloom",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 188,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-kilnback",
        name: "Kilnback",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 196,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-flarequill",
        name: "Flarequill",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 220,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "fire-scorchveil",
        name: "Scorchveil",
        family: "core",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 235,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-dewskip",
        name: "Dewskip",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 190,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-ripplefin",
        name: "Ripplefin",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 198,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-foamcurl",
        name: "Foamcurl",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 206,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-tideweft",
        name: "Tideweft",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 230,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "water-abyssail",
        name: "Abyssail",
        family: "core",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 245,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-zipspool",
        name: "Zipspool",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 170,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-copperkip",
        name: "Copperkip",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 178,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-arcshell",
        name: "Arcshell",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 186,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-pulsecrest",
        name: "Pulsecrest",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 210,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "electric-thundrel",
        name: "Thundrel",
        family: "core",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 225,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-clodkin",
        name: "Clodkin",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 200,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-burrowick",
        name: "Burrowick",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 208,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-dunebraid",
        name: "Dunebraid",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 216,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-siltmaw",
        name: "Siltmaw",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 240,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ground-terracrest",
        name: "Terracrest",
        family: "core",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 255,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-wickrift",
        name: "Wickrift",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 185,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-shroudlet",
        name: "Shroudlet",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 193,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-bellshade",
        name: "Bellshade",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 201,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-echowisp",
        name: "Echowisp",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 225,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "ghost-veilrelic",
        name: "Veilrelic",
        family: "core",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 240,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-gleamlet",
        name: "Gleamlet",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 175,
                attack: 18,
                defense: 10,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-dawnpurl",
        name: "Dawnpurl",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 183,
                attack: 19,
                defense: 11,
            },
            growth: GrowthCurve::STEADY,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-raymantle",
        name: "Raymantle",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 191,
                attack: 20,
                defense: 12,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-solweft",
        name: "Solweft",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 215,
                attack: 23,
                defense: 14,
            },
            growth: GrowthCurve::FOCUSED,
            growth_bias_bp: 45,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "light-prismhalo",
        name: "Prismhalo",
        family: "core",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 230,
                attack: 24,
                defense: 15,
            },
            growth: GrowthCurve::BULWARK,
            growth_bias_bp: -30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-fire-ignivar",
        name: "Ignivar",
        family: "dragon",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 340,
                attack: 30,
                defense: 24,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-water-tidecoil",
        name: "Tidecoil",
        family: "dragon",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 350,
                attack: 28,
                defense: 26,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: -15,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-electric-voltrazik",
        name: "Voltrazik",
        family: "dragon",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 320,
                attack: 33,
                defense: 21,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: 20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-ghost-hollowmaw",
        name: "Hollowmaw",
        family: "dragon",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 300,
                attack: 34,
                defense: 22,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: 35,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-ground-terradrake",
        name: "Terradrake",
        family: "dragon",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 370,
                attack: 26,
                defense: 28,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: -25,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "dragon-light-auroryx",
        name: "Auroryx",
        family: "dragon",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 335,
                attack: 29,
                defense: 25,
            },
            growth: GrowthCurve::DRAGON,
            growth_bias_bp: 10,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-fire-cinderquill",
        name: "Cinderquill",
        family: "bird",
        element: Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::Playable,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 195,
                attack: 29,
                defense: 11,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: 0,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-water-tidewren",
        name: "Tidewren",
        family: "bird",
        element: Element::Water,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 205,
                attack: 27,
                defense: 12,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: 15,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-electric-arcswift",
        name: "Arcswift",
        family: "bird",
        element: Element::Electric,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 180,
                attack: 32,
                defense: 9,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: -20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-ghost-pallidrone",
        name: "Pallidrone",
        family: "bird",
        element: Element::Ghost,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 190,
                attack: 30,
                defense: 10,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: 30,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-ground-dustrunner",
        name: "Dustrunner",
        family: "bird",
        element: Element::Ground,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 210,
                attack: 26,
                defense: 13,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: -10,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "bird-light-prismkite",
        name: "Prismkite",
        family: "bird",
        element: Element::Light,
        roster_state: RosterState::Active,
        readiness: Readiness::Bound,
        profile: Some(PetProfile {
            base: CombatStats {
                health: 200,
                attack: 28,
                defense: 11,
            },
            growth: GrowthCurve::AGILE,
            growth_bias_bp: 20,
            signature: SignatureKind::Elemental,
        }),
    },
    PetIdentity {
        id: "pet-s-fire-vulcaryn",
        name: "Vulcaryn",
        family: "s_offrate",
        element: Element::Fire,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
    PetIdentity {
        id: "pet-s-water-nerivelle",
        name: "Nerivelle",
        family: "s_offrate",
        element: Element::Water,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
    PetIdentity {
        id: "pet-s-electric-fulgarys",
        name: "Fulgarys",
        family: "s_offrate",
        element: Element::Electric,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
    PetIdentity {
        id: "pet-s-ghost-umbryss",
        name: "Umbryss",
        family: "s_offrate",
        element: Element::Ghost,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
    PetIdentity {
        id: "pet-s-ground-jaderyx",
        name: "Jaderyx",
        family: "s_offrate",
        element: Element::Ground,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
    PetIdentity {
        id: "pet-s-light-solenne",
        name: "Solenne",
        family: "s_offrate",
        element: Element::Light,
        roster_state: RosterState::Candidate,
        readiness: Readiness::GatedCandidate {
            action: OD_1_ACTION,
        },
        profile: None,
    },
];

pub fn identity(id: &str) -> Option<&'static PetIdentity> {
    IDENTITIES.iter().find(|identity| identity.id == id)
}

pub fn identity_index(id: &str) -> Option<u8> {
    IDENTITIES
        .iter()
        .position(|identity| identity.id == id)
        .and_then(|index| u8::try_from(index).ok())
}

pub fn active_identities() -> impl Iterator<Item = &'static PetIdentity> {
    IDENTITIES
        .iter()
        .filter(|identity| identity.roster_state == RosterState::Active)
}

pub fn candidate_identities() -> impl Iterator<Item = &'static PetIdentity> {
    IDENTITIES
        .iter()
        .filter(|identity| identity.roster_state == RosterState::Candidate)
}

pub fn playable_identities() -> impl Iterator<Item = &'static PetIdentity> {
    IDENTITIES
        .iter()
        .filter(|identity| identity.readiness == Readiness::Playable)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EncounterBinding {
    pub index: u8,
    pub id: &'static str,
    pub revision: u32,
    pub element: super::Element,
    pub boss: bool,
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
}

pub fn encounter_at(index: u8) -> Option<EncounterBinding> {
    let encounter = ENCOUNTERS.get(usize::from(index))?;
    Some(EncounterBinding {
        index,
        id: encounter.id,
        revision: ENCOUNTER_REVISION,
        element: encounter.element,
        boss: encounter.boss,
        health: encounter.health,
        attack: encounter.attack,
        defense: encounter.defense,
    })
}

pub fn encounter(id: &str) -> Option<EncounterBinding> {
    (0..ENCOUNTERS.len())
        .find(|index| ENCOUNTERS[*index].id == id)
        .and_then(|index| u8::try_from(index).ok())
        .and_then(encounter_at)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactSelection {
    pub definition_id: String,
    pub upgrade_level: u8,
}

/// Server-authored allocation input. A client never constructs this.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Allocation {
    pub account: String,
    pub owned_pet_id: String,
    pub pet_id: String,
    pub level: u8,
    pub encounter_id: String,
    pub artifacts: Vec<ArtifactSelection>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EquippedArtifact {
    pub slot: ArtifactSlot,
    pub definition_id: String,
    pub rank: ArtifactRank,
    pub upgrade_level: u8,
    pub modifiers: ArtifactModifiers,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EncounterRef {
    pub index: u8,
    pub id: String,
    pub revision: u32,
    pub element: super::Element,
    pub boss: bool,
}

impl EncounterRef {
    fn from_binding(binding: EncounterBinding) -> Self {
        Self {
            index: binding.index,
            id: binding.id.into(),
            revision: binding.revision,
            element: binding.element,
            boss: binding.boss,
        }
    }

    fn matches(&self, binding: EncounterBinding) -> bool {
        self.index == binding.index
            && self.id == binding.id
            && self.revision == binding.revision
            && self.element == binding.element
            && self.boss == binding.boss
    }
}

/// Immutable, content-addressed battle snapshot. It is allocated once from
/// catalog data and can never be rewritten by a later loadout change: every
/// derived value is revalidated from the catalogs on restore.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct MatchSnapshot {
    schema_version: u16,
    account: String,
    owned_pet_id: String,
    pet_id: String,
    family: String,
    element: super::Element,
    species_version: String,
    level: u8,
    base: CombatStats,
    grown: CombatStats,
    artifacts: Vec<EquippedArtifact>,
    modifiers: ArtifactModifiers,
    effective: CombatStats,
    skills: Vec<SkillId>,
    encounter: EncounterRef,
    binding_id: String,
    binding_version: u32,
    binding_digest: [u8; 32],
    ruleset_id: String,
    ruleset_version: u32,
    rules_digest: [u8; 32],
}

impl MatchSnapshot {
    pub fn schema_version(&self) -> u16 {
        self.schema_version
    }
    pub fn account(&self) -> &str {
        &self.account
    }
    pub fn owned_pet_id(&self) -> &str {
        &self.owned_pet_id
    }
    pub fn pet_id(&self) -> &str {
        &self.pet_id
    }
    pub fn family(&self) -> &str {
        &self.family
    }
    pub fn element(&self) -> super::Element {
        self.element
    }
    /// Canonical roster version the identity was bound from.
    pub fn species_version(&self) -> &str {
        &self.species_version
    }
    pub fn level(&self) -> u8 {
        self.level
    }
    pub fn base(&self) -> CombatStats {
        self.base
    }
    pub fn grown(&self) -> CombatStats {
        self.grown
    }
    pub fn artifacts(&self) -> &[EquippedArtifact] {
        &self.artifacts
    }
    pub fn modifiers(&self) -> ArtifactModifiers {
        self.modifiers
    }
    pub fn effective(&self) -> CombatStats {
        self.effective
    }
    pub fn skills(&self) -> &[SkillId] {
        &self.skills
    }
    pub fn encounter(&self) -> &EncounterRef {
        &self.encounter
    }
    pub fn binding_id(&self) -> &str {
        &self.binding_id
    }
    pub fn binding_version(&self) -> u32 {
        self.binding_version
    }
    pub fn binding_digest(&self) -> [u8; 32] {
        self.binding_digest
    }
    pub fn ruleset_id(&self) -> &str {
        &self.ruleset_id
    }
    pub fn ruleset_version(&self) -> u32 {
        self.ruleset_version
    }
    pub fn rules_digest(&self) -> [u8; 32] {
        self.rules_digest
    }

    pub fn pet_index(&self) -> Result<u8, BindingError> {
        identity_index(&self.pet_id).ok_or(BindingError::UnknownIdentity)
    }

    pub fn profile(&self) -> Result<PetProfile, BindingError> {
        identity(&self.pet_id)
            .and_then(|identity| identity.profile)
            .ok_or(BindingError::UnknownIdentity)
    }

    /// Stats actually consumed by the reducer.
    pub fn combat_pet(&self) -> super::model::PetCombat {
        super::model::PetCombat {
            element: self.element,
            signature: self
                .profile()
                .map_or(SignatureKind::Elemental, |profile| profile.signature),
            health: self.effective.health,
            attack: self.effective.attack,
            defense: self.effective.defense,
        }
    }

    pub fn combat_encounter(&self) -> super::model::EncounterCombat {
        let binding = encounter_at(self.encounter.index).expect("validated encounter index");
        super::model::EncounterCombat {
            element: binding.element,
            health: binding.health,
            attack: binding.attack,
            defense: binding.defense,
            boss: binding.boss,
        }
    }

    /// Stat semantics actually used by this snapshot, in catalog order.
    pub fn stat_semantics(&self) -> [ArtifactStatSemantics; 4] {
        ARTIFACT_STAT_SEMANTICS
    }

    pub fn digest(&self) -> [u8; 32] {
        canonical::hash("aetheria.arena8.match-snapshot.v1", &self.canonical())
            .expect("bounded match snapshot is hashable")
    }

    /// Recomputes every derived value from the catalogs and compares. A tampered,
    /// stale or rewritten snapshot fails closed instead of altering a match.
    pub fn validate(&self) -> Result<(), BindingError> {
        if self.schema_version != SNAPSHOT_SCHEMA_VERSION
            || self.binding_id != BINDING_ID
            || self.binding_version != BINDING_VERSION
            || self.binding_digest != BINDING_DIGEST
            || self.ruleset_id != BOUND_RULESET_ID
            || self.ruleset_version != BOUND_RULESET_VERSION
            || self.rules_digest != super::RULES_HASH
            || self.species_version != ROSTER_VERSION
            || !valid_handle(&self.account)
            || !valid_handle(&self.owned_pet_id)
        {
            return Err(BindingError::InvalidSnapshot);
        }
        let identity = identity(&self.pet_id).ok_or(BindingError::UnknownIdentity)?;
        if identity.roster_state != RosterState::Active || !identity.readiness.bindable() {
            return Err(BindingError::InvalidSnapshot);
        }
        let profile = identity.profile.ok_or(BindingError::PendingProfile {
            action: identity.readiness.action(),
        })?;
        if self.family != identity.family || self.element != identity.element {
            return Err(BindingError::InvalidSnapshot);
        }
        if !(MIN_LEVEL..=MAX_LEVEL).contains(&self.level) {
            return Err(BindingError::InvalidLevel);
        }
        if self.base != profile.base || self.grown != profile.grown(self.level)? {
            return Err(BindingError::InvalidSnapshot);
        }
        let modifiers = validate_artifacts(&self.artifacts, self.level)?;
        if self.modifiers != modifiers {
            return Err(BindingError::InvalidSnapshot);
        }
        if self.effective != effective_stats(self.grown, modifiers)? {
            return Err(BindingError::InvalidSnapshot);
        }
        if self.skills != profile.skills_at(self.level) {
            return Err(BindingError::InvalidSnapshot);
        }
        let encounter = encounter_at(self.encounter.index).ok_or(BindingError::UnknownEncounter)?;
        if !self.encounter.matches(encounter) {
            return Err(BindingError::InvalidSnapshot);
        }
        Ok(())
    }

    fn canonical(&self) -> Value {
        list([
            Value::Uint(u64::from(self.schema_version)),
            Value::Text(self.account.clone()),
            Value::Text(self.owned_pet_id.clone()),
            Value::Text(self.pet_id.clone()),
            Value::Text(self.family.clone()),
            Value::Uint(self.element as u64),
            Value::Text(self.species_version.clone()),
            Value::Uint(u64::from(self.level)),
            stats_value(self.base),
            stats_value(self.grown),
            list(self.artifacts.iter().map(|artifact| {
                list([
                    Value::Uint(u64::from(artifact.slot.code())),
                    Value::Text(artifact.definition_id.clone()),
                    Value::Uint(u64::from(artifact.rank.code())),
                    Value::Uint(u64::from(artifact.upgrade_level)),
                    modifiers_value(artifact.modifiers),
                ])
            })),
            modifiers_value(self.modifiers),
            stats_value(self.effective),
            Value::Bytes(self.skills.iter().map(|skill| skill.code()).collect()),
            list([
                Value::Uint(u64::from(self.encounter.index)),
                Value::Text(self.encounter.id.clone()),
                Value::Uint(u64::from(self.encounter.revision)),
                Value::Uint(self.encounter.element as u64),
                Value::Bool(self.encounter.boss),
            ]),
            Value::Text(self.binding_id.clone()),
            Value::Uint(u64::from(self.binding_version)),
            Value::Bytes(self.binding_digest.to_vec()),
            Value::Text(self.ruleset_id.clone()),
            Value::Uint(u64::from(self.ruleset_version)),
            Value::Bytes(self.rules_digest.to_vec()),
        ])
    }
}

fn stats_value(stats: CombatStats) -> Value {
    list([
        Value::Uint(u64::from(stats.health)),
        Value::Uint(u64::from(stats.attack)),
        Value::Uint(u64::from(stats.defense)),
    ])
}

fn modifiers_value(modifiers: ArtifactModifiers) -> Value {
    list([
        Value::Uint(u64::from(modifiers.hp)),
        Value::Uint(u64::from(modifiers.attack)),
        Value::Uint(u64::from(modifiers.defense)),
        Value::Uint(u64::from(modifiers.speed)),
    ])
}

fn valid_handle(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
}

/// Applies only the stats with an active combat effect. \`speed\` participates in
/// validation and projection but never in these totals.
fn effective_stats(
    grown: CombatStats,
    modifiers: ArtifactModifiers,
) -> Result<CombatStats, BindingError> {
    let active = [
        stat_semantics(ArtifactStat::Hp),
        stat_semantics(ArtifactStat::Attack),
        stat_semantics(ArtifactStat::Defense),
    ];
    if active
        .iter()
        .any(|semantics| semantics.effect == StatEffect::Inactive)
    {
        return Err(BindingError::UnboundedContent);
    }
    Ok(CombatStats {
        health: grown
            .health
            .checked_add(u32::from(modifiers.hp))
            .ok_or(BindingError::UnboundedContent)?
            .min(MAX_COMBAT_HEALTH),
        attack: grown
            .attack
            .checked_add(u32::from(modifiers.attack))
            .ok_or(BindingError::UnboundedContent)?
            .min(MAX_COMBAT_ATTACK),
        defense: grown
            .defense
            .checked_add(u32::from(modifiers.defense))
            .ok_or(BindingError::UnboundedContent)?
            .min(MAX_COMBAT_DEFENSE),
    })
}

fn validate_artifacts(
    artifacts: &[EquippedArtifact],
    pet_level: u8,
) -> Result<ArtifactModifiers, BindingError> {
    if artifacts.len() > ARTIFACT_SLOT_COUNT {
        return Err(BindingError::DuplicateArtifactSlot);
    }
    let mut totals = ArtifactModifiers::ZERO;
    for (index, artifact) in artifacts.iter().enumerate() {
        let definition = artifact_definition(&artifact.definition_id)
            .ok_or(BindingError::InvalidArtifactDefinition)?;
        if definition.slot != artifact.slot
            || definition.rank != artifact.rank
            || artifacts[..index]
                .iter()
                .any(|prior| prior.slot == artifact.slot)
        {
            return Err(BindingError::DuplicateArtifactSlot);
        }
        if !(1..=MAX_ARTIFACT_LEVEL).contains(&artifact.upgrade_level) {
            return Err(BindingError::InvalidArtifactLevel);
        }
        if pet_level < definition.rank.level_requirement() {
            return Err(BindingError::ArtifactLevelRequirement);
        }
        if artifact.modifiers != definition.effective(artifact.upgrade_level)? {
            return Err(BindingError::ArtifactModifierOutOfBounds);
        }
        totals = totals
            .checked_add(artifact.modifiers)
            .ok_or(BindingError::ArtifactModifierOutOfBounds)?;
    }
    if [totals.hp, totals.attack, totals.defense, totals.speed]
        .iter()
        .any(|value| *value > MAX_TOTAL_MODIFIER)
    {
        return Err(BindingError::ArtifactModifierOutOfBounds);
    }
    Ok(totals)
}

/// Resolves one catalogue identity's combat profile, or its actionable
/// readiness state. There is deliberately no default profile: an identity with
/// no authored data can never inherit another identity's stats.
pub fn bind_identity(identity: &PetIdentity) -> Result<PetProfile, BindingError> {
    match identity.readiness {
        Readiness::GatedCandidate { action } => return Err(BindingError::Gated { action }),
        Readiness::PendingProfile { action } => {
            return Err(BindingError::PendingProfile { action });
        }
        Readiness::Playable | Readiness::Bound => {}
    }
    identity.profile.ok_or(BindingError::PendingProfile {
        action: identity.readiness.action(),
    })
}

impl Allocation {
    /// Binds one allocation into an immutable snapshot. Gated and unsupported
    /// identities return their actionable readiness state instead of a profile.
    pub fn bind(self) -> Result<MatchSnapshot, BindingError> {
        if !valid_handle(&self.account) {
            return Err(BindingError::InvalidAccount);
        }
        if !valid_handle(&self.owned_pet_id) {
            return Err(BindingError::InvalidOwnedPet);
        }
        if !(MIN_LEVEL..=MAX_LEVEL).contains(&self.level) {
            return Err(BindingError::InvalidLevel);
        }
        let identity = identity(&self.pet_id).ok_or(BindingError::UnknownIdentity)?;
        let profile = bind_identity(identity)?;
        let base = profile.base;
        let grown = profile.grown(self.level)?;
        let encounter = encounter(&self.encounter_id).ok_or(BindingError::UnknownEncounter)?;

        let mut artifacts = Vec::new();
        for selection in self.artifacts {
            let definition = artifact_definition(&selection.definition_id)
                .ok_or(BindingError::InvalidArtifactDefinition)?;
            if !(1..=MAX_ARTIFACT_LEVEL).contains(&selection.upgrade_level) {
                return Err(BindingError::InvalidArtifactLevel);
            }
            if self.level < definition.rank.level_requirement() {
                return Err(BindingError::ArtifactLevelRequirement);
            }
            if artifacts
                .iter()
                .any(|prior: &EquippedArtifact| prior.slot == definition.slot)
            {
                return Err(BindingError::DuplicateArtifactSlot);
            }
            artifacts.push(EquippedArtifact {
                slot: definition.slot,
                definition_id: definition.id.into(),
                rank: definition.rank,
                upgrade_level: selection.upgrade_level,
                modifiers: definition.effective(selection.upgrade_level)?,
            });
        }
        artifacts.sort_by_key(|artifact| artifact.slot.code());

        let modifiers = validate_artifacts(&artifacts, self.level)?;
        let effective = effective_stats(grown, modifiers)?;
        let snapshot = MatchSnapshot {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            account: self.account,
            owned_pet_id: self.owned_pet_id,
            pet_id: identity.id.into(),
            family: identity.family.into(),
            element: identity.element,
            species_version: ROSTER_VERSION.into(),
            level: self.level,
            base,
            grown,
            artifacts,
            modifiers,
            effective,
            skills: profile.skills_at(self.level),
            encounter: EncounterRef::from_binding(encounter),
            binding_id: BINDING_ID.into(),
            binding_version: BINDING_VERSION,
            binding_digest: BINDING_DIGEST,
            ruleset_id: BOUND_RULESET_ID.into(),
            ruleset_version: BOUND_RULESET_VERSION,
            rules_digest: super::RULES_HASH,
        };
        snapshot.validate()?;
        Ok(snapshot)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BindingError {
    UnknownIdentity,
    Gated { action: &'static str },
    PendingProfile { action: &'static str },
    UnknownEncounter,
    InvalidAccount,
    InvalidOwnedPet,
    InvalidLevel,
    InvalidSnapshot,
    InvalidArtifactDefinition,
    InvalidArtifactLevel,
    DuplicateArtifactSlot,
    ArtifactLevelRequirement,
    ArtifactModifierOutOfBounds,
    UnboundedContent,
}

impl From<BindingError> for CoreError {
    fn from(error: BindingError) -> Self {
        match error {
            BindingError::InvalidSnapshot => CoreError::ContentMismatch,
            _ => CoreError::InvalidState,
        }
    }
}

/// Authored-content validation, independent of the pinned digest.
pub fn validate_binding() -> Result<(), BindingError> {
    if IDENTITIES.len() != IDENTITY_COUNT {
        return Err(BindingError::UnboundedContent);
    }
    let mut seen_ids = std::collections::BTreeSet::new();
    let mut seen_bases = std::collections::BTreeSet::new();
    let mut active = 0_usize;
    let mut candidates = 0_usize;
    let mut playable = 0_usize;
    let mut fire_zones = 0_usize;
    for (index, identity) in IDENTITIES.iter().enumerate() {
        if identity.id.is_empty()
            || identity.name.is_empty()
            || !seen_ids.insert(identity.id)
            || IDENTITIES[..index]
                .iter()
                .any(|prior| prior.name == identity.name)
        {
            return Err(BindingError::UnboundedContent);
        }
        match identity.roster_state {
            RosterState::Active => {
                active += 1;
                let profile = identity.profile.ok_or(BindingError::PendingProfile {
                    action: identity.readiness.action(),
                })?;
                if !identity.readiness.bindable() {
                    return Err(BindingError::UnboundedContent);
                }
                if identity.readiness == Readiness::Playable {
                    playable += 1;
                }
                validate_profile(profile)?;
                if !seen_bases.insert((
                    profile.base.health,
                    profile.base.attack,
                    profile.base.defense,
                )) {
                    // Distinct identities may never share an identical base
                    // statline; that would silently make distinct Pets equal.
                    return Err(BindingError::UnboundedContent);
                }
                if profile.signature == SignatureKind::FireZone {
                    fire_zones += 1;
                }
            }
            RosterState::Candidate => {
                candidates += 1;
                if identity.profile.is_some()
                    || !matches!(identity.readiness, Readiness::GatedCandidate { .. })
                {
                    return Err(BindingError::UnboundedContent);
                }
            }
        }
    }
    if active != ACTIVE_IDENTITY_COUNT
        || candidates != CANDIDATE_IDENTITY_COUNT
        || playable == 0
        || playable >= active
        || fire_zones != 1
    {
        return Err(BindingError::UnboundedContent);
    }
    for curve in GROWTH_CURVES {
        if curve.id.is_empty()
            || curve.health_bp > MAX_GROWTH_BP
            || curve.attack_bp > MAX_GROWTH_BP
            || curve.defense_bp > MAX_GROWTH_BP
            || GROWTH_CURVES
                .iter()
                .filter(|other| other.id == curve.id)
                .count()
                != 1
        {
            return Err(BindingError::UnboundedContent);
        }
    }
    if ARTIFACT_DEFINITIONS.is_empty()
        || ARTIFACT_DEFINITIONS.iter().any(|definition| {
            definition.id.is_empty() || artifact_definition(definition.id) != Some(definition)
        })
        || ARTIFACT_DEFINITIONS
            .iter()
            .map(|definition| definition.id)
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != ARTIFACT_DEFINITIONS.len()
    {
        return Err(BindingError::UnboundedContent);
    }
    for definition in ARTIFACT_DEFINITIONS {
        for level in 1..=MAX_ARTIFACT_LEVEL {
            definition.effective(level)?;
        }
    }
    let mut stats = std::collections::BTreeSet::new();
    for semantics in ARTIFACT_STAT_SEMANTICS {
        if !stats.insert(semantics.stat.code()) || semantics.reason.is_empty() {
            return Err(BindingError::UnboundedContent);
        }
    }
    if stats.len() != 4
        || stat_semantics(ArtifactStat::Speed).effect != StatEffect::Inactive
        || stat_semantics(ArtifactStat::Hp).effect != StatEffect::Health
        || stat_semantics(ArtifactStat::Attack).effect != StatEffect::Attack
        || stat_semantics(ArtifactStat::Defense).effect != StatEffect::Defense
    {
        return Err(BindingError::UnboundedContent);
    }
    for index in 0..ENCOUNTERS.len() {
        let binding = u8::try_from(index)
            .ok()
            .and_then(encounter_at)
            .ok_or(BindingError::UnknownEncounter)?;
        if binding.id.is_empty()
            || encounter(binding.id) != Some(binding)
            || binding.health == 0
            || binding.attack == 0
            || binding.defense == 0
            || binding.revision != ENCOUNTER_REVISION
        {
            return Err(BindingError::UnknownEncounter);
        }
    }
    if encounter(ENCOUNTERS[0].id).is_none() {
        return Err(BindingError::UnknownEncounter);
    }
    Ok(())
}

fn validate_profile(profile: PetProfile) -> Result<(), BindingError> {
    let base = profile.base;
    if !(MIN_BASE_HEALTH..=MAX_BASE_HEALTH).contains(&base.health)
        || !(MIN_BASE_ATTACK..=MAX_BASE_ATTACK).contains(&base.attack)
        || !(MIN_BASE_DEFENSE..=MAX_BASE_DEFENSE).contains(&base.defense)
        || growth_curve(profile.growth.id) != Some(&profile.growth)
        || profile.growth_bias_bp.abs() > MAX_GROWTH_BIAS_BP
    {
        return Err(BindingError::UnboundedContent);
    }
    let level_60 = profile.grown(MAX_LEVEL)?;
    if level_60.health > MAX_COMBAT_HEALTH
        || level_60.attack > MAX_COMBAT_ATTACK
        || level_60.defense > MAX_COMBAT_DEFENSE
    {
        return Err(BindingError::UnboundedContent);
    }
    Ok(())
}

/// Canonical binding content. Everything that can change a bound match is
/// included; the pinned digest is the version fence.
pub fn canonical_manifest() -> Value {
    let identities = list(IDENTITIES.iter().map(|identity| {
        let profile = identity.profile.map_or(Value::Null, |profile| {
            list([
                stats_value(profile.base),
                Value::Text(profile.growth.id.into()),
                Value::Uint(u64::from(profile.growth.health_bp)),
                Value::Uint(u64::from(profile.growth.attack_bp)),
                Value::Uint(u64::from(profile.growth.defense_bp)),
                Value::Int(i64::from(profile.growth_bias_bp)),
                Value::Uint(profile.signature as u64),
            ])
        });
        list([
            Value::Text(identity.id.into()),
            Value::Text(identity.name.into()),
            Value::Text(identity.family.into()),
            Value::Uint(identity.element as u64),
            Value::Uint(u64::from(identity.roster_state.code())),
            Value::Uint(u64::from(identity.readiness.code())),
            Value::Text(identity.readiness.action().into()),
            profile,
        ])
    }));
    let curves = list(GROWTH_CURVES.iter().map(|curve| {
        list([
            Value::Text(curve.id.into()),
            Value::Uint(u64::from(curve.health_bp)),
            Value::Uint(u64::from(curve.attack_bp)),
            Value::Uint(u64::from(curve.defense_bp)),
        ])
    }));
    let definitions = list(ARTIFACT_DEFINITIONS.iter().map(|definition| {
        list([
            Value::Text(definition.id.into()),
            Value::Text(definition.name.into()),
            Value::Uint(u64::from(definition.slot.code())),
            Value::Uint(u64::from(definition.rank.code())),
            modifiers_value(definition.modifiers),
            modifiers_value(definition.per_level),
        ])
    }));
    let ranks = list(
        [
            ArtifactRank::D,
            ArtifactRank::C,
            ArtifactRank::B,
            ArtifactRank::A,
            ArtifactRank::S,
        ]
        .map(|rank| {
            list([
                Value::Uint(u64::from(rank.code())),
                Value::Uint(u64::from(rank.modifier_cap())),
                Value::Uint(u64::from(rank.level_requirement())),
            ])
        }),
    );
    let semantics = list(ARTIFACT_STAT_SEMANTICS.iter().map(|semantics| {
        list([
            Value::Uint(u64::from(semantics.stat.code())),
            Value::Uint(u64::from(semantics.effect.code())),
            Value::Text(semantics.reason.into()),
        ])
    }));
    let encounters = list((0..ENCOUNTERS.len()).map(|index| {
        let binding = u8::try_from(index)
            .ok()
            .and_then(encounter_at)
            .expect("bounded encounter table");
        list([
            Value::Uint(u64::from(binding.index)),
            Value::Text(binding.id.into()),
            Value::Uint(u64::from(binding.revision)),
            Value::Uint(binding.element as u64),
            Value::Uint(u64::from(binding.health)),
            Value::Uint(u64::from(binding.attack)),
            Value::Uint(u64::from(binding.defense)),
            Value::Bool(binding.boss),
        ])
    }));
    let bounds = list([
        Value::Uint(u64::from(MIN_LEVEL)),
        Value::Uint(u64::from(MAX_LEVEL)),
        Value::Uint(u64::from(MIN_BASE_HEALTH)),
        Value::Uint(u64::from(MAX_BASE_HEALTH)),
        Value::Uint(u64::from(MIN_BASE_ATTACK)),
        Value::Uint(u64::from(MAX_BASE_ATTACK)),
        Value::Uint(u64::from(MIN_BASE_DEFENSE)),
        Value::Uint(u64::from(MAX_BASE_DEFENSE)),
        Value::Uint(u64::from(MAX_COMBAT_HEALTH)),
        Value::Uint(u64::from(MAX_COMBAT_ATTACK)),
        Value::Uint(u64::from(MAX_COMBAT_DEFENSE)),
        Value::Uint(u64::from(MAX_GROWTH_BP)),
        Value::Int(i64::from(MAX_GROWTH_BIAS_BP)),
        Value::Uint(u64::from(MAX_TOTAL_MODIFIER)),
        Value::Uint(u64::from(MAX_ARTIFACT_LEVEL)),
        Value::Uint(u64::from(ZERO_MODIFIER_CAP)),
    ]);
    list([
        Value::Text(BINDING_ID.into()),
        Value::Uint(u64::from(BINDING_VERSION)),
        Value::Text(ROSTER_ID.into()),
        Value::Text(ROSTER_VERSION.into()),
        Value::Text(BOUND_RULESET_ID.into()),
        Value::Uint(u64::from(BOUND_RULESET_VERSION)),
        Value::Bytes(super::RULES_HASH.to_vec()),
        Value::Uint(u64::from(ENCOUNTER_REVISION)),
        identities,
        curves,
        definitions,
        ranks,
        semantics,
        encounters,
        bounds,
    ])
}

pub fn computed_digest() -> [u8; 32] {
    validate_binding().expect("authored arena8 binding content is bounded and valid");
    canonical::hash("aetheria.arena8.binding.v1", &canonical_manifest())
        .expect("authored arena8 binding manifest is bounded")
}

/// Pinned binding digest. Any content, bound or semantic change requires a new
/// binding version and digest.
pub const BINDING_DIGEST: [u8; 32] = [
    0x19, 0x83, 0x51, 0xcc, 0x3b, 0x4f, 0x8c, 0x2e, 0x49, 0x3e, 0x5f, 0x60, 0x60, 0x2f, 0xdd, 0xf2,
    0xc3, 0x68, 0xc6, 0x05, 0x2f, 0x17, 0x6d, 0x90, 0x40, 0x60, 0xd5, 0x08, 0xff, 0xa5, 0xb5, 0xae,
];

pub fn digest() -> Result<[u8; 32], CoreError> {
    if computed_digest() != BINDING_DIGEST {
        return Err(CoreError::ContentMismatch);
    }
    Ok(BINDING_DIGEST)
}

pub(crate) fn pinned_digest() -> [u8; 32] {
    digest().expect("arena8 binding digest must match the pinned version")
}

pub fn digest_hex() -> Result<String, CoreError> {
    Ok(digest()?.iter().map(|byte| format!("{byte:02x}")).collect())
}
