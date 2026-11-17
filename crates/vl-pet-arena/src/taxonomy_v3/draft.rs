//! The shared draft taxonomy shape, accepted only after complete validation.
use std::{fmt, marker::PhantomData};

use serde::{
    Deserialize, Deserializer,
    de::{self, MapAccess, Visitor},
};

use super::{BodyPlan, Element, Locomotion, Morphology, Race, Rig, TaxonomyError};

/// Offline candidate data. Decoding confers no publication or runtime authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TaxonomyDraft {
    effectiveness: [[u16; 19]; 19],
    morphologies: [Morphology; 22],
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WireDraft {
    schema_version: u8,
    ruleset: String,
    state: String,
    enabled: bool,
    elements: [ElementDefinition; 19],
    effectiveness: ElementMap<ElementMap<u16>>,
    races: [RaceDefinition; 22],
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ElementDefinition {
    id: Element,
    strong_against: Vec<Element>,
    resisted_by: Vec<Element>,
    no_effect_against: Vec<Element>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RaceDefinition {
    id: Race,
    default_body_plan: BodyPlan,
    default_rig: Rig,
    locomotion: Locomotion,
}

// Map deserialization must retain duplicate-key detection before JSON values can
// overwrite each other. All rows/columns must contain exactly the 19 known IDs.
struct ElementMap<T>([T; 19]);
impl<'de, T: Deserialize<'de>> Deserialize<'de> for ElementMap<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct MapVisitor<T>(PhantomData<T>);
        impl<'de, T: Deserialize<'de>> Visitor<'de> for MapVisitor<T> {
            type Value = ElementMap<T>;
            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("exactly one value for each of the 19 elements")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut values: [Option<T>; 19] = std::array::from_fn(|_| None);
                while let Some((element, value)) = map.next_entry::<Element, T>()? {
                    let slot = &mut values[element as usize];
                    if slot.is_some() {
                        return Err(de::Error::custom("duplicate element"));
                    }
                    *slot = Some(value);
                }
                if values.iter().any(Option::is_none) {
                    return Err(de::Error::custom("missing element"));
                }
                Ok(ElementMap(values.map(Option::unwrap)))
            }
        }
        deserializer.deserialize_map(MapVisitor(PhantomData))
    }
}

impl TaxonomyDraft {
    pub fn decode(bytes: &[u8]) -> Result<Self, TaxonomyError> {
        if bytes.len() > 65_536 {
            return Err(TaxonomyError::InvalidDraft);
        }
        let draft: WireDraft =
            serde_json::from_slice(bytes).map_err(|_| TaxonomyError::InvalidDraft)?;
        if draft.schema_version != 3
            || draft.ruleset != "pet-arena-pve-v3"
            || draft.state != "DRAFT_ONLY"
            || draft.enabled
        {
            return Err(TaxonomyError::InvalidDraft);
        }
        let matrix = draft.effectiveness.0.map(|row| row.0);
        let mut seen = [false; 19];
        let mut countered = [false; 19];
        for element in draft.elements {
            let index = element.id as usize;
            if std::mem::replace(&mut seen[index], true) {
                return Err(TaxonomyError::InvalidDraft);
            }
            let mut expected = [1000; 19];
            let mut targets = [false; 19];
            for (relations, permille) in [
                (element.strong_against, 1250),
                (element.resisted_by, 800),
                (element.no_effect_against, 0),
            ] {
                if relations.len() > 18 {
                    return Err(TaxonomyError::InvalidDraft);
                }
                for defender in relations {
                    let target = defender as usize;
                    if std::mem::replace(&mut targets[target], true) {
                        return Err(TaxonomyError::InvalidDraft);
                    }
                    expected[target] = permille;
                    countered[target] |= permille == 1250;
                }
            }
            if matrix[index] != expected {
                return Err(TaxonomyError::InvalidDraft);
            }
        }
        if countered.iter().any(|value| !value) {
            return Err(TaxonomyError::InvalidDraft);
        }
        let mut morphologies = [Race::Beast.default_morphology(); 22];
        let mut seen = [false; 22];
        for race in draft.races {
            let index = race.id as usize;
            if std::mem::replace(&mut seen[index], true) {
                return Err(TaxonomyError::InvalidDraft);
            }
            morphologies[index] = Morphology {
                body_plan: race.default_body_plan,
                rig: race.default_rig,
                locomotion: race.locomotion,
            }
            .validate()?;
        }
        Ok(Self {
            effectiveness: matrix,
            morphologies,
        })
    }

    pub fn effectiveness(&self, attacker: Element, defender: Element) -> u16 {
        self.effectiveness[attacker as usize][defender as usize]
    }

    /// Apply the candidate's directional multiplier with one final floor.
    pub fn scale_damage(
        &self,
        base: u32,
        attacker: Element,
        defender: Element,
    ) -> Result<u32, TaxonomyError> {
        let scaled = u64::from(base) * u64::from(self.effectiveness(attacker, defender)) / 1000;
        u32::try_from(scaled).map_err(|_| TaxonomyError::Arithmetic)
    }

    pub fn morphology(&self, race: Race) -> Morphology {
        self.morphologies[race as usize]
    }
}
