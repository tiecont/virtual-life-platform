//! Four-seat cooperative native adapter (`arena8-coop-pve`).
//!
//! The runtime supplies a configuration-bound domain reducer, a strict intent
//! parser and a committed projection. The validated bundle arrives from the
//! server-owned allocation snapshot; this adapter carries no balance defaults.

pub mod application;
pub mod domain;
mod infrastructure;
#[cfg(test)]
mod tests;
