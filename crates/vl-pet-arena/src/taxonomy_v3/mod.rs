//! Offline v3 taxonomy. No runtime selector, publication, RNG or v1 reducer changes.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaxonomyError {
    Arithmetic,
    IncompatibleRig,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Element {
    Normal,
    Fire,
    Water,
    Grass,
    Electric,
    Ice,
    Fighting,
    Poison,
    Ground,
    Flying,
    Psychic,
    Bug,
    Rock,
    Ghost,
    Dragon,
    Dark,
    Steel,
    Fairy,
    Light,
}
pub const ELEMENTS: [Element; 19] = [
    Element::Normal,
    Element::Fire,
    Element::Water,
    Element::Grass,
    Element::Electric,
    Element::Ice,
    Element::Fighting,
    Element::Poison,
    Element::Ground,
    Element::Flying,
    Element::Psychic,
    Element::Bug,
    Element::Rock,
    Element::Ghost,
    Element::Dragon,
    Element::Dark,
    Element::Steel,
    Element::Fairy,
    Element::Light,
];
// Canonical v3.1 directed rows; tested against all 361 source pairs.
const MATRIX: [[u16; 19]; 19] = [
    [
        1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 800, 0, 1000, 1000,
        800, 1000, 1000,
    ],
    [
        1000, 800, 800, 1250, 1000, 1250, 1000, 1000, 1000, 1000, 1000, 1250, 800, 1000, 800, 1000,
        1250, 1000, 1000,
    ],
    [
        1000, 1250, 800, 800, 1000, 1000, 1000, 1000, 1250, 1000, 1000, 1000, 1250, 1000, 800,
        1000, 1000, 1000, 1000,
    ],
    [
        1000, 800, 1250, 800, 1000, 1000, 1000, 800, 1250, 800, 1000, 800, 1250, 1000, 800, 1000,
        800, 1000, 1250,
    ],
    [
        1000, 1000, 1250, 800, 800, 1000, 1000, 1000, 0, 1250, 1000, 1000, 1000, 1000, 800, 1000,
        1000, 1000, 1000,
    ],
    [
        1000, 800, 800, 1250, 1000, 800, 1000, 1000, 1250, 1250, 1000, 1000, 1000, 1000, 1250,
        1000, 800, 1000, 1000,
    ],
    [
        1250, 1000, 1000, 1000, 1000, 1250, 1000, 800, 1000, 800, 800, 800, 1250, 0, 1000, 1250,
        1250, 800, 1000,
    ],
    [
        1000, 1000, 1000, 1250, 1000, 1000, 1000, 800, 800, 1000, 1000, 1000, 800, 800, 1000, 1000,
        0, 1250, 1000,
    ],
    [
        1000, 1250, 1000, 800, 1250, 1000, 1000, 1250, 1000, 0, 1000, 800, 1250, 1000, 1000, 1000,
        1250, 1000, 1000,
    ],
    [
        1000, 1000, 1000, 1250, 800, 1000, 1250, 1000, 1000, 1000, 1000, 1250, 800, 1000, 1000,
        1000, 800, 1000, 1000,
    ],
    [
        1000, 1000, 1000, 1000, 1000, 1000, 1250, 1250, 1000, 1000, 800, 1000, 1000, 1000, 1000, 0,
        800, 1000, 1000,
    ],
    [
        1000, 800, 1000, 1250, 1000, 1000, 800, 800, 1000, 800, 1250, 1000, 1000, 800, 1000, 1250,
        800, 800, 1000,
    ],
    [
        1000, 1250, 1000, 1000, 1000, 1250, 800, 1000, 800, 1250, 1000, 1250, 1000, 1000, 1000,
        1000, 800, 1000, 1000,
    ],
    [
        0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1250, 1000, 1000, 1250, 1000, 800,
        1000, 1000, 800,
    ],
    [
        1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1250,
        1000, 800, 0, 1000,
    ],
    [
        1000, 1000, 1000, 1000, 1000, 1000, 800, 1000, 1000, 1000, 1250, 1000, 1000, 1250, 1000,
        800, 1000, 800, 1250,
    ],
    [
        1000, 800, 800, 1000, 800, 1250, 1000, 1000, 1000, 1000, 1000, 1000, 1250, 1000, 1000,
        1000, 800, 1250, 1250,
    ],
    [
        1000, 800, 1000, 1000, 1000, 1000, 1250, 800, 1000, 1000, 1000, 1000, 1000, 1000, 1250,
        1250, 800, 1000, 1000,
    ],
    [
        1000, 1000, 1000, 800, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1250, 1000,
        1250, 800, 1000, 800,
    ],
];
pub fn effectiveness(attacker: Element, defender: Element) -> u16 {
    MATRIX[attacker as usize][defender as usize]
}
/// Floor once after multiplication. Immunity stays zero; overflow fails closed.
pub fn scale_damage(base: u32, attacker: Element, defender: Element) -> Result<u32, TaxonomyError> {
    let scaled = u64::from(base) * u64::from(effectiveness(attacker, defender)) / 1000;
    u32::try_from(scaled).map_err(|_| TaxonomyError::Arithmetic)
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Race {
    Beast,
    Dragonkin,
    Spirit,
    Celestial,
    Demon,
    Avian,
    Flora,
    Aquatic,
    Undead,
    Construct,
    Machine,
    Slime,
    Insectoid,
    Mythborn,
    Humanoid,
    Elemental,
    Fungal,
    Arthropod,
    Amorphous,
    Crystalborn,
    LivingArtifact,
    Cephalopod,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BodyPlan {
    Quadruped,
    Floating,
    Insectoid,
    Serpentine,
    Avian,
    Humanoid,
    Golem,
    Plant,
    Slime,
    Spectral,
    Amorphous,
    Mechanical,
    Centaur,
    Aquatic,
    Radial,
    Hexapod,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Rig {
    RigQ4,
    RigSerpent,
    RigFloat,
    RigHumanoid,
    RigAvian,
    RigFlora,
    RigAquatic,
    RigSpectral,
    RigHeavy,
    RigMachine,
    RigSoft,
    RigInsect,
    RigCentaur,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Locomotion {
    Walk,
    Hover,
    Fly,
    Swim,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Morphology {
    pub body_plan: BodyPlan,
    pub rig: Rig,
    pub locomotion: Locomotion,
}
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MorphologyRequest {
    pub race: Race,
    pub override_morphology: Option<Morphology>,
}
impl Race {
    pub fn default_morphology(self) -> Morphology {
        let (body_plan, rig, locomotion) = match self {
            Self::Beast => (BodyPlan::Quadruped, Rig::RigQ4, Locomotion::Walk),
            Self::Dragonkin => (BodyPlan::Serpentine, Rig::RigSerpent, Locomotion::Walk),
            Self::Spirit => (BodyPlan::Floating, Rig::RigFloat, Locomotion::Hover),
            Self::Celestial => (BodyPlan::Humanoid, Rig::RigHumanoid, Locomotion::Walk),
            Self::Demon => (BodyPlan::Humanoid, Rig::RigHumanoid, Locomotion::Walk),
            Self::Avian => (BodyPlan::Avian, Rig::RigAvian, Locomotion::Fly),
            Self::Flora => (BodyPlan::Plant, Rig::RigFlora, Locomotion::Walk),
            Self::Aquatic => (BodyPlan::Aquatic, Rig::RigAquatic, Locomotion::Swim),
            Self::Undead => (BodyPlan::Spectral, Rig::RigSpectral, Locomotion::Hover),
            Self::Construct => (BodyPlan::Golem, Rig::RigHeavy, Locomotion::Walk),
            Self::Machine => (BodyPlan::Mechanical, Rig::RigMachine, Locomotion::Walk),
            Self::Slime => (BodyPlan::Slime, Rig::RigSoft, Locomotion::Walk),
            Self::Insectoid => (BodyPlan::Insectoid, Rig::RigInsect, Locomotion::Walk),
            Self::Mythborn => (BodyPlan::Centaur, Rig::RigCentaur, Locomotion::Walk),
            Self::Humanoid => (BodyPlan::Humanoid, Rig::RigHumanoid, Locomotion::Walk),
            Self::Elemental => (BodyPlan::Amorphous, Rig::RigSoft, Locomotion::Hover),
            Self::Fungal => (BodyPlan::Plant, Rig::RigFlora, Locomotion::Walk),
            Self::Arthropod => (BodyPlan::Insectoid, Rig::RigInsect, Locomotion::Walk),
            Self::Amorphous => (BodyPlan::Amorphous, Rig::RigSoft, Locomotion::Hover),
            Self::Crystalborn => (BodyPlan::Golem, Rig::RigHeavy, Locomotion::Walk),
            Self::LivingArtifact => (BodyPlan::Floating, Rig::RigFloat, Locomotion::Hover),
            Self::Cephalopod => (BodyPlan::Aquatic, Rig::RigAquatic, Locomotion::Swim),
        };
        Morphology {
            body_plan,
            rig,
            locomotion,
        }
    }
}
impl MorphologyRequest {
    /// Race remains presentation-only. Explicit whole overrides never change damage.
    pub fn resolve(self) -> Result<Morphology, TaxonomyError> {
        let morphology = self
            .override_morphology
            .unwrap_or_else(|| self.race.default_morphology());
        let expected = match morphology.body_plan {
            BodyPlan::Golem => Rig::RigHeavy,
            BodyPlan::Humanoid => Rig::RigHumanoid,
            BodyPlan::Plant => Rig::RigFlora,
            BodyPlan::Quadruped => Rig::RigQ4,
            BodyPlan::Mechanical => Rig::RigMachine,
            BodyPlan::Centaur => Rig::RigCentaur,
            BodyPlan::Serpentine => Rig::RigSerpent,
            BodyPlan::Aquatic => Rig::RigAquatic,
            BodyPlan::Amorphous => Rig::RigSoft,
            BodyPlan::Floating => Rig::RigFloat,
            BodyPlan::Spectral => Rig::RigSpectral,
            BodyPlan::Avian => Rig::RigAvian,
            BodyPlan::Insectoid => Rig::RigInsect,
            BodyPlan::Slime => Rig::RigSoft,
            BodyPlan::Radial => Rig::RigAquatic,
            BodyPlan::Hexapod => Rig::RigInsect,
        };
        if morphology.rig != expected {
            return Err(TaxonomyError::IncompatibleRig);
        }
        Ok(morphology)
    }
}
