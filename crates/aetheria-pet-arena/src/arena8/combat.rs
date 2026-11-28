use aetheria_game_core::{
    Decision, Error as CoreError, LogicalClock, ProjectionIntent, RNG_VERSION, Reducer, Ruleset,
};

use super::board::{self, Generation};
use super::events::CombatEvent;
use super::model::{
    Ability, Action, ENCOUNTERS, EncounterCombat, EnemyIntent, PETS, PetCombat, Phase,
    RecoveryReason, SignatureKind, State,
};
use super::{
    ASSAULT_POWER, BOARD_DAMAGE_DIVISOR, CELLS, COOLDOWN_TURNS, ENEMY_SHIELD_CAP, ENRAGE_BONUS,
    FIRE_ZONE_POWER, FIRE_ZONE_TICK_POWER, FIRE_ZONE_TICKS, GUARD_ATTACK_POWER, HEAVY_POWER,
    MANA_CAP, MANA_OWN_BONUS, MANA_PER_TILE, MAX_CASCADES, MAX_TURNS, RAGE_CAP, RAGE_PER_GUARD,
    RAGE_PER_HIT, RAGE_PER_TILE, RULESET_ID, RULESET_VERSION, SIGNATURE_MANA, SIGNATURE_POWER,
    SIGNATURE_RAGE, SKILL_MANA, SKILL_POWER, ULTIMATE_MANA, ULTIMATE_POWER, ULTIMATE_RAGE,
    pinned_rules_hash,
};

/// New versioned reducer. It is intentionally separate from \`combat::Combat\`
/// (V1) and from \`wave1_mvp\` (frozen action replay).
pub struct Arena8;

impl Reducer for Arena8 {
    type State = State;
    type Action = Action;

    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: RULESET_ID.into(),
            version: RULESET_VERSION,
            content_hash: pinned_rules_hash(),
            rng_version: RNG_VERSION,
        }
    }

    fn validate(&self, state: &State) -> Result<(), CoreError> {
        super::rules_hash()?;
        validate_state(state)
    }

    fn reduce(
        &self,
        state: &State,
        action: &Action,
        _clock: LogicalClock,
        rng: &mut aetheria_game_core::TurnRng,
    ) -> Result<Decision<State>, CoreError> {
        self.validate(state)?;
        let pet = PETS[usize::from(state.pet)].combat();
        let encounter = ENCOUNTERS[usize::from(state.encounter)].combat();
        reduce_with(state, action, rng, &pet, &encounter)
    }
}

/// The single combat implementation. The frozen v1 reducer and the data-bound
/// reducer both call this; only the resolved \`PetCombat\`/\`EncounterCombat\`
/// values differ. It never reads a client-supplied result.
pub(super) fn reduce_with(
    state: &State,
    action: &Action,
    rng: &mut impl super::Random,
    pet: &PetCombat,
    encounter: &EncounterCombat,
) -> Result<Decision<State>, CoreError> {
    let mut next = state.clone();
    let mut events = Vec::new();
    if let Action::Start = action {
        if state.phase != Phase::Ready {
            return Err(CoreError::InvalidAction);
        }
        let generation = board::generate_board(rng)?;
        next.board = generation.board;
        next.phase = Phase::Playing;
        events.push(CombatEvent::BoardInitialized {
            cells: next.board.cells().to_vec(),
            attempts: generation.attempts,
            fallback: generation.fallback,
        });
        let intent = EnemyIntent::announce(encounter.boss, 0, rng)?;
        next.intent = Some(intent.clone());
        events.push(CombatEvent::EnemyIntentAnnounced { intent });
        return Ok(decision(next, events));
    }
    if state.phase != Phase::Playing {
        return Err(CoreError::InvalidAction);
    }
    next.turn = state.turn.checked_add(1).ok_or(CoreError::InvalidState)?;
    next.cooldown = state.cooldown.saturating_sub(1);
    let mut cleared = [false; CELLS];
    let mut guarding = false;
    match action {
        Action::Start => unreachable!("handled above"),
        Action::Swap { first, second } => {
            next.board = state
                .board
                .try_swap(*first, *second)
                .ok_or(CoreError::InvalidAction)?;
            events.push(CombatEvent::Swap {
                first: *first,
                second: *second,
            });
            cleared = resolve_board_with(&mut next, pet, encounter, rng, &mut events)?;
        }
        Action::Skill => {
            use_ability_with(&mut next, Ability::SharedSkill, pet, encounter, &mut events)?;
        }
        Action::Signature => {
            use_ability_with(&mut next, Ability::Signature, pet, encounter, &mut events)?;
        }
        Action::FireZone => {
            use_ability_with(&mut next, Ability::FireZone, pet, encounter, &mut events)?;
        }
        Action::Ultimate => {
            use_ability_with(&mut next, Ability::Ultimate, pet, encounter, &mut events)?;
        }
        Action::Guard => {
            guarding = true;
            use_ability_with(&mut next, Ability::Guard, pet, encounter, &mut events)?;
        }
    }
    if next.enemy_health > 0 {
        let intent = next.intent.clone().ok_or(CoreError::InvalidState)?;
        intent.validate(encounter.boss, state.turn)?;
        resolve_enemy_with(
            &mut next,
            &intent,
            &cleared,
            guarding,
            pet,
            encounter,
            &mut events,
        )?;
    }
    if state.fire_zone_turns > 0 && next.enemy_health > 0 {
        tick_fire_zone_with(&mut next, pet, encounter, &mut events)?;
    }
    if let Action::FireZone = action {
        next.fire_zone_turns = if next.enemy_health > 0 {
            FIRE_ZONE_TICKS
        } else {
            0
        };
    }
    next.phase = if next.health == 0 {
        Phase::Lost
    } else if next.enemy_health == 0 {
        Phase::Won
    } else if next.turn == MAX_TURNS {
        Phase::Lost
    } else {
        Phase::Playing
    };
    events.push(CombatEvent::TurnEnded { turn: next.turn });
    if next.phase == Phase::Playing {
        let intent = EnemyIntent::announce(encounter.boss, next.turn, rng)?;
        next.intent = Some(intent.clone());
        events.push(CombatEvent::EnemyIntentAnnounced { intent });
    } else {
        next.intent = None;
        events.push(CombatEvent::MatchEnded {
            phase: next.phase,
            turn: next.turn,
        });
    }
    Ok(decision(next, events))
}

fn decision(state: State, events: Vec<CombatEvent>) -> Decision<State> {
    Decision {
        state,
        events: events.iter().map(CombatEvent::canonical).collect(),
        projections: vec![ProjectionIntent::PublicChanged],
        settlement: None,
    }
}

/// Frozen v1 validation: the pet and encounter come from the authored tables.
pub(super) fn validate_state(state: &State) -> Result<(), CoreError> {
    let pet = PETS
        .get(usize::from(state.pet))
        .ok_or(CoreError::InvalidState)?
        .combat();
    let encounter = ENCOUNTERS
        .get(usize::from(state.encounter))
        .ok_or(CoreError::InvalidState)?
        .combat();
    validate_state_with(state, &pet, &encounter)
}

pub(super) fn validate_state_with(
    state: &State,
    pet: &PetCombat,
    encounter: &EncounterCombat,
) -> Result<(), CoreError> {
    if state.phase == Phase::Ready {
        return if *state == State::allocate(state.pet, state.encounter, pet.health)? {
            Ok(())
        } else {
            Err(CoreError::InvalidState)
        };
    }
    if state.turn > MAX_TURNS
        || state.health > pet.health
        || state.enemy_health > encounter.health
        || state.enemy_shield > ENEMY_SHIELD_CAP
        || state.mana > MANA_CAP
        || state.rage > RAGE_CAP
        || state.cooldown > COOLDOWN_TURNS
        || state.fire_zone_turns > FIRE_ZONE_TICKS
        || state.board.has_matches()
        || state.board.legal_move().is_none()
    {
        return Err(CoreError::InvalidState);
    }
    match state.phase {
        Phase::Playing => {
            if state.health == 0 || state.enemy_health == 0 || state.turn >= MAX_TURNS {
                return Err(CoreError::InvalidState);
            }
            state
                .intent
                .as_ref()
                .ok_or(CoreError::InvalidState)?
                .validate(encounter.boss, state.turn)?;
        }
        Phase::Won => {
            if state.health == 0 || state.enemy_health != 0 || state.intent.is_some() {
                return Err(CoreError::InvalidState);
            }
        }
        Phase::Lost => {
            if state.intent.is_some()
                || !(state.health == 0 || state.turn == MAX_TURNS && state.enemy_health > 0)
            {
                return Err(CoreError::InvalidState);
            }
        }
        Phase::Ready => return Err(CoreError::InvalidState),
    }
    Ok(())
}

pub(super) fn gain_mana(state: &mut State, amount: u16) -> u16 {
    let added = amount.min(MANA_CAP.saturating_sub(state.mana));
    state.mana += added;
    added
}

pub(super) fn gain_rage(state: &mut State, amount: u16) -> u16 {
    let added = amount.min(RAGE_CAP.saturating_sub(state.rage));
    state.rage += added;
    added
}

pub(super) fn apply_damage(health: &mut u32, shield: &mut u32, damage: u32) {
    let absorbed = (*shield).min(damage);
    *shield -= absorbed;
    *health = health.saturating_sub(damage - absorbed);
}

/// Deterministic damage formula including defense and element effectiveness.
pub(super) fn scaled_damage(attack: u32, power: u32, multiplier: u16, defense: u32) -> u32 {
    if multiplier == 0 {
        return 0;
    }
    let numerator = u64::from(attack) * u64::from(power) * u64::from(multiplier) * 100;
    let denominator = 1_000_000_u64 * u64::from(100 + defense);
    let damage = (numerator / denominator).max(1);
    u32::try_from(damage).unwrap_or(u32::MAX)
}

/// Board attack damage. Own-element cells weigh two, other cells one; later
/// cascade passes multiply the result.
pub(super) fn board_damage(
    attack: u32,
    weight: u32,
    pass: u8,
    multiplier: u16,
    defense: u32,
) -> u32 {
    if multiplier == 0 || weight == 0 {
        return 0;
    }
    let numerator =
        u64::from(attack) * u64::from(weight) * u64::from(pass) * u64::from(multiplier) * 100;
    let denominator = u64::from(BOARD_DAMAGE_DIVISOR) * 1000 * u64::from(100 + defense);
    let damage = (numerator / denominator).max(1);
    u32::try_from(damage).unwrap_or(u32::MAX)
}

/// Frozen v1 entrypoint used by the v1 tests; the bound reducer calls the
/// explicit-profile variant below.
#[cfg(test)]
pub(super) fn resolve_board(
    state: &mut State,
    rng: &mut impl super::Random,
    events: &mut Vec<CombatEvent>,
) -> Result<[bool; CELLS], CoreError> {
    let pet = PETS[usize::from(state.pet)].combat();
    let encounter = ENCOUNTERS[usize::from(state.encounter)].combat();
    resolve_board_with(state, &pet, &encounter, rng, events)
}

/// Resolves all matches created by a swap, including gravity/refill cascades.
/// Returns the union of cleared cells for enemy lane mitigation.
pub(super) fn resolve_board_with(
    state: &mut State,
    pet: &PetCombat,
    encounter: &EncounterCombat,
    rng: &mut impl super::Random,
    events: &mut Vec<CombatEvent>,
) -> Result<[bool; CELLS], CoreError> {
    let multiplier = pet.element.multiplier_against(encounter.element);
    let mut cleared = [false; CELLS];
    for pass in 1..=MAX_CASCADES {
        let matches = state.board.matches();
        if !matches.into_iter().any(|matched| matched) {
            if state.board.legal_move().is_none() {
                let generation = board::generate_board(rng)?;
                state.board = generation.board;
                events.push(CombatEvent::BoardRecovered {
                    reason: RecoveryReason::DeadBoard,
                    attempts: generation.attempts,
                });
            }
            return Ok(cleared);
        }
        let mut cells = Vec::new();
        let mut weight = 0_u32;
        let mut mana = 0_u16;
        let mut rage = 0_u16;
        for (at, matched) in matches.iter().enumerate() {
            if *matched {
                let element = state.board.cells()[at];
                cells.push(at as u8);
                cleared[at] = true;
                weight += if element == pet.element { 2 } else { 1 };
                mana += MANA_PER_TILE;
                rage += RAGE_PER_TILE;
                if element == pet.element {
                    mana += MANA_OWN_BONUS;
                }
            }
        }
        let damage = board_damage(pet.attack, weight, pass, multiplier, encounter.defense);
        apply_damage(&mut state.enemy_health, &mut state.enemy_shield, damage);
        let mana_gained = gain_mana(state, mana);
        let rage_gained = gain_rage(state, rage);
        events.push(CombatEvent::TilesCleared {
            pass,
            cells,
            damage,
            mana_gained,
            rage_gained,
            enemy_health: state.enemy_health,
        });
        board::settle_gravity(&mut state.board, &matches, rng)?;
    }
    let Generation {
        board, attempts, ..
    } = board::generate_board(rng)?;
    state.board = board;
    events.push(CombatEvent::CascadeCapped {
        passes: MAX_CASCADES,
    });
    events.push(CombatEvent::BoardRecovered {
        reason: RecoveryReason::CascadeLimit,
        attempts,
    });
    Ok(cleared)
}

#[cfg(test)]
pub(super) fn use_ability(
    state: &mut State,
    ability: Ability,
    events: &mut Vec<CombatEvent>,
) -> Result<(), CoreError> {
    let pet = PETS[usize::from(state.pet)].combat();
    let encounter = ENCOUNTERS[usize::from(state.encounter)].combat();
    use_ability_with(state, ability, &pet, &encounter, events)
}

pub(super) fn use_ability_with(
    state: &mut State,
    ability: Ability,
    pet: &PetCombat,
    encounter: &EncounterCombat,
    events: &mut Vec<CombatEvent>,
) -> Result<(), CoreError> {
    if ability == Ability::Guard {
        let rage_gained = gain_rage(state, RAGE_PER_GUARD);
        events.push(CombatEvent::AbilityUsed {
            ability,
            damage: 0,
            mana_spent: 0,
            rage_spent: 0,
            rage_gained,
            enemy_health: state.enemy_health,
        });
        return Ok(());
    }
    if state.cooldown != 0 {
        return Err(CoreError::InvalidAction);
    }
    let (mana_spent, rage_spent, power) = match ability {
        Ability::SharedSkill => (SKILL_MANA, 0, SKILL_POWER),
        Ability::Signature => (SIGNATURE_MANA, SIGNATURE_RAGE, SIGNATURE_POWER),
        Ability::FireZone => {
            if pet.signature != SignatureKind::FireZone {
                return Err(CoreError::InvalidAction);
            }
            (SIGNATURE_MANA, SIGNATURE_RAGE, FIRE_ZONE_POWER)
        }
        Ability::Ultimate => (ULTIMATE_MANA, ULTIMATE_RAGE, ULTIMATE_POWER),
        Ability::Guard => unreachable!("handled above"),
    };
    if state.mana < mana_spent || state.rage < rage_spent {
        return Err(CoreError::InvalidAction);
    }
    let damage = scaled_damage(
        pet.attack,
        power,
        pet.element.multiplier_against(encounter.element),
        encounter.defense,
    );
    state.mana -= mana_spent;
    state.rage -= rage_spent;
    state.cooldown = COOLDOWN_TURNS;
    apply_damage(&mut state.enemy_health, &mut state.enemy_shield, damage);
    events.push(CombatEvent::AbilityUsed {
        ability,
        damage,
        mana_spent,
        rage_spent,
        rage_gained: 0,
        enemy_health: state.enemy_health,
    });
    Ok(())
}

pub(super) fn resolve_enemy_with(
    state: &mut State,
    intent: &EnemyIntent,
    cleared: &[bool; CELLS],
    guarding: bool,
    pet: &PetCombat,
    encounter: &EncounterCombat,
    events: &mut Vec<CombatEvent>,
) -> Result<(), CoreError> {
    let enraged = encounter.boss && state.enemy_health.saturating_mul(2) < encounter.health;
    let base_power = match intent.kind {
        super::EnemyIntentKind::Assault => ASSAULT_POWER,
        super::EnemyIntentKind::Heavy => HEAVY_POWER,
        super::EnemyIntentKind::Guard => GUARD_ATTACK_POWER,
    };
    let power = base_power + if enraged { ENRAGE_BONUS } else { 0 };
    let exposed = intent
        .cells
        .iter()
        .filter(|at| !cleared[usize::from(**at)])
        .count();
    let raw_damage = scaled_damage(
        encounter.attack,
        power,
        encounter.element.multiplier_against(pet.element),
        pet.defense,
    );
    let mut damage = raw_damage
        .saturating_mul(exposed as u32)
        .div_ceil(super::SIDE as u32);
    if guarding {
        damage = damage.div_ceil(2);
    }
    if intent.kind == super::EnemyIntentKind::Guard {
        let amount = encounter.defense.saturating_mul(4);
        let total = state
            .enemy_shield
            .saturating_add(amount)
            .min(ENEMY_SHIELD_CAP);
        let added = total - state.enemy_shield;
        state.enemy_shield = total;
        events.push(CombatEvent::EnemyShielded {
            amount: added,
            total,
        });
    }
    let rage_gained = if damage > 0 {
        gain_rage(state, RAGE_PER_HIT)
    } else {
        0
    };
    state.health = state.health.saturating_sub(damage);
    events.push(CombatEvent::EnemyAttack {
        kind: intent.kind,
        axis: intent.axis,
        target: intent.target,
        exposed: u8::try_from(exposed).unwrap_or(u8::MAX),
        raw_damage,
        damage,
        enraged,
        rage_gained,
        player_health: state.health,
    });
    Ok(())
}

#[cfg(test)]
pub(super) fn tick_fire_zone(
    state: &mut State,
    events: &mut Vec<CombatEvent>,
) -> Result<(), CoreError> {
    let pet = PETS[usize::from(state.pet)].combat();
    let encounter = ENCOUNTERS[usize::from(state.encounter)].combat();
    tick_fire_zone_with(state, &pet, &encounter, events)
}

pub(super) fn tick_fire_zone_with(
    state: &mut State,
    pet: &PetCombat,
    encounter: &EncounterCombat,
    events: &mut Vec<CombatEvent>,
) -> Result<(), CoreError> {
    let damage = scaled_damage(
        pet.attack,
        FIRE_ZONE_TICK_POWER,
        pet.element.multiplier_against(encounter.element),
        encounter.defense,
    );
    apply_damage(&mut state.enemy_health, &mut state.enemy_shield, damage);
    let remaining = state.fire_zone_turns.saturating_sub(1);
    state.fire_zone_turns = remaining;
    events.push(CombatEvent::FireZoneTicked {
        damage,
        remaining,
        enemy_health: state.enemy_health,
    });
    Ok(())
}
