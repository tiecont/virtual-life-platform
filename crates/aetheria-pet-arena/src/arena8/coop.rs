//! Versioned four-seat cooperative Arena8 Boss foundation.
//!
//! This module is intentionally separate from the frozen solo `arena8-pve`
//! reducer. It models one shared board, four authenticated seats, deterministic
//! round order, two Boss phases and progressive multiplier tiles. It is a local
//! candidate ruleset until the native cooperative contract and owner balance are
//! accepted.

use super::Element;

pub const COOP_RULESET_ID: &str = "aetheria-pet-arena-arena8-coop";
pub const COOP_RULESET_VERSION: u32 = 1;
pub const SEATS: usize = 4;
pub const SIDE: usize = 8;
pub const CELLS: usize = SIDE * SIDE;
pub const MAX_ROUNDS: u32 = 60;
pub const PHASE_THRESHOLD_BP: u32 = 2_500;
pub const PHASE2_MAX_GROWTH_BP: u32 = 7_500;
pub const PHASE2_CURRENT_BP: u32 = 8_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoopPhase {
    Ready,
    Playing,
    Won,
    Lost,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Tile {
    pub element: Element,
    pub multiplier: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Participant {
    pub account: String,
    pub pet_id: String,
    pub level: u8,
    pub hp: u32,
    pub max_hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub mana: u16,
    pub rage: u16,
    pub crit_rate_bp: u16,
    pub crit_damage_bp: u16,
    pub alive: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Boss {
    pub max_hp: u32,
    pub hp: u32,
    pub phase: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CoopState {
    pub participants: [Participant; SEATS],
    pub boss: Boss,
    pub board: [Tile; CELLS],
    pub phase: CoopPhase,
    pub active_seat: usize,
    pub turn_index: u32,
    pub round_index: u32,
    pub cascade_index: u8,
    pub seed: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoopAction {
    Start,
    Swap { first: u8, second: u8 },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoopError {
    InvalidPhase,
    InvalidSeat,
    InvalidSwap,
    NoMatch,
    OutOfBounds,
}

impl Participant {
    pub fn new(
        account: impl Into<String>,
        pet: impl Into<String>,
        element: Element,
        level: u8,
    ) -> Self {
        let (hp, attack, defense, crit_rate_bp, crit_damage_bp) = profile(element);
        let max_hp = hp + u32::from(level.saturating_sub(1)) * 8;
        Self {
            account: account.into(),
            pet_id: pet.into(),
            level,
            hp: max_hp,
            max_hp,
            attack: attack + u32::from(level.saturating_sub(1)) * 2,
            defense: defense + u32::from(level.saturating_sub(1)),
            mana: 0,
            rage: 0,
            crit_rate_bp,
            crit_damage_bp,
            alive: true,
        }
    }
}

pub fn profile(element: Element) -> (u32, u32, u32, u16, u16) {
    match element {
        Element::Fire => (900, 125, 85, 1_500, 17_500),
        Element::Water => (1_100, 85, 100, 1_000, 15_000),
        Element::Electric => (850, 110, 80, 2_500, 16_500),
        Element::Ghost => (900, 105, 90, 1_800, 18_500),
        Element::Ground => (1_400, 95, 135, 800, 25_000),
        Element::Light => (1_050, 95, 105, 1_200, 16_000),
    }
}

pub fn multiplier_tier(round: u32) -> u8 {
    match round {
        0..=11 => 1,
        12..=16 => 2,
        17..=21 => 3,
        22..=26 => 4,
        27..=31 => 5,
        _ => 6,
    }
}

impl CoopState {
    pub fn new(seed: u64, participants: [Participant; SEATS], boss_max_hp: u32) -> Self {
        let mut state = Self {
            participants,
            boss: Boss {
                max_hp: boss_max_hp,
                hp: boss_max_hp,
                phase: 1,
            },
            board: [Tile {
                element: Element::Fire,
                multiplier: 1,
            }; CELLS],
            phase: CoopPhase::Ready,
            active_seat: 0,
            turn_index: 0,
            round_index: 1,
            cascade_index: 0,
            seed: seed.max(1),
        };
        state.fill_board();
        state
    }

    fn next_random(&mut self) -> u64 {
        let mut x = self.seed;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.seed = x.max(1);
        x
    }

    fn tile(&mut self, existing: bool) -> Tile {
        let roll = self.next_random();
        let element = match roll % 6 {
            0 => Element::Fire,
            1 => Element::Water,
            2 => Element::Electric,
            3 => Element::Ghost,
            4 => Element::Ground,
            _ => Element::Light,
        };
        let tier = multiplier_tier(self.round_index);
        let multiplier = if existing {
            1
        } else {
            1 + (self.next_random() % u64::from(tier)) as u8
        };
        Tile {
            element,
            multiplier,
        }
    }

    fn fill_board(&mut self) {
        for index in 0..CELLS {
            let tile = self.tile(true);
            self.board[index] = tile;
        }
        if !self.has_legal_swap() {
            for index in 0..CELLS {
                let tile = self.tile(true);
                self.board[index] = tile;
            }
        }
    }

    pub fn legal_swap(&self) -> Option<(u8, u8)> {
        for first in 0..CELLS {
            let row = first / SIDE;
            let column = first % SIDE;
            if column + 1 < SIDE && self.swap_matches(first, first + 1) {
                return Some((u8::try_from(first).ok()?, u8::try_from(first + 1).ok()?));
            }
            if row + 1 < SIDE && self.swap_matches(first, first + SIDE) {
                return Some((u8::try_from(first).ok()?, u8::try_from(first + SIDE).ok()?));
            }
        }
        None
    }

    fn swap_matches(&self, first: usize, second: usize) -> bool {
        let mut next = self.board;
        next.swap(first, second);
        !matched_cells(&next).is_empty()
    }

    fn has_legal_swap(&self) -> bool {
        self.legal_swap().is_some()
    }

    pub fn apply(&mut self, action: CoopAction) -> Result<(), CoopError> {
        match action {
            CoopAction::Start => {
                if self.phase != CoopPhase::Ready {
                    return Err(CoopError::InvalidPhase);
                }
                self.phase = CoopPhase::Playing;
                self.active_seat = self.next_alive(0).ok_or(CoopError::InvalidSeat)?;
                self.turn_index = 1;
                Ok(())
            }
            CoopAction::Swap { first, second } => {
                if self.phase != CoopPhase::Playing {
                    return Err(CoopError::InvalidPhase);
                }
                let first = usize::from(first);
                let second = usize::from(second);
                if first >= CELLS || second >= CELLS {
                    return Err(CoopError::OutOfBounds);
                }
                if !adjacent(first, second) {
                    return Err(CoopError::InvalidSwap);
                }
                let mut next = self.board;
                next.swap(first, second);
                let matched = matched_cells(&next);
                if matched.is_empty() {
                    return Err(CoopError::NoMatch);
                }
                self.board = next;
                self.cascade_index = 0;
                self.resolve_matches(&matched);
                self.turn_index += 1;
                self.advance_seat();
                Ok(())
            }
        }
    }

    fn resolve_matches(&mut self, cells: &[bool]) {
        let seat = self.active_seat;
        let element = element_of(&self.participants[seat].pet_id);
        let mut contribution = 0u32;
        let mut cleared = 0u32;
        for (index, matched) in cells.iter().enumerate().take(CELLS) {
            if !matched {
                continue;
            }
            let tile = self.board[index];
            let weight = if tile.element == element { 2 } else { 1 };
            contribution = contribution.saturating_add(weight * u32::from(tile.multiplier));
            cleared += 1;
            self.board[index] = Tile {
                element: Element::Fire,
                multiplier: 0,
            };
        }
        let attack = self.participants[seat].attack;
        let crit_rate = self.participants[seat].crit_rate_bp;
        let crit_damage = self.participants[seat].crit_damage_bp;
        let crit = self.next_random() % 10_000 < u64::from(crit_rate);
        let mut damage = attack.saturating_mul(10).saturating_add(contribution * 5);
        if crit {
            damage = damage.saturating_mul(u32::from(crit_damage)) / 10_000;
        }
        let participant = &mut self.participants[seat];
        participant.mana = participant
            .mana
            .saturating_add(u16::try_from(cleared * 3).unwrap_or(u16::MAX))
            .min(300);
        participant.rage = participant
            .rage
            .saturating_add(u16::try_from(cleared * 2).unwrap_or(u16::MAX))
            .min(200);
        self.damage_boss(damage);
        self.refill();
    }

    fn damage_boss(&mut self, damage: u32) {
        if self.boss.phase == 1 {
            let threshold = self.boss.max_hp.saturating_mul(PHASE_THRESHOLD_BP) / 10_000;
            if damage >= self.boss.hp.saturating_sub(threshold) {
                // Phase transition consumes the boundary hit; excess is discarded.
                let phase2_max = self
                    .boss
                    .max_hp
                    .saturating_mul(10_000 + PHASE2_MAX_GROWTH_BP)
                    / 10_000;
                self.boss.max_hp = phase2_max;
                self.boss.hp = phase2_max.saturating_mul(PHASE2_CURRENT_BP) / 10_000;
                self.boss.phase = 2;
                return;
            }
            self.boss.hp = self.boss.hp.saturating_sub(damage);
        } else {
            self.boss.hp = self.boss.hp.saturating_sub(damage);
            if self.boss.hp == 0 {
                self.phase = CoopPhase::Won;
            }
        }
    }

    fn refill(&mut self) {
        let mut next = self.board;
        for column in 0..SIDE {
            let mut write = SIDE - 1;
            for row in (0..SIDE).rev() {
                let index = row * SIDE + column;
                if self.board[index].multiplier != 0 {
                    next[write * SIDE + column] = self.board[index];
                    write = write.saturating_sub(1);
                }
            }
            for row in 0..=write {
                let tile = self.tile(false);
                next[row * SIDE + column] = tile;
            }
        }
        self.board = next;
        self.cascade_index = self.cascade_index.saturating_add(1);
        if !self.has_legal_swap() {
            self.fill_board();
        }
    }

    fn next_alive(&self, start: usize) -> Option<usize> {
        (0..SEATS)
            .map(|offset| (start + offset) % SEATS)
            .find(|index| self.participants[*index].alive)
    }

    fn advance_seat(&mut self) {
        let current = self.active_seat;
        if let Some(next) = (1..=SEATS)
            .map(|offset| (current + offset) % SEATS)
            .find(|index| self.participants[*index].alive)
        {
            if next <= current {
                self.round_index = self.round_index.saturating_add(1);
                self.boss_turn();
            }
            self.active_seat = next;
        } else {
            self.phase = CoopPhase::Lost;
        }
        if self.phase == CoopPhase::Playing && self.round_index > MAX_ROUNDS {
            self.phase = CoopPhase::Lost;
        }
    }

    fn boss_turn(&mut self) {
        let phase_multiplier = if self.boss.phase == 2 { 3 } else { 1 };
        let attack = 8u32
            .saturating_mul(phase_multiplier)
            .saturating_add(self.round_index);
        for participant in &mut self.participants {
            if !participant.alive {
                continue;
            }
            let damage = attack.saturating_sub(participant.defense / 4).max(1);
            participant.hp = participant.hp.saturating_sub(damage);
            if participant.hp == 0 {
                participant.alive = false;
            }
        }
        if self
            .participants
            .iter()
            .all(|participant| !participant.alive)
        {
            self.phase = CoopPhase::Lost;
        }
    }

    pub fn state_hash(&self) -> u64 {
        let mut hash = 0xcbf29ce484222325u64;
        for participant in &self.participants {
            for byte in participant
                .account
                .as_bytes()
                .iter()
                .chain(participant.pet_id.as_bytes())
            {
                hash ^= u64::from(*byte);
                hash = hash.wrapping_mul(0x100000001b3);
            }
            hash ^= u64::from(participant.hp);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash ^= u64::from(self.boss.hp);
        hash = hash.wrapping_mul(0x100000001b3);
        hash ^= u64::from(self.boss.phase);
        hash = hash.wrapping_mul(0x100000001b3);
        hash ^= u64::from(self.round_index);
        hash = hash.wrapping_mul(0x100000001b3);
        for tile in self.board {
            hash ^= u64::from(tile.element as u8);
            hash ^= u64::from(tile.multiplier);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash ^= self.seed;
        hash = hash.wrapping_mul(0x100000001b3);
        hash
    }
}

fn adjacent(first: usize, second: usize) -> bool {
    let (r1, c1) = (first / SIDE, first % SIDE);
    let (r2, c2) = (second / SIDE, second % SIDE);
    (r1 == r2 && c1.abs_diff(c2) == 1) || (c1 == c2 && r1.abs_diff(r2) == 1)
}

fn matched_cells(board: &[Tile; CELLS]) -> Vec<bool> {
    let mut matched = vec![false; CELLS];
    for row in 0..SIDE {
        for column in 0..SIDE {
            let index = row * SIDE + column;
            let tile = board[index];
            if column + 2 < SIDE && board[index + 1] == tile && board[index + 2] == tile {
                matched[index] = true;
                matched[index + 1] = true;
                matched[index + 2] = true;
            }
            if row + 2 < SIDE && board[index + SIDE] == tile && board[index + 2 * SIDE] == tile {
                matched[index] = true;
                matched[index + SIDE] = true;
                matched[index + 2 * SIDE] = true;
            }
        }
    }
    matched
}

fn element_of(pet_id: &str) -> Element {
    match pet_id {
        id if id.contains("water") => Element::Water,
        id if id.contains("electric") => Element::Electric,
        id if id.contains("ghost") => Element::Ghost,
        id if id.contains("ground") => Element::Ground,
        id if id.contains("light") => Element::Light,
        _ => Element::Fire,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn party() -> [Participant; SEATS] {
        [
            Participant::new("a", "fire-coalwhisk", Element::Fire, 1),
            Participant::new("b", "water-dewskip", Element::Water, 1),
            Participant::new("c", "ground-clodkin", Element::Ground, 1),
            Participant::new("d", "light-aurelune", Element::Light, 1),
        ]
    }

    #[test]
    fn four_seats_rotate_turns_and_rounds() {
        let mut state = CoopState::new(7, party(), 10_000);
        state.apply(CoopAction::Start).unwrap();
        assert_eq!(state.active_seat, 0);
        let swap = state.legal_swap().expect("board");
        state
            .apply(CoopAction::Swap {
                first: swap.0,
                second: swap.1,
            })
            .unwrap();
        assert_eq!(state.turn_index, 2);
        assert_eq!(state.active_seat, 1);
        assert_eq!(state.round_index, 1);
    }

    #[test]
    fn multiplier_schedule_is_versioned() {
        assert_eq!(multiplier_tier(1), 1);
        assert_eq!(multiplier_tier(12), 2);
        assert_eq!(multiplier_tier(17), 3);
        assert_eq!(multiplier_tier(27), 5);
        assert_eq!(multiplier_tier(32), 6);
    }

    #[test]
    fn boss_phase_transition_is_exact_once_and_discards_excess() {
        let mut state = CoopState::new(9, party(), 10_000);
        state.boss.hp = 2_600;
        state.damage_boss(9_999);
        assert_eq!(state.boss.phase, 2);
        assert_eq!(state.boss.max_hp, 17_500);
        assert_eq!(state.boss.hp, 14_000);
        state.damage_boss(1_000);
        assert_eq!(state.boss.phase, 2);
        assert_eq!(state.boss.hp, 13_000);
    }

    #[test]
    fn ground_has_high_hp_low_crit_and_high_crit_damage() {
        let ground = Participant::new("g", "ground-clodkin", Element::Ground, 1);
        let fire = Participant::new("f", "fire-coalwhisk", Element::Fire, 1);
        assert!(ground.max_hp > fire.max_hp);
        assert!(ground.defense > fire.defense);
        assert!(ground.crit_rate_bp < fire.crit_rate_bp);
        assert!(ground.crit_damage_bp > fire.crit_damage_bp);
    }

    #[test]
    fn deterministic_replay_matches() {
        let run = || {
            let mut state = CoopState::new(11, party(), 10_000);
            state.apply(CoopAction::Start).unwrap();
            for _ in 0..10 {
                if state.phase != CoopPhase::Playing {
                    break;
                }
                let swap = state.legal_swap().expect("board");
                state
                    .apply(CoopAction::Swap {
                        first: swap.0,
                        second: swap.1,
                    })
                    .unwrap();
            }
            state.state_hash()
        };
        assert_eq!(run(), run());
    }
}
