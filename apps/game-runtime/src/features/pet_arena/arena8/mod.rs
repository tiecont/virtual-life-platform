//! Data-bound 8x8 Pet Arena adapter (`arena8-pve`).
//!
//! Reuses the existing Host/Command/checkpoint/journal/admission architecture:
//! the runtime only supplies a domain `Reducer`, a strict intent parser and an
//! authored projection. It owns no entropy, no outcome and no reward.

pub mod application;
pub mod domain;
mod infrastructure;
#[cfg(test)]
mod tests;
