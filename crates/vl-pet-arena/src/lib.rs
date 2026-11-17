//! Deterministic Pet Arena PvE domain. No I/O, authentication, rewards or routes.
pub mod board;
pub mod combat;
mod combat_codec;
pub mod content;
pub mod status;
pub mod taxonomy_v3;
pub mod telegraph;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InvalidContent,
    InvalidBoard,
    InvalidSwap,
    InvalidTelegraph,
    InvalidStatus,
    Arithmetic,
    Entropy,
}
