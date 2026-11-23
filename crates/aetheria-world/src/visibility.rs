//! Project geometric candidates under a current, trusted-host disclosure policy.
//! An audience is never a client-supplied allowlist or a reusable capability.
use crate::{Entity, Error, Snapshot};

/// Construct only while holding the host's current policy/membership locks.
/// The predicate must include mutual blocks, consent and private membership.
/// Missing policy is denial; the default runtime uses `own` exclusively.
pub struct Audience<F> {
    viewer: u64,
    permits: F,
}
impl Audience<fn(u64) -> bool> {
    pub fn own(viewer: u64) -> Self {
        Self {
            viewer,
            permits: |_| false,
        }
    }
}
impl<F: FnMut(u64) -> bool> Audience<F> {
    pub fn current(viewer: u64, permits: F) -> Self {
        Self { viewer, permits }
    }
}

/// Deliberately excludes total actor counts, queue metrics and timing samples.
#[derive(Debug, PartialEq, Eq)]
pub struct View {
    pub authority_epoch: u64,
    pub tick: u64,
    pub own: Entity,
    pub peers: Vec<Entity>,
}
impl Snapshot {
    pub fn project<F: FnMut(u64) -> bool>(&self, mut audience: Audience<F>) -> Result<View, Error> {
        if audience.viewer != self.viewer {
            return Err(Error::StaleActor);
        }
        let own = self
            .visible
            .iter()
            .find(|entity| entity.id == audience.viewer)
            .ok_or(Error::StaleActor)?
            .clone();
        let peers = self
            .visible
            .iter()
            .filter(|entity| entity.id != audience.viewer && (audience.permits)(entity.id))
            .cloned()
            .collect();
        Ok(View {
            authority_epoch: self.authority_epoch,
            tick: self.tick,
            own,
            peers,
        })
    }
}
