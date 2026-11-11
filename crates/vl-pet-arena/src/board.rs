use crate::{
    Error,
    content::{BOARD_SIDE, Element},
};

pub const CELLS: usize = BOARD_SIDE * BOARD_SIDE;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Board(pub [Element; CELLS]);

impl Board {
    pub fn matches(&self) -> [bool; CELLS] {
        let mut marked = [false; CELLS];
        for y in 0..BOARD_SIDE {
            for x in 0..BOARD_SIDE {
                let at = y * BOARD_SIDE + x;
                if x + 2 < BOARD_SIDE
                    && self.0[at] == self.0[at + 1]
                    && self.0[at] == self.0[at + 2]
                {
                    marked[at..at + 3].fill(true);
                }
                if y + 2 < BOARD_SIDE
                    && self.0[at] == self.0[at + BOARD_SIDE]
                    && self.0[at] == self.0[at + 2 * BOARD_SIDE]
                {
                    for offset in 0..3 {
                        marked[at + offset * BOARD_SIDE] = true;
                    }
                }
            }
        }
        marked
    }

    pub fn swap(&self, first: usize, second: usize) -> Result<Self, Error> {
        if first >= CELLS
            || second >= CELLS
            || first == second
            || (first / BOARD_SIDE).abs_diff(second / BOARD_SIDE)
                + (first % BOARD_SIDE).abs_diff(second % BOARD_SIDE)
                != 1
            || self.0[first] == self.0[second]
        {
            return Err(Error::InvalidSwap);
        }
        if self.matches().into_iter().any(|matched| matched) {
            return Err(Error::InvalidBoard);
        }
        let mut next = self.clone();
        next.0.swap(first, second);
        let matches = next.matches();
        if !matches[first] && !matches[second] {
            return Err(Error::InvalidSwap);
        }
        Ok(next)
    }
}

/// Authored stable board, with a known swap 2 <-> 8. Not a random board generator.
pub fn training_board() -> Board {
    use Element::{Ember as E, Grove as G, Spark as S, Tide as T};
    Board([
        E, E, T, G, S, T, T, G, E, S, E, G, G, S, T, E, G, S, S, E, G, T, S, E, E, T, S, G, E, T,
        T, G, E, S, T, G,
    ])
}
