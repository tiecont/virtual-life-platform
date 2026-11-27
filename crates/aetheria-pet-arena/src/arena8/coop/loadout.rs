//! Published Artifact definitions and their immutable, server-owned seat bindings.
use super::SeatInput;
use super::config::{ConfigError, stable_id};
use crate::arena8::binding::{
    ARTIFACT_SLOT_COUNT, ArtifactSlot, MAX_ARTIFACT_LEVEL, MAX_TOTAL_MODIFIER,
};
use aetheria_game_core::{Value, canonical::list};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

const LOADOUT_DOMAIN: &str = "aetheria.arena8-coop.loadout.v1";
const MAX_DEFINITIONS: usize = 256;

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EquippedArtifact {
    pub slot: ArtifactSlot,
    pub artifact_id: String,
    pub definition_id: String,
    pub upgrade_level: u8,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactLoadout {
    pub digest: String,
    pub entries: Vec<EquippedArtifact>,
}

impl ArtifactLoadout {
    pub fn digest(
        config_digest: [u8; 32],
        seat: &SeatInput,
        entries: &[EquippedArtifact],
    ) -> String {
        // The allocation writer hashes the same ordered JSON tuple of ASCII ids
        // and whole numbers. Slot order is Core, Aegis, Rune.
        let entries = entries
            .iter()
            .map(|entry| {
                (
                    entry.slot,
                    &entry.artifact_id,
                    &entry.definition_id,
                    entry.upgrade_level,
                )
            })
            .collect::<Vec<_>>();
        let payload = serde_json::to_vec(&(
            LOADOUT_DOMAIN,
            lower_hex(&config_digest),
            &seat.account,
            &seat.pet_id,
            &seat.owned_pet_instance_id,
            seat.level,
            entries,
        ))
        .expect("Artifact identity tuple serializes");
        lower_hex(&Sha256::digest(payload))
    }
}

fn lower_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(out, "{byte:02x}").expect("write to String");
    }
    out
}

fn artifact_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
        })
        && value != "00000000-0000-0000-0000-000000000000"
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(transparent)]
pub(super) struct ArtifactCatalog(Vec<ArtifactDefinition>);

impl ArtifactCatalog {
    pub(super) fn validate(&self) -> Result<(), ConfigError> {
        if self.0.is_empty() || self.0.len() > MAX_DEFINITIONS {
            return Err(ConfigError::Artifact);
        }
        let mut ids = BTreeSet::new();
        let mut slots = BTreeSet::new();
        for definition in &self.0 {
            slots.insert(definition.slot.code());
            if !stable_id(&definition.id)
                || !ids.insert(&definition.id)
                || !(1..=60).contains(&definition.required_pet_level)
            {
                return Err(ConfigError::Artifact);
            }
            definition.effective(MAX_ARTIFACT_LEVEL)?;
        }
        if slots.len() != ARTIFACT_SLOT_COUNT {
            return Err(ConfigError::Artifact);
        }
        Ok(())
    }

    pub(super) fn to_value(&self) -> Value {
        Value::List(self.0.iter().map(ArtifactDefinition::to_value).collect())
    }

    pub(super) fn apply(
        &self,
        config_digest: [u8; 32],
        seat: &SeatInput,
        loadout: &ArtifactLoadout,
    ) -> Result<Modifiers, ConfigError> {
        if loadout.entries.len() > ARTIFACT_SLOT_COUNT
            || loadout
                .entries
                .windows(2)
                .any(|pair| pair[0].slot.code() >= pair[1].slot.code())
        {
            return Err(ConfigError::Artifact);
        }
        let mut ids = BTreeSet::new();
        let mut stats = Modifiers::default();
        for artifact in &loadout.entries {
            if !artifact_uuid(&artifact.artifact_id) || !ids.insert(&artifact.artifact_id) {
                return Err(ConfigError::Artifact);
            }
            let definition = self
                .0
                .iter()
                .find(|definition| definition.id == artifact.definition_id)
                .ok_or(ConfigError::Artifact)?;
            if definition.slot != artifact.slot || seat.level < definition.required_pet_level {
                return Err(ConfigError::Artifact);
            }
            stats.add(definition.effective(artifact.upgrade_level)?);
        }
        if ArtifactLoadout::digest(config_digest, seat, &loadout.entries) != loadout.digest {
            return Err(ConfigError::Artifact);
        }
        Ok(stats)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactDefinition {
    id: String,
    slot: ArtifactSlot,
    required_pet_level: u8,
    modifiers: Modifiers,
    per_level: Modifiers,
}

impl ArtifactDefinition {
    fn effective(&self, level: u8) -> Result<Modifiers, ConfigError> {
        let cap = u32::from(MAX_TOTAL_MODIFIER) / ARTIFACT_SLOT_COUNT as u32;
        if !(1..=MAX_ARTIFACT_LEVEL).contains(&level) {
            return Err(ConfigError::Artifact);
        }
        let steps = u32::from(level - 1);
        let stat = |base: u16, per_level: u16| {
            let value = u32::from(base) + u32::from(per_level) * steps;
            if value > cap {
                return Err(ConfigError::Artifact);
            }
            Ok(value as u16)
        };
        Ok(Modifiers {
            hp: stat(self.modifiers.hp, self.per_level.hp)?,
            attack: stat(self.modifiers.attack, self.per_level.attack)?,
            defense: stat(self.modifiers.defense, self.per_level.defense)?,
            speed: stat(self.modifiers.speed, self.per_level.speed)?,
        })
    }

    fn to_value(&self) -> Value {
        list([
            Value::Text(self.id.clone()),
            Value::Uint(u64::from(self.slot.code())),
            Value::Uint(u64::from(self.required_pet_level)),
            self.modifiers.to_value(),
            self.per_level.to_value(),
        ])
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Modifiers {
    pub hp: u16,
    pub attack: u16,
    pub defense: u16,
    speed: u16,
}

impl Modifiers {
    fn add(&mut self, other: Self) {
        // Each of the three unique slots contributes at most one third of the
        // technical total bound. Speed is retained in the catalog but fixed seat
        // order gives it no cooperative combat effect.
        self.hp += other.hp;
        self.attack += other.attack;
        self.defense += other.defense;
    }

    fn to_value(self) -> Value {
        list(
            [self.hp, self.attack, self.defense, self.speed]
                .map(|value| Value::Uint(u64::from(value))),
        )
    }
}
