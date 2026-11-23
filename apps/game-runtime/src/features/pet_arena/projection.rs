//! Typed, server-authored Limited Signature projections.
//!
//! These DTOs are intentionally separate from the existing `pet.view.v1`
//! projection. The current Unity viewer has a frozen strict schema, and the
//! native runtime remains default-off until its explicit gameplay entrypoint
//! is selected.

use serde::{Deserialize, Serialize};

pub const ICARUS_PET_ID: &str = "pet-v3-fire-icarus";
pub const ICARUS_SIGNATURE_ID: &str = "signature_icarus";
pub const ICARUS_SIGNATURE_CARD_ID: &str = "signature_card_icarus";
pub const FIRE_ZONE_OPCODE: &str = "FIRE_ZONE";
pub const FIRE_ZONE_CELL_COUNT: usize = 16;
pub const FIRE_ZONE_DURATION_TURNS: u16 = 2;
pub const PET_ARENA_BOARD_SIDE: u16 = 10;
pub const PET_ARENA_BOARD_CELLS: u16 = PET_ARENA_BOARD_SIDE * PET_ARENA_BOARD_SIDE;
pub const MAX_SIGNATURE_BYTES: usize = 16_384;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FireZoneDto {
    pub turn: u16,
    pub cells: Vec<u16>,
    pub expires_turn: u16,
}

impl FireZoneDto {
    pub fn new(turn: u16, cells: Vec<u16>) -> Result<Self, ProjectionError> {
        let dto = Self {
            turn,
            cells,
            expires_turn: turn
                .checked_add(FIRE_ZONE_DURATION_TURNS)
                .ok_or(ProjectionError::InvalidTurn)?,
        };
        dto.validate()?;
        Ok(dto)
    }

    pub fn validate(&self) -> Result<(), ProjectionError> {
        if self.cells.len() != FIRE_ZONE_CELL_COUNT
            || self.expires_turn
                != self
                    .turn
                    .checked_add(FIRE_ZONE_DURATION_TURNS)
                    .ok_or(ProjectionError::InvalidTurn)?
            || self.cells.iter().any(|cell| *cell >= PET_ARENA_BOARD_CELLS)
            || self
                .cells
                .iter()
                .enumerate()
                .any(|(index, cell)| self.cells[..index].contains(cell))
        {
            return Err(ProjectionError::InvalidFireZone);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignatureDto {
    pub pet_id: String,
    pub signature_id: String,
    pub signature_card_id: String,
    pub opcode: String,
    pub turn: u16,
    pub fire_zone: FireZoneDto,
}

impl SignatureDto {
    pub fn icarus(turn: u16, cells: Vec<u16>) -> Result<Self, ProjectionError> {
        let fire_zone = FireZoneDto::new(turn, cells)?;
        let dto = Self {
            pet_id: ICARUS_PET_ID.into(),
            signature_id: ICARUS_SIGNATURE_ID.into(),
            signature_card_id: ICARUS_SIGNATURE_CARD_ID.into(),
            opcode: FIRE_ZONE_OPCODE.into(),
            turn,
            fire_zone,
        };
        dto.validate()?;
        Ok(dto)
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, ProjectionError> {
        if bytes.is_empty() || bytes.len() > MAX_SIGNATURE_BYTES {
            return Err(ProjectionError::InvalidSignature);
        }
        let dto: Self =
            serde_json::from_slice(bytes).map_err(|_| ProjectionError::InvalidSignature)?;
        dto.validate()?;
        Ok(dto)
    }

    pub fn encode(&self) -> Result<Vec<u8>, ProjectionError> {
        self.validate()?;
        serde_json::to_vec(self).map_err(|_| ProjectionError::InvalidSignature)
    }

    pub fn validate(&self) -> Result<(), ProjectionError> {
        if self.pet_id != ICARUS_PET_ID
            || self.signature_id != ICARUS_SIGNATURE_ID
            || self.signature_card_id != ICARUS_SIGNATURE_CARD_ID
            || self.opcode != FIRE_ZONE_OPCODE
            || self.turn != self.fire_zone.turn
        {
            return Err(ProjectionError::InvalidSignature);
        }
        self.fire_zone.validate()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectionError {
    InvalidFireZone,
    InvalidSignature,
    InvalidTurn,
}
