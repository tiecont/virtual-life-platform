//! One-shot volatile movement, cancelled before platform policy locks release.
use crate::{Entity, Error, Reply};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

pub struct MoveInput {
    pub sequence: u64,
    pub x: i32,
    pub z: i32,
    pub epoch: u64,
    pub expected_tick: u64,
    pub sent_at_ms: u64,
    pub expires_at_ms: u64,
}
pub struct MovementRequest {
    pub reply: Reply<Entity>,
    pub(crate) gate: Arc<Mutex<bool>>,
}
impl Drop for MovementRequest {
    fn drop(&mut self) {
        if let Ok(mut active) = self.gate.lock() {
            *active = false;
        }
    }
}
pub(crate) struct Pending {
    pub input: MoveInput,
    pub gate: Arc<Mutex<bool>>,
    pub reply: oneshot::Sender<Result<Entity, Error>>,
}
