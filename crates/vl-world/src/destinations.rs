//! Versioned native POI metadata. A catalog entry is never an admission token.
//! The host supplies current policy and occupancy under its authorization locks;
//! a future transfer owner must recheck both when reserving and committing.
use serde::Deserialize;
use std::collections::BTreeSet;

const MAX_CATALOG_BYTES: usize = 65_536;
const MAX_PLACES: usize = 256;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Access {
    Public,
    Private,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Place {
    id: String,
    world: String,
    content_hash: String,
    anchor: String,
    capacity: u16,
    access: Access,
}
impl Place {
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn world(&self) -> &str {
        &self.world
    }
    pub fn content_hash(&self) -> &str {
        &self.content_hash
    }
    pub fn anchor(&self) -> &str {
        &self.anchor
    }
    pub fn capacity(&self) -> u16 {
        self.capacity
    }
    pub fn access(&self) -> Access {
        self.access
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    schema_version: u32,
    revision: u64,
    places: Vec<Place>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidCatalog,
    Unavailable,
    StaleCatalog,
    Full,
}

/// Server-owned current facts, never fields accepted from a map click.
/// `discover` must be explicit even for public entries. `enter` includes all
/// current session, entitlement, moderation and private-membership checks.
#[derive(Clone, Copy, Default)]
pub struct CurrentAccess {
    pub discover: bool,
    pub enter: bool,
    pub occupants: u16,
    pub reservations: u16,
}
impl CurrentAccess {
    fn full(self, place: &Place) -> bool {
        u32::from(self.occupants) + u32::from(self.reservations) >= u32::from(place.capacity)
    }
}

/// No raw occupancy or hidden catalog totals are included in a discovery view.
#[derive(Debug, PartialEq, Eq)]
pub struct Poi<'a> {
    pub id: &'a str,
    pub revision: u64,
    pub access: Access,
    pub capacity: u16,
    pub available: bool,
}

fn key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}
fn world(value: &str) -> bool {
    value.strip_prefix("native:").is_some_and(|id| {
        !id.is_empty()
            && id.len() <= 64
            && (id.as_bytes()[0].is_ascii_lowercase() || id.as_bytes()[0].is_ascii_digit())
            && id.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
            })
    })
}
impl Catalog {
    pub fn parse(bytes: &[u8]) -> Result<Self, Error> {
        if bytes.len() > MAX_CATALOG_BYTES {
            return Err(Error::InvalidCatalog);
        }
        let catalog: Self = serde_json::from_slice(bytes).map_err(|_| Error::InvalidCatalog)?;
        let mut ids = BTreeSet::new();
        if catalog.schema_version != 1
            || catalog.revision == 0
            || catalog.places.is_empty()
            || catalog.places.len() > MAX_PLACES
            || catalog.places.iter().any(|place| {
                !key(&place.id)
                    || !ids.insert(&place.id)
                    || !world(&place.world)
                    || !key(&place.anchor)
                    || place.capacity == 0
                    || usize::from(place.capacity) > crate::MAX_ACTORS
                    || place.content_hash.len() != 64
                    || !place
                        .content_hash
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        {
            return Err(Error::InvalidCatalog);
        }
        Ok(catalog)
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// `current` must resolve live server facts for this authenticated viewer.
    /// Returning None fails closed, including policy outages and unknown scopes.
    pub fn discover<'a>(
        &'a self,
        mut current: impl FnMut(&Place) -> Option<CurrentAccess>,
    ) -> Vec<Poi<'a>> {
        self.places
            .iter()
            .filter_map(|place| {
                let access = current(place)?;
                access.discover.then_some(Poi {
                    id: &place.id,
                    revision: self.revision,
                    access: place.access,
                    capacity: place.capacity,
                    available: access.enter && !access.full(place),
                })
            })
            .collect()
    }

    /// Resolve an untrusted click against this catalog and current host policy.
    /// This is advisory eligibility only: it cannot reserve capacity or write
    /// membership. The eventual saga must hold/recheck policy across mutation.
    pub fn candidate(
        &self,
        id: &str,
        revision: u64,
        current: impl FnOnce(&Place) -> Option<CurrentAccess>,
    ) -> Result<&Place, Error> {
        let place = self
            .places
            .iter()
            .find(|place| place.id == id)
            .ok_or(Error::Unavailable)?;
        let access = current(place)
            .filter(|access| access.discover && access.enter)
            .ok_or(Error::Unavailable)?;
        if revision != self.revision {
            return Err(Error::StaleCatalog);
        }
        if access.full(place) {
            return Err(Error::Full);
        }
        Ok(place)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::json!({"schemaVersion":1,"revision":7,"places":[
            {"id":"plaza","world":"native:aurora-plaza","contentHash":"a".repeat(64),"anchor":"spawn","capacity":2,"access":"public"},
            {"id":"private-room","world":"native:private-room","contentHash":"b".repeat(64),"anchor":"door","capacity":1,"access":"private"}
        ]})
    }
    fn parse(value: &serde_json::Value) -> Result<Catalog, Error> {
        Catalog::parse(&serde_json::to_vec(value).unwrap())
    }
    fn allow() -> Option<CurrentAccess> {
        Some(CurrentAccess {
            discover: true,
            enter: true,
            ..Default::default()
        })
    }
    #[test]
    fn schema_rejects_unknown_fields_duplicates_legacy_scopes_and_unbounded_inputs() {
        let original = fixture();
        assert!(parse(&original).is_ok());
        for (field, invalid) in [
            ("id", serde_json::json!("../secret")),
            ("world", serde_json::json!("legacy:cafe")),
            ("world", serde_json::json!("native:")),
            ("contentHash", serde_json::json!("A".repeat(64))),
            ("anchor", serde_json::json!("")),
            ("capacity", serde_json::json!(0)),
            ("capacity", serde_json::json!(257)),
            ("access", serde_json::json!("friends")),
            ("permission", serde_json::json!(true)),
        ] {
            let mut value = original.clone();
            value["places"][0][field] = invalid;
            assert!(parse(&value).is_err(), "{field}");
        }
        for (field, invalid) in [
            ("schemaVersion", serde_json::json!(2)),
            ("revision", serde_json::json!(0)),
            ("extra", serde_json::json!(true)),
            ("places", serde_json::json!([])),
            (
                "places",
                serde_json::json!([original["places"][0].clone(), original["places"][0].clone()]),
            ),
        ] {
            let mut value = original.clone();
            value[field] = invalid;
            assert!(parse(&value).is_err());
        }
        assert!(Catalog::parse(&vec![b' '; MAX_CATALOG_BYTES + 1]).is_err());
    }
    #[test]
    fn hidden_private_locations_and_policy_outages_disclose_nothing() {
        let catalog = parse(&fixture()).unwrap();
        assert!(catalog.discover(|_| None).is_empty());
        assert!(
            catalog
                .discover(|_| Some(CurrentAccess::default()))
                .is_empty()
        );
        let public =
            catalog.discover(|place| (place.access() == Access::Public).then(allow).flatten());
        assert_eq!(public.len(), 1);
        assert_eq!(public[0].id, "plaza");
        for id in ["private-room", "missing"] {
            assert_eq!(
                catalog.candidate(id, 1, |_| None).unwrap_err(),
                Error::Unavailable
            );
        }
        assert_eq!(catalog.discover(|_| allow()).len(), 2);
    }
    #[test]
    fn stale_poi_never_grants_entry_and_live_revocation_wins_over_version_errors() {
        let catalog = parse(&fixture()).unwrap();
        let old_view = catalog.discover(|_| allow());
        assert!(old_view[0].available);
        assert_eq!(
            catalog.candidate("plaza", 6, |_| allow()).unwrap_err(),
            Error::StaleCatalog
        );
        for revision in [6, 7, 8] {
            assert_eq!(
                catalog.candidate("plaza", revision, |_| None).unwrap_err(),
                Error::Unavailable
            );
            assert_eq!(
                catalog
                    .candidate("plaza", revision, |_| Some(CurrentAccess {
                        discover: true,
                        ..Default::default()
                    }))
                    .unwrap_err(),
                Error::Unavailable
            );
        }
        let place = catalog.candidate("plaza", 7, |_| allow()).unwrap();
        assert_eq!(place.world(), "native:aurora-plaza");
        assert_eq!(place.anchor(), "spawn");
        assert_eq!(place.content_hash(), "a".repeat(64));
    }
    #[test]
    fn capacity_counts_holds_without_overflow_or_admission_side_effects() {
        let catalog = parse(&fixture()).unwrap();
        for (occupants, reservations) in [(2, 0), (1, 1), (0, 2), (u16::MAX, u16::MAX)] {
            let current = CurrentAccess {
                discover: true,
                enter: true,
                occupants,
                reservations,
            };
            assert!(!catalog.discover(|_| Some(current))[0].available);
            assert_eq!(
                catalog
                    .candidate("plaza", 7, |_| Some(current))
                    .unwrap_err(),
                Error::Full
            );
        }
        assert!(
            catalog
                .candidate("plaza", 7, |_| Some(CurrentAccess {
                    occupants: 1,
                    ..allow().unwrap()
                }))
                .is_ok()
        );
        assert!(catalog.candidate("plaza", 7, |_| allow()).is_ok());
        assert_eq!(catalog.revision(), 7);
    }
}
