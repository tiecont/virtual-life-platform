use crate::{
    Error,
    board::CELLS,
    content::{BOARD_SIDE, MAX_TURNS, STAGES},
};
use vl_game_core::TurnRng;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Pattern {
    Row = 0,
    Column = 1,
    Cross = 2,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Telegraph {
    pub stage: u8,
    pub announced_turn: u16,
    pub resolves_turn: u16,
    pub pattern: Pattern,
    pub target: u8,
    pub cells: Vec<u8>,
}

impl Telegraph {
    pub fn draw(stage: u8, turn: u16, rng: &mut TurnRng) -> Result<Self, Error> {
        // Invalid inputs cannot consume the committed entropy stream.
        Self::announce(stage, turn, 0)?;
        let choice = rng.below(BOARD_SIDE as u32).map_err(|_| Error::Entropy)?;
        Self::announce(stage, turn, choice as u8)
    }

    /// The host passes a bounded choice drawn from its private versioned TurnRng.
    /// Announce this committed intent one complete player turn before resolution.
    pub fn announce(stage: u8, turn: u16, choice: u8) -> Result<Self, Error> {
        let definition = STAGES
            .get(usize::from(stage))
            .ok_or(Error::InvalidTelegraph)?;
        if turn >= MAX_TURNS || usize::from(choice) >= BOARD_SIDE {
            return Err(Error::InvalidTelegraph);
        }
        let pattern = definition.patterns[usize::from(turn) % definition.patterns.len()];
        let cells = (0..CELLS)
            .filter(|at| match pattern {
                Pattern::Row => at / BOARD_SIDE == usize::from(choice),
                Pattern::Column => at % BOARD_SIDE == usize::from(choice),
                Pattern::Cross => {
                    at / BOARD_SIDE == usize::from(choice) || at % BOARD_SIDE == usize::from(choice)
                }
            })
            .map(|at| at as u8)
            .collect();
        Ok(Self {
            stage,
            announced_turn: turn,
            resolves_turn: turn + 1,
            pattern,
            target: choice,
            cells,
        })
    }

    pub fn validate_for_resolution(&self, stage: u8, turn: u16) -> Result<(), Error> {
        if self.stage != stage
            || self.resolves_turn != turn
            || *self != Self::announce(stage, self.announced_turn, self.target)?
        {
            return Err(Error::InvalidTelegraph);
        }
        Ok(())
    }
}
