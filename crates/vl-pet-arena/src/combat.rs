use vl_game_core::{
    Canonical, Decision, Error, Fixed, LogicalClock, ProjectionIntent, Reducer, Ruleset, TurnRng,
    Value, canonical, canonical::list,
};

use crate::{
    board::{Board, CELLS, training_board},
    content::{self, BOARD_SIDE, Element, MAX_CASCADES, MAX_TURNS, PETS, STAGES, Skill},
    status::{Kind, Status, shielded_hit},
    telegraph::{Pattern, Telegraph},
};

const ZERO: Fixed = Fixed::from_raw(0);
const RULES: &str = "pet-combat-v1;fill-no-runs;128-fill-attempts;16-cascades-then-regenerate;combo-pass-multiplier;own-third-other-sixth;dead-board-regenerate;input-enemy-poison-expire;row-hit;column-shield-hit;cross-double-hit-poison;cleared-warning-mitigation;slow-consumed-one-skip;skill-cooldown3;death-before-win;turn60-loss;no-rewards";

pub fn rules_hash() -> [u8; 32] {
    canonical::hash(
        "vl.pet-combat.v1",
        &list([
            Value::Bytes(content::CONTENT_HASH.to_vec()),
            Value::Text(RULES.into()),
        ]),
    )
    .expect("bounded static rules")
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Phase {
    Ready,
    Playing,
    Won,
    Lost,
}

/// Only intents cross the authority boundary; there is no damage or RNG input.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Action {
    Start,
    Swap { first: u8, second: u8 },
    Skill,
    Pass,
}

impl Canonical for Action {
    fn canonical(&self) -> Value {
        match self {
            Self::Start => list([Value::Uint(0)]),
            Self::Swap { first, second } => list([
                Value::Uint(1),
                Value::Uint((*first).into()),
                Value::Uint((*second).into()),
            ]),
            Self::Skill => list([Value::Uint(2)]),
            Self::Pass => list([Value::Uint(3)]),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub(crate) pet: u8,
    pub(crate) stage: u8,
    pub(crate) phase: Phase,
    pub(crate) turn: u16,
    pub(crate) board: Board,
    pub(crate) health: Fixed,
    pub(crate) shield: Fixed,
    pub(crate) enemy_health: Fixed,
    pub(crate) enemy_shield: Fixed,
    pub(crate) cooldown: u8,
    pub(crate) player_status: Vec<Status>,
    pub(crate) enemy_status: Vec<Status>,
    pub(crate) telegraph: Option<Telegraph>,
}

impl State {
    pub fn new(pet: u8, stage: u8) -> Result<Self, Error> {
        let pet_def = PETS.get(usize::from(pet)).ok_or(Error::InvalidState)?;
        let stage_def = STAGES.get(usize::from(stage)).ok_or(Error::InvalidState)?;
        Ok(Self {
            pet,
            stage,
            phase: Phase::Ready,
            turn: 0,
            board: training_board(),
            health: pet_def.health,
            shield: ZERO,
            enemy_health: stage_def.enemy_health,
            enemy_shield: ZERO,
            cooldown: 0,
            player_status: vec![],
            enemy_status: vec![],
            telegraph: None,
        })
    }
    pub fn pet(&self) -> u8 {
        self.pet
    }
    pub fn stage(&self) -> u8 {
        self.stage
    }
    pub fn phase(&self) -> Phase {
        self.phase
    }
    pub fn turn(&self) -> u16 {
        self.turn
    }
    pub fn board(&self) -> &Board {
        &self.board
    }
    pub fn health(&self) -> Fixed {
        self.health
    }
    pub fn enemy_health(&self) -> Fixed {
        self.enemy_health
    }
    pub fn cooldown(&self) -> u8 {
        self.cooldown
    }
    pub fn shield(&self) -> Fixed {
        self.shield
    }
    pub fn enemy_shield(&self) -> Fixed {
        self.enemy_shield
    }
    pub fn player_status(&self) -> &[Status] {
        &self.player_status
    }
    pub fn enemy_status(&self) -> &[Status] {
        &self.enemy_status
    }
    pub fn telegraph(&self) -> Option<&Telegraph> {
        self.telegraph.as_ref()
    }
    pub fn hash(&self) -> Result<[u8; 32], Error> {
        canonical::hash("vl.pet-state.v1", &self.canonical())
    }
}

fn status_value(statuses: &[Status]) -> Value {
    list(statuses.iter().map(|status| {
        list([
            Value::Uint(status.kind as u64),
            status.potency.canonical(),
            Value::Uint(status.remaining_turns.into()),
        ])
    }))
}
impl Canonical for State {
    fn canonical(&self) -> Value {
        list([
            Value::Bytes(rules_hash().to_vec()),
            Value::Uint(self.pet.into()),
            Value::Uint(self.stage.into()),
            Value::Uint(self.phase as u64),
            Value::Uint(self.turn.into()),
            Value::Bytes(self.board.0.iter().map(|element| *element as u8).collect()),
            self.health.canonical(),
            self.shield.canonical(),
            self.enemy_health.canonical(),
            self.enemy_shield.canonical(),
            Value::Uint(self.cooldown.into()),
            status_value(&self.player_status),
            status_value(&self.enemy_status),
            list(self.telegraph.iter().map(|intent| {
                list([
                    Value::Uint(intent.stage.into()),
                    Value::Uint(intent.announced_turn.into()),
                    Value::Uint(intent.resolves_turn.into()),
                    Value::Uint(intent.pattern as u64),
                    Value::Uint(intent.target.into()),
                    Value::Bytes(intent.cells.clone()),
                ])
            })),
        ])
    }
}

pub struct Combat;
impl Reducer for Combat {
    type State = State;
    type Action = Action;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: "pet-arena-pve".into(),
            version: 1,
            content_hash: rules_hash(),
            rng_version: vl_game_core::RNG_VERSION,
        }
    }
    fn validate(&self, state: &State) -> Result<(), Error> {
        content::content_hash().map_err(|_| Error::ContentMismatch)?;
        let initial = State::new(state.pet, state.stage)?;
        if state.phase == Phase::Ready {
            return if *state == initial {
                Ok(())
            } else {
                Err(Error::InvalidState)
            };
        }
        if state.turn > MAX_TURNS
            || state.cooldown > PETS[usize::from(state.pet)].cooldown_turns
            || state.health < ZERO
            || state.health > initial.health
            || state.enemy_health < ZERO
            || state.enemy_health > initial.enemy_health
            || state.shield < ZERO
            || state.shield > Fixed::from_raw(100_000)
            || state.enemy_shield < ZERO
            || state.enemy_shield > STAGES[usize::from(state.stage)].enemy_attack
            || state.board.matches().into_iter().any(|cell| cell)
            || legal_swap(&state.board).is_none()
        {
            return Err(Error::InvalidState);
        }
        for (side, statuses) in [&state.player_status, &state.enemy_status]
            .into_iter()
            .enumerate()
        {
            if statuses.len() > 3 {
                return Err(Error::InvalidState);
            }
            for (index, status) in statuses.iter().enumerate() {
                status.validate().map_err(|_| Error::InvalidState)?;
                if side == 0 && status.kind == Kind::Slow
                    || side == 1 && status.kind == Kind::Empower
                {
                    return Err(Error::InvalidState);
                }
                if statuses[..index]
                    .iter()
                    .any(|prior| prior.kind == status.kind)
                {
                    return Err(Error::InvalidState);
                }
            }
            if statuses
                .windows(2)
                .any(|pair| pair[0].kind as u8 >= pair[1].kind as u8)
            {
                return Err(Error::InvalidState);
            }
        }
        match state.phase {
            Phase::Playing
                if state.health > ZERO && state.enemy_health > ZERO && state.turn < MAX_TURNS =>
            {
                state
                    .telegraph
                    .as_ref()
                    .ok_or(Error::InvalidState)?
                    .validate_for_resolution(state.stage, state.turn + 1)
                    .map_err(|_| Error::InvalidState)
            }
            Phase::Won
                if state.health > ZERO
                    && state.enemy_health == ZERO
                    && state.telegraph.is_none() =>
            {
                Ok(())
            }
            Phase::Lost
                if (state.health == ZERO
                    || state.turn == MAX_TURNS && state.enemy_health > ZERO)
                    && state.telegraph.is_none() =>
            {
                Ok(())
            }
            _ => Err(Error::InvalidState),
        }
    }
    fn reduce(
        &self,
        state: &State,
        action: &Action,
        _: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<State>, Error> {
        self.validate(state)?;
        let mut next = state.clone();
        if *action == Action::Start {
            if state.phase != Phase::Ready {
                return Err(Error::InvalidAction);
            }
            next.board = generate(rng)?;
            next.phase = Phase::Playing;
            next.telegraph =
                Some(Telegraph::draw(next.stage, 0, rng).map_err(|_| Error::InvalidState)?);
            return Ok(decision(next, 0, 0, false));
        }
        if state.phase != Phase::Playing {
            return Err(Error::InvalidAction);
        }
        let mut cleared = [false; CELLS];
        let mut cascades = 0;
        let mut capped = false;
        next.turn += 1;
        next.cooldown = next.cooldown.saturating_sub(1);
        match action {
            Action::Start => unreachable!(),
            Action::Swap { first, second } => {
                next.board = state
                    .board
                    .swap(usize::from(*first), usize::from(*second))
                    .map_err(|_| Error::InvalidAction)?;
                (cascades, capped) = cascade(&mut next, &mut cleared, rng)?;
            }
            Action::Skill => {
                if state.cooldown != 0 {
                    return Err(Error::InvalidAction);
                }
                skill(&mut next)?;
                next.cooldown = PETS[usize::from(next.pet)].cooldown_turns;
            }
            Action::Pass => {}
        }
        if next.enemy_health > ZERO {
            enemy_action(&mut next, &cleared)?;
        }
        tick(&mut next.health, &mut next.shield, &mut next.player_status)?;
        tick(
            &mut next.enemy_health,
            &mut next.enemy_shield,
            &mut next.enemy_status,
        )?;
        next.phase = if next.health == ZERO {
            Phase::Lost
        } else if next.enemy_health == ZERO {
            Phase::Won
        } else if next.turn == MAX_TURNS {
            Phase::Lost
        } else {
            Phase::Playing
        };
        next.telegraph = if next.phase == Phase::Playing {
            Some(Telegraph::draw(next.stage, next.turn, rng).map_err(|_| Error::InvalidState)?)
        } else {
            None
        };
        Ok(decision(
            next,
            cleared.into_iter().filter(|cell| *cell).count(),
            cascades,
            capped,
        ))
    }
}

fn decision(state: State, cleared: usize, cascades: u8, capped: bool) -> Decision<State> {
    let event = list([
        Value::Text("pet-turn".into()),
        Value::Uint(state.turn.into()),
        Value::Uint(state.phase as u64),
        Value::Uint(cleared as u64),
        Value::Uint(cascades.into()),
        Value::Bool(capped),
    ]);
    Decision {
        state,
        events: vec![event],
        projections: vec![ProjectionIntent::PublicChanged],
        settlement: None,
    }
}

pub fn legal_swap(board: &Board) -> Option<(u8, u8)> {
    for first in 0..CELLS {
        for second in [first + 1, first + BOARD_SIDE] {
            if board.swap(first, second).is_ok() {
                return Some((first as u8, second as u8));
            }
        }
    }
    None
}

fn element(index: u32) -> Element {
    [
        Element::Ember,
        Element::Tide,
        Element::Grove,
        Element::Spark,
    ][index as usize]
}

fn generate(rng: &mut TurnRng) -> Result<Board, Error> {
    for _ in 0..128 {
        let mut board = training_board();
        for at in 0..CELLS {
            let allowed: Vec<_> = (0..4)
                .map(element)
                .filter(|tile| {
                    !(at % BOARD_SIDE >= 2 && board.0[at - 1] == *tile && board.0[at - 2] == *tile
                        || at >= 2 * BOARD_SIDE
                            && board.0[at - BOARD_SIDE] == *tile
                            && board.0[at - 2 * BOARD_SIDE] == *tile)
                })
                .collect();
            board.0[at] = allowed[rng.below(allowed.len() as u32)? as usize];
        }
        if legal_swap(&board).is_some() {
            return Ok(board);
        }
    }
    Ok(training_board())
}

fn hit(health: &mut Fixed, shield: &mut Fixed, damage: Fixed) -> Result<(), Error> {
    (*health, *shield) = shielded_hit(*health, *shield, damage).map_err(|_| Error::Arithmetic)?;
    Ok(())
}

fn cascade(
    state: &mut State,
    cleared: &mut [bool; CELLS],
    rng: &mut TurnRng,
) -> Result<(u8, bool), Error> {
    let pet = PETS[usize::from(state.pet)];
    let attack = pet.attack.checked_add(
        state
            .player_status
            .iter()
            .find(|status| status.kind == Kind::Empower)
            .map_or(ZERO, |status| status.potency),
    )?;
    for pass in 1..=MAX_CASCADES {
        let matches = state.board.matches();
        let mut weight = 0;
        for (at, matched) in matches.iter().enumerate() {
            if *matched {
                cleared[at] = true;
                weight += if state.board.0[at] == pet.element {
                    2
                } else {
                    1
                };
            }
        }
        let damage = attack
            .checked_mul(Fixed::from_integer(weight * i64::from(pass))?)?
            .checked_div(Fixed::from_integer(6)?)?;
        hit(&mut state.enemy_health, &mut state.enemy_shield, damage)?;
        for x in 0..BOARD_SIDE {
            let survivors: Vec<_> = (0..BOARD_SIDE)
                .map(|y| y * BOARD_SIDE + x)
                .filter(|at| !matches[*at])
                .map(|at| state.board.0[at])
                .collect();
            let empty = BOARD_SIDE - survivors.len();
            for y in 0..BOARD_SIDE {
                state.board.0[y * BOARD_SIDE + x] = if y < empty {
                    element(rng.below(4)?)
                } else {
                    survivors[y - empty]
                };
            }
        }
        if state.board.matches().into_iter().all(|cell| !cell) {
            if legal_swap(&state.board).is_none() {
                state.board = generate(rng)?;
            }
            return Ok((pass, false));
        }
    }
    state.board = generate(rng)?;
    Ok((MAX_CASCADES, true))
}

fn add_status(statuses: &mut Vec<Status>, kind: Kind, power: Fixed) -> Result<(), Error> {
    let incoming = Status::new(kind, power).map_err(|_| Error::InvalidState)?;
    if let Some(prior) = statuses.iter_mut().find(|status| status.kind == kind) {
        *prior = prior.refresh(incoming).map_err(|_| Error::InvalidState)?;
    } else {
        statuses.push(incoming);
    }
    // Canonical order is independent of application order.
    statuses.sort_by_key(|status| status.kind as u8);
    Ok(())
}

fn skill(state: &mut State) -> Result<(), Error> {
    let pet = PETS[usize::from(state.pet)];
    match pet.skill {
        Skill::Strike => hit(&mut state.enemy_health, &mut state.enemy_shield, pet.power)?,
        Skill::Guard => state.shield = state.shield.max(pet.power),
        Skill::Mend => state.health = state.health.checked_add(pet.power)?.min(pet.health),
        Skill::Poison => add_status(&mut state.enemy_status, Kind::Poison, pet.power)?,
        Skill::Cleanse => state
            .player_status
            .retain(|status| status.kind == Kind::Empower),
        Skill::Empower => add_status(&mut state.player_status, Kind::Empower, pet.power)?,
        Skill::BreakGuard => {
            state.enemy_shield = ZERO;
            hit(&mut state.enemy_health, &mut state.enemy_shield, pet.power)?;
        }
        Skill::Slow => add_status(&mut state.enemy_status, Kind::Slow, pet.power)?,
    }
    Ok(())
}

fn enemy_action(state: &mut State, cleared: &[bool; CELLS]) -> Result<(), Error> {
    let intent = state.telegraph.as_ref().ok_or(Error::InvalidState)?;
    intent
        .validate_for_resolution(state.stage, state.turn)
        .map_err(|_| Error::InvalidState)?;
    if state
        .enemy_status
        .iter()
        .any(|status| status.kind == Kind::Slow)
    {
        state
            .enemy_status
            .retain(|status| status.kind != Kind::Slow);
        return Ok(());
    }
    let attack = STAGES[usize::from(state.stage)].enemy_attack;
    let exposed = intent
        .cells
        .iter()
        .filter(|at| !cleared[usize::from(**at)])
        .count();
    let damage = attack
        .checked_mul(Fixed::from_integer(exposed as i64)?)?
        .checked_div(Fixed::from_integer(intent.cells.len() as i64)?)?;
    match intent.pattern {
        Pattern::Row => hit(&mut state.health, &mut state.shield, damage)?,
        Pattern::Column => {
            state.enemy_shield = attack;
            hit(&mut state.health, &mut state.shield, damage)?;
        }
        Pattern::Cross => {
            hit(
                &mut state.health,
                &mut state.shield,
                damage.checked_mul(Fixed::from_integer(2)?)?,
            )?;
            if exposed > 0 {
                add_status(
                    &mut state.player_status,
                    Kind::Poison,
                    attack.checked_div(Fixed::from_integer(3)?)?,
                )?;
            }
        }
    }
    Ok(())
}

fn tick(health: &mut Fixed, shield: &mut Fixed, statuses: &mut Vec<Status>) -> Result<(), Error> {
    let mut remaining = Vec::new();
    for status in statuses.iter() {
        if status.kind == Kind::Poison {
            hit(health, shield, status.potency)?;
        }
        if let Some(active) = status.expire().map_err(|_| Error::InvalidState)? {
            remaining.push(active);
        }
    }
    *statuses = remaining;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn points(raw: i64) -> Fixed {
        Fixed::from_raw(raw * 1000)
    }
    fn playing(pet: u8) -> State {
        let mut state = State::new(pet, 0).unwrap();
        state.phase = Phase::Playing;
        state.telegraph = Some(Telegraph::announce(0, 0, 0).unwrap());
        state
    }
    #[test]
    fn eight_skills_apply_authoritative_effects_and_bounded_statuses() {
        let mut strike = playing(0);
        skill(&mut strike).unwrap();
        assert_eq!(strike.enemy_health, points(50));
        let mut mend = playing(1);
        mend.health = points(110);
        skill(&mut mend).unwrap();
        assert_eq!(mend.health, points(120));
        let mut poison = playing(2);
        skill(&mut poison).unwrap();
        skill(&mut poison).unwrap();
        assert_eq!(poison.enemy_status.len(), 1);
        for expected in [74, 68, 62] {
            tick(
                &mut poison.enemy_health,
                &mut poison.enemy_shield,
                &mut poison.enemy_status,
            )
            .unwrap();
            assert_eq!(poison.enemy_health, points(expected));
        }
        assert!(poison.enemy_status.is_empty());
        let mut empower = playing(3);
        skill(&mut empower).unwrap();
        assert_eq!(empower.player_status[0].kind, Kind::Empower);
        assert_eq!(empower.player_status[0].potency, points(5));
        let mut guard = playing(4);
        skill(&mut guard).unwrap();
        skill(&mut guard).unwrap();
        assert_eq!(guard.shield, points(20));
        let mut slow = playing(5);
        skill(&mut slow).unwrap();
        slow.turn = 1;
        enemy_action(&mut slow, &[false; CELLS]).unwrap();
        assert_eq!(slow.health, points(100));
        assert!(slow.enemy_status.is_empty());
        slow.telegraph = Some(Telegraph::announce(0, 1, 0).unwrap());
        slow.turn = 2;
        enemy_action(&mut slow, &[false; CELLS]).unwrap();
        assert_eq!(slow.health, points(94));
        let mut cleanse = playing(6);
        add_status(&mut cleanse.player_status, Kind::Poison, points(6)).unwrap();
        skill(&mut cleanse).unwrap();
        assert!(cleanse.player_status.is_empty());
        let mut breaker = playing(7);
        breaker.enemy_shield = points(6);
        skill(&mut breaker).unwrap();
        assert_eq!(breaker.enemy_shield, ZERO);
        assert_eq!(breaker.enemy_health, points(55));
    }

    #[test]
    fn enemy_resolves_committed_patterns_with_shields_and_cleared_cell_mitigation() {
        let mut state = playing(0);
        state.turn = 1;
        let health = state.health;
        enemy_action(&mut state, &[true; CELLS]).unwrap();
        assert_eq!(state.health, health);
        enemy_action(&mut state, &[false; CELLS]).unwrap();
        assert_eq!(state.health, points(94));
        state.stage = 1;
        state.telegraph = Some(Telegraph::announce(1, 0, 0).unwrap());
        enemy_action(&mut state, &[false; CELLS]).unwrap();
        assert_eq!(state.health, points(86));
        assert_eq!(state.enemy_shield, points(8));
        state.stage = 5;
        state.turn = 3;
        state.telegraph = Some(Telegraph::announce(5, 2, 0).unwrap());
        enemy_action(&mut state, &[false; CELLS]).unwrap();
        assert_eq!(state.health, points(50));
        assert_eq!(state.player_status[0].potency, points(6));
        tick(
            &mut state.health,
            &mut state.shield,
            &mut state.player_status,
        )
        .unwrap();
        assert_eq!(state.health, points(44));
        assert_eq!(state.player_status[0].remaining_turns, 2);
        state.telegraph.as_mut().unwrap().cells.pop();
        assert!(enemy_action(&mut state, &[false; CELLS]).is_err());
    }

    #[test]
    fn stable_dead_boards_and_noncanonical_status_order_are_rejected_on_restore() {
        let mut state = playing(0);
        for at in 0..CELLS {
            state.board.0[at] = element(((at / BOARD_SIDE + at % BOARD_SIDE) % 4) as u32);
        }
        assert!(state.board.matches().into_iter().all(|cell| !cell));
        assert_eq!(legal_swap(&state.board), None);
        assert_eq!(Combat.validate(&state), Err(Error::InvalidState));
        let mut state = playing(0);
        add_status(&mut state.player_status, Kind::Poison, points(6)).unwrap();
        add_status(&mut state.player_status, Kind::Empower, points(5)).unwrap();
        Combat.validate(&state).unwrap();
        state.player_status.reverse();
        assert_eq!(Combat.validate(&state), Err(Error::InvalidState));
    }
}
