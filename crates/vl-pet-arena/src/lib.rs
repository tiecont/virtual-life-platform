//! Authored Pet Arena PvE content and input contracts. No I/O, authority, rewards,
//! board generation, cascade loop or combat AI; those are integrated by VL-044.
pub mod board;
pub mod content;
pub mod status;
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
