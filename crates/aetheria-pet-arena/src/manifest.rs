//! Strict, bounded v3 allocation binding; not a v3 reducer or activation switch.
//! The host must authenticate the checkpoint and load the manifest by both hashes.
use serde::{Deserialize, Serialize};

use crate::Error;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MatchPin {
    pub schema_version: u8,
    pub ruleset: String,
    pub content_hash: String,
    pub rules_hash: String,
    pub encounter: String,
    pub encounter_revision: u32,
    pub loadout: String,
    pub level: u8,
    pub stats: Stats,
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stats {
    pub hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
}
impl MatchPin {
    pub fn decode(bytes: &[u8]) -> Result<Self, Error> {
        if bytes.len() > 4096 {
            return Err(Error::InvalidContent);
        }
        let value: Self = serde_json::from_slice(bytes).map_err(|_| Error::InvalidContent)?;
        value.validate()?;
        Ok(value)
    }
    pub fn validate(&self) -> Result<(), Error> {
        let hash = |s: &str| {
            s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        let id = |s: &str| {
            !s.is_empty()
                && s.len() <= 64
                && s.as_bytes()[0].is_ascii_lowercase()
                && s.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
        };
        if self.schema_version != 3
            || self.ruleset != "pet-arena-pve-v3"
            || !hash(&self.content_hash)
            || !hash(&self.rules_hash)
            || !id(&self.encounter)
            || !id(&self.loadout)
            || !(1..=2_147_483_647).contains(&self.encounter_revision)
            || !(1..=100).contains(&self.level)
            || !(1..=1_000_000).contains(&self.stats.hp)
            || !(1..=100_000).contains(&self.stats.attack)
            || self.stats.defense > 100_000
            || !(1..=100_000).contains(&self.stats.speed)
        {
            return Err(Error::InvalidContent);
        }
        Ok(())
    }
}
