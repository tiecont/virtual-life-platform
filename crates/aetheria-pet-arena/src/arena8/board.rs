use aetheria_game_core::Error as CoreError;
use serde::{Deserialize, Serialize};

use super::{CELLS, ELEMENT_COUNT, ELEMENTS, Element, MAX_BOARD_ATTEMPTS, Random, SIDE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Board {
    pub(crate) cells: [Element; CELLS],
}

impl Board {
    pub const fn from_cells(cells: [Element; CELLS]) -> Self {
        Self { cells }
    }

    /// Authored stable board used for the unstarted state and as the bounded
    /// construction fallback. It has no match and a known legal move at 2 <-> 10.
    pub const fn fallback() -> Self {
        let mut cells = [Element::Fire; CELLS];
        let mut y = 0;
        while y < SIDE {
            let mut x = 0;
            while x < SIDE {
                cells[y * SIDE + x] = ELEMENTS[(x + 2 * y) % ELEMENT_COUNT];
                x += 1;
            }
            y += 1;
        }
        cells[0] = Element::Fire;
        cells[1] = Element::Fire;
        cells[2] = Element::Water;
        cells[3] = Element::Fire;
        cells[SIDE + 2] = Element::Fire;
        Self { cells }
    }

    pub fn cells(&self) -> &[Element; CELLS] {
        &self.cells
    }

    /// Marks every cell in a horizontal or vertical run of three or more.
    /// Crossings are marked once. This is the only match authority.
    pub fn matches(&self) -> [bool; CELLS] {
        let mut marked = [false; CELLS];
        for y in 0..SIDE {
            let mut x = 0;
            while x < SIDE {
                let element = self.cells[y * SIDE + x];
                let mut end = x + 1;
                while end < SIDE && self.cells[y * SIDE + end] == element {
                    end += 1;
                }
                if end - x >= 3 {
                    for at in x..end {
                        marked[y * SIDE + at] = true;
                    }
                }
                x = end;
            }
        }
        for x in 0..SIDE {
            let mut y = 0;
            while y < SIDE {
                let element = self.cells[y * SIDE + x];
                let mut end = y + 1;
                while end < SIDE && self.cells[end * SIDE + x] == element {
                    end += 1;
                }
                if end - y >= 3 {
                    for at in y..end {
                        marked[at * SIDE + x] = true;
                    }
                }
                y = end;
            }
        }
        marked
    }

    /// A legal attack swap: bounded, orthogonally adjacent, different elements,
    /// and the resulting board contains a match that includes a swapped cell.
    /// The caller must have validated that the current board is settled.
    pub fn try_swap(&self, first: u8, second: u8) -> Option<Self> {
        let first = usize::from(first);
        let second = usize::from(second);
        if first >= CELLS || second >= CELLS {
            return None;
        }
        let row_distance = (first / SIDE).abs_diff(second / SIDE);
        let column_distance = (first % SIDE).abs_diff(second % SIDE);
        if row_distance + column_distance != 1 || self.cells[first] == self.cells[second] {
            return None;
        }
        let mut next = *self;
        next.cells.swap(first, second);
        let matches = next.matches();
        if matches[first] || matches[second] {
            Some(next)
        } else {
            None
        }
    }

    /// Deterministic scan order: left to right, top to bottom, then right and
    /// down neighbours. Used for dead-board detection and test drivers.
    pub fn legal_move(&self) -> Option<Swap> {
        for first in 0..CELLS {
            if first % SIDE + 1 < SIDE {
                let second = first + 1;
                if self.try_swap(first as u8, second as u8).is_some() {
                    return Some(Swap {
                        first: first as u8,
                        second: second as u8,
                    });
                }
            }
            if first + SIDE < CELLS {
                let second = first + SIDE;
                if self.try_swap(first as u8, second as u8).is_some() {
                    return Some(Swap {
                        first: first as u8,
                        second: second as u8,
                    });
                }
            }
        }
        None
    }

    pub fn has_matches(&self) -> bool {
        self.matches().into_iter().any(|matched| matched)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Swap {
    pub first: u8,
    pub second: u8,
}

pub(super) struct Generation {
    pub board: Board,
    pub attempts: u8,
    pub fallback: bool,
}

/// Draws one element per cell, rejecting an element that would complete a
/// three-run. With six elements at least four choices remain at every cell.
fn fill_board(rng: &mut impl Random) -> Result<Board, CoreError> {
    let mut cells = [Element::Fire; CELLS];
    for at in 0..CELLS {
        let x = at % SIDE;
        let y = at / SIDE;
        let mut allowed = [Element::Fire; ELEMENT_COUNT];
        let mut count = 0;
        for element in ELEMENTS {
            let horizontal = x >= 2 && cells[at - 1] == element && cells[at - 2] == element;
            let vertical = y >= 2 && cells[at - SIDE] == element && cells[at - 2 * SIDE] == element;
            if !horizontal && !vertical {
                allowed[count] = element;
                count += 1;
            }
        }
        let choice = rng.below(count as u32)? as usize;
        cells[at] = allowed[choice];
    }
    Ok(Board { cells })
}

/// Bounded deterministic initialization and recovery. At most
/// `MAX_BOARD_ATTEMPTS` draws are made; the authored fallback guarantees a
/// settled board with at least one legal move even if every draw fails.
pub(super) fn generate_board(rng: &mut impl Random) -> Result<Generation, CoreError> {
    for attempt in 0..MAX_BOARD_ATTEMPTS {
        let board = fill_board(rng)?;
        if board.legal_move().is_some() {
            return Ok(Generation {
                board,
                attempts: attempt,
                fallback: false,
            });
        }
    }
    Ok(Generation {
        board: Board::fallback(),
        attempts: MAX_BOARD_ATTEMPTS,
        fallback: true,
    })
}

/// Survivors keep their relative order and fall to the bottom of their column.
/// Empty cells at the top are refilled from the private stream, one draw each.
pub(super) fn settle_gravity(
    board: &mut Board,
    matches: &[bool; CELLS],
    rng: &mut impl Random,
) -> Result<(), CoreError> {
    for x in 0..SIDE {
        let mut survivors = [Element::Fire; SIDE];
        let mut count = 0;
        for y in (0..SIDE).rev() {
            let at = y * SIDE + x;
            if !matches[at] {
                survivors[count] = board.cells[at];
                count += 1;
            }
        }
        for y in (0..SIDE).rev() {
            let at = y * SIDE + x;
            let depth = SIDE - 1 - y;
            board.cells[at] = if depth < count {
                survivors[depth]
            } else {
                ELEMENTS[rng.below(ELEMENT_COUNT as u32)? as usize]
            };
        }
    }
    Ok(())
}
