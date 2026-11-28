use super::board;
use super::combat;
use super::events::CombatEvent;
use super::model::{
    Ability, Action, Axis, BOSS_SCHEDULE, ENCOUNTERS, EnemyIntent, EnemyIntentKind, ICARUS, PETS,
    Phase, RecoveryReason, State,
};
use super::{
    BOARD_DAMAGE_DIVISOR, CELLS, COOLDOWN_TURNS, ELEMENT_COUNT, ELEMENTS, Element, FIRE_ZONE_TICKS,
    MANA_CAP, MANA_PER_TILE, MAX_CASCADES, MAX_TURNS, RAGE_CAP, RAGE_PER_GUARD, RULES_HASH, SIDE,
    SignatureKind, computed_rules_hash, rules_hash, rules_hash_hex, validate_content,
};
use aetheria_game_core::{Canonical, Error as CoreError, Value};

struct TestRng {
    state: u64,
    draws: u32,
}

struct ZeroRng;

impl super::Random for ZeroRng {
    fn below(&mut self, upper: u32) -> Result<u32, CoreError> {
        if upper == 0 {
            return Err(CoreError::InvalidAction);
        }
        Ok(0)
    }
}

impl TestRng {
    fn new(seed: u64) -> Self {
        Self {
            state: seed,
            draws: 0,
        }
    }
}

impl super::Random for TestRng {
    fn below(&mut self, upper: u32) -> Result<u32, CoreError> {
        if upper == 0 {
            return Err(CoreError::InvalidAction);
        }
        self.draws += 1;
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        value ^= value >> 31;
        Ok(((value >> 32) as u32) % upper)
    }
}

fn constant_board() -> super::Board {
    let mut cells = [Element::Fire; CELLS];
    for y in 0..SIDE {
        for x in 0..SIDE {
            cells[y * SIDE + x] = ELEMENTS[(x + 2 * y) % ELEMENT_COUNT];
        }
    }
    super::Board::from_cells(cells)
}

fn playing_state(pet: u8, encounter: u8) -> State {
    let mut state = State::new(pet, encounter).unwrap();
    state.phase = Phase::Playing;
    state.intent = Some(
        EnemyIntent::announce(
            ENCOUNTERS[usize::from(encounter)].boss,
            0,
            &mut TestRng::new(3),
        )
        .unwrap(),
    );
    state
}

#[test]
fn board_has_exactly_64_cells_and_seeded_start_is_settled_and_playable() {
    assert_eq!(CELLS, 64);
    assert_eq!(super::Board::fallback().cells().len(), 64);
    for seed in 0..8 {
        let mut rng = TestRng::new(seed);
        let generation = board::generate_board(&mut rng).unwrap();
        assert!(!generation.board.has_matches(), "seed {seed}");
        assert!(generation.board.legal_move().is_some(), "seed {seed}");
        assert_eq!(generation.board.cells().len(), CELLS);
    }
    let fallback = super::Board::fallback();
    assert!(!fallback.has_matches());
    assert!(fallback.legal_move().is_some());
}

#[test]
fn match_detection_marks_full_runs_and_crossings_once() {
    let mut board = constant_board();
    assert!(!board.has_matches());
    for x in 0..3 {
        board.cells[7 * SIDE + x] = Element::Fire;
    }
    for y in 0..3 {
        board.cells[y * SIDE + 7] = Element::Fire;
    }
    let matches = board.matches();
    assert_eq!(matches.iter().filter(|value| **value).count(), 6);
    for x in 0..3 {
        assert!(matches[7 * SIDE + x]);
    }
    for y in 0..3 {
        assert!(matches[y * SIDE + 7]);
    }
    let mut crossing = constant_board();
    for x in 0..3 {
        crossing.cells[3 * SIDE + x] = Element::Fire;
    }
    for y in 2..5 {
        crossing.cells[y * SIDE + 1] = Element::Fire;
    }
    let matches = crossing.matches();
    assert_eq!(matches.iter().filter(|value| **value).count(), 5);
    assert!(matches[3 * SIDE + 1]);
}

#[test]
fn swaps_require_bounds_adjacency_different_elements_and_a_new_match() {
    let board = super::Board::fallback();
    assert!(board.try_swap(2, SIDE as u8 + 2).is_some());
    assert!(board.try_swap(0, 1).is_none());
    assert!(board.try_swap(0, 9).is_none());
    assert!(board.try_swap(64, 0).is_none());
    assert!(board.try_swap(255, 0).is_none());
    let next = board.try_swap(2, SIDE as u8 + 2).unwrap();
    let matches = next.matches();
    assert!(matches[2]);
    assert!(matches[0] && matches[1]);
}

#[test]
fn gravity_preserves_survivor_order_and_refills_deterministically() {
    let mut first = super::Board::from_cells([Element::Water; CELLS]);
    let mut second = first;
    let mut matches = [false; CELLS];
    matches[0] = true;
    matches[2 * SIDE] = true;
    let mut rng = ZeroRng;
    board::settle_gravity(&mut first, &matches, &mut rng).unwrap();
    let mut rng = ZeroRng;
    board::settle_gravity(&mut second, &matches, &mut rng).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.cells()[0], Element::Fire);
    assert_eq!(first.cells()[SIDE], Element::Fire);
    for y in 2..SIDE {
        assert_eq!(first.cells()[y * SIDE], Element::Water);
    }
}

#[test]
fn dead_boards_are_recovered_with_a_settled_playable_board() {
    let dead = constant_board();
    assert!(!dead.has_matches());
    assert!(dead.legal_move().is_none());
    let mut state = playing_state(0, 0);
    state.board = dead;
    let mut events = Vec::new();
    let mut rng = TestRng::new(5);
    combat::resolve_board(&mut state, &mut rng, &mut events).unwrap();
    assert!(!state.board.has_matches());
    assert!(state.board.legal_move().is_some());
    assert!(events.iter().any(|event| matches!(
        event,
        CombatEvent::BoardRecovered {
            reason: RecoveryReason::DeadBoard,
            ..
        }
    )));
}

#[test]
fn cascade_cap_regenerates_the_board_after_sixteen_passes() {
    let mut state = playing_state(0, 11);
    state.board = super::Board::from_cells([Element::Fire; CELLS]);
    let mut events = Vec::new();
    let mut rng = ZeroRng;
    combat::resolve_board(&mut state, &mut rng, &mut events).unwrap();
    assert!(events.iter().any(|event| matches!(
        event,
        CombatEvent::CascadeCapped { passes } if *passes == MAX_CASCADES
    )));
    assert!(events.iter().any(|event| matches!(
        event,
        CombatEvent::BoardRecovered {
            reason: RecoveryReason::CascadeLimit,
            ..
        }
    )));
    assert!(!state.board.has_matches());
    assert!(state.board.legal_move().is_some());
    assert_eq!(state.mana, MANA_CAP);
    assert_eq!(state.rage, RAGE_CAP);
}

#[test]
fn six_elements_have_a_complete_bounded_effectiveness_matrix() {
    assert_eq!(ELEMENTS.len(), 6);
    for attacker in ELEMENTS {
        for defender in ELEMENTS {
            assert!(matches!(
                attacker.multiplier_against(defender),
                0 | 800 | 1000 | 1250
            ));
        }
    }
    assert_eq!(Element::Electric.multiplier_against(Element::Ground), 0);
    assert_eq!(Element::Ground.multiplier_against(Element::Electric), 1250);
    assert_eq!(Element::Fire.multiplier_against(Element::Water), 800);
    assert_eq!(Element::Water.multiplier_against(Element::Fire), 1250);
    assert_eq!(Element::Fire.multiplier_against(Element::Light), 1000);
}

#[test]
fn damage_uses_effectiveness_defense_and_immunity() {
    let neutral = combat::scaled_damage(20, 1000, 1000, 10);
    let advantage = combat::scaled_damage(20, 1000, 1250, 10);
    let resisted = combat::scaled_damage(20, 1000, 800, 10);
    assert!(advantage > neutral && neutral > resisted);
    assert_eq!(combat::scaled_damage(20, 1000, 0, 10), 0);
    assert_eq!(combat::board_damage(20, 4, 1, 0, 10), 0);
    assert!(combat::board_damage(20, 4, 2, 1000, 10) > combat::board_damage(20, 4, 1, 1000, 10));
    assert_eq!(BOARD_DAMAGE_DIVISOR, 4);
}

#[test]
fn shared_skill_signature_ultimate_guard_and_fire_zone_enforce_costs_and_cooldowns() {
    let mut state = playing_state(0, 11);
    state.mana = 100;
    combat::use_ability(&mut state, Ability::SharedSkill, &mut Vec::new()).unwrap();
    assert_eq!(state.mana, 0);
    assert_eq!(state.cooldown, COOLDOWN_TURNS);
    assert!(combat::use_ability(&mut state, Ability::SharedSkill, &mut Vec::new()).is_err());
    state.cooldown = 0;
    assert!(combat::use_ability(&mut state, Ability::Signature, &mut Vec::new()).is_err());
    state.mana = 200;
    state.rage = 150;
    combat::use_ability(&mut state, Ability::Signature, &mut Vec::new()).unwrap();
    assert_eq!(
        (state.mana, state.rage, state.cooldown),
        (0, 0, COOLDOWN_TURNS)
    );
    state.cooldown = 0;
    state.mana = 300;
    state.rage = 200;
    combat::use_ability(&mut state, Ability::Ultimate, &mut Vec::new()).unwrap();
    assert_eq!((state.mana, state.rage), (0, 0));
    let mut guard = playing_state(0, 0);
    combat::use_ability(&mut guard, Ability::Guard, &mut Vec::new()).unwrap();
    assert_eq!(guard.rage, RAGE_PER_GUARD);
    assert_eq!(guard.cooldown, 0);
    let mut icarus = playing_state(ICARUS as u8, 0);
    icarus.mana = 200;
    icarus.rage = 150;
    let mut events = Vec::new();
    combat::use_ability(&mut icarus, Ability::FireZone, &mut events).unwrap();
    assert!(events.iter().any(|event| matches!(
        event,
        CombatEvent::AbilityUsed {
            ability: Ability::FireZone,
            ..
        }
    )));
    let mut other = playing_state(1, 0);
    other.mana = 200;
    other.rage = 150;
    assert!(combat::use_ability(&mut other, Ability::FireZone, &mut Vec::new()).is_err());
}

#[test]
fn fire_zone_ticks_two_following_turns_and_caps_resources() {
    let mut state = playing_state(0, 11);
    state.fire_zone_turns = FIRE_ZONE_TICKS;
    let start = state.enemy_health;
    let mut events = Vec::new();
    combat::tick_fire_zone(&mut state, &mut events).unwrap();
    assert_eq!(state.fire_zone_turns, 1);
    assert!(state.enemy_health < start);
    combat::tick_fire_zone(&mut state, &mut events).unwrap();
    assert_eq!(state.fire_zone_turns, 0);
    assert_eq!(events.len(), 2);
    state.mana = MANA_CAP - 2;
    state.rage = RAGE_CAP - 2;
    assert_eq!(combat::gain_mana(&mut state, 10), 2);
    assert_eq!(combat::gain_rage(&mut state, 10), 2);
}

#[test]
fn enemy_intents_are_scheduled_bounded_and_validate_without_entropy() {
    let mut rng = TestRng::new(7);
    let intent = EnemyIntent::announce(ENCOUNTERS[0].boss, 0, &mut rng).unwrap();
    assert_eq!(rng.draws, 2);
    assert_eq!(intent.kind, EnemyIntentKind::Assault);
    assert_eq!(intent.cells.len(), SIDE);
    intent.validate(ENCOUNTERS[0].boss, 0).unwrap();
    let mut tampered = intent.clone();
    tampered.target = (tampered.target + 1) % SIDE as u8;
    assert!(tampered.validate(ENCOUNTERS[0].boss, 0).is_err());
    let mut draws = rng.draws;
    assert!(EnemyIntent::announce(ENCOUNTERS[0].boss, MAX_TURNS, &mut rng).is_err());
    assert_eq!(rng.draws, draws);
    draws = rng.draws;
    let boss_intent = EnemyIntent::announce(ENCOUNTERS[1].boss, 1, &mut rng).unwrap();
    assert_eq!(boss_intent.kind, EnemyIntentKind::Heavy);
    assert_eq!(rng.draws, draws + 2);
    assert!(matches!(BOSS_SCHEDULE[1], EnemyIntentKind::Heavy));
    assert_eq!(intent.cells.len(), SIDE);
    assert!(matches!(intent.axis, Axis::Row | Axis::Column));
}

#[test]
fn state_validation_rejects_tampered_resources_boards_and_terminal_states() {
    let mut state = playing_state(0, 0);
    combat::validate_state(&state).unwrap();
    let valid = state.clone();
    state.board = constant_board();
    assert!(combat::validate_state(&state).is_err());
    let mut state = valid.clone();
    state.mana = MANA_CAP + 1;
    assert!(combat::validate_state(&state).is_err());
    let mut state = valid.clone();
    let next_target = (state.intent.as_ref().unwrap().target + 1) % SIDE as u8;
    state.intent.as_mut().unwrap().target = next_target;
    assert!(combat::validate_state(&state).is_err());
    let mut state = valid;
    state.phase = Phase::Won;
    assert!(combat::validate_state(&state).is_err());
    state.enemy_health = 0;
    state.health = 0;
    assert!(combat::validate_state(&state).is_err());
}

#[test]
fn events_roundtrip_through_canonical_values_and_json() {
    let intent = EnemyIntent::announce(ENCOUNTERS[0].boss, 0, &mut TestRng::new(2)).unwrap();
    let events = vec![
        CombatEvent::BoardInitialized {
            cells: vec![Element::Fire; CELLS],
            attempts: 1,
            fallback: false,
        },
        CombatEvent::Swap {
            first: 2,
            second: 10,
        },
        CombatEvent::TilesCleared {
            pass: 1,
            cells: vec![2, 3],
            damage: 12,
            mana_gained: 20,
            rage_gained: 4,
            enemy_health: 100,
        },
        CombatEvent::CascadeCapped {
            passes: MAX_CASCADES,
        },
        CombatEvent::BoardRecovered {
            reason: RecoveryReason::DeadBoard,
            attempts: 2,
        },
        CombatEvent::AbilityUsed {
            ability: Ability::SharedSkill,
            damage: 30,
            mana_spent: 100,
            rage_spent: 0,
            rage_gained: 0,
            enemy_health: 70,
        },
        CombatEvent::FireZoneTicked {
            damage: 5,
            remaining: 1,
            enemy_health: 65,
        },
        CombatEvent::EnemyIntentAnnounced { intent },
        CombatEvent::EnemyAttack {
            kind: EnemyIntentKind::Assault,
            axis: Axis::Column,
            target: 3,
            exposed: 6,
            raw_damage: 20,
            damage: 15,
            enraged: false,
            rage_gained: 10,
            player_health: 90,
        },
        CombatEvent::EnemyShielded {
            amount: 20,
            total: 40,
        },
        CombatEvent::TurnEnded { turn: 1 },
        CombatEvent::MatchEnded {
            phase: Phase::Won,
            turn: 1,
        },
    ];
    for event in events {
        let canonical = event.canonical();
        assert_eq!(CombatEvent::from_canonical(&canonical).unwrap(), event);
        let json = serde_json::to_string(&event).unwrap();
        let decoded: CombatEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, event);
    }
}

#[test]
fn pinned_rules_content_is_stable_and_complete() {
    validate_content().unwrap();
    assert_eq!(computed_rules_hash(), RULES_HASH);
    assert_eq!(rules_hash().unwrap(), RULES_HASH);
    assert_eq!(rules_hash_hex().unwrap().len(), 64);
    assert_eq!(PETS.len(), 6);
    assert_eq!(ENCOUNTERS.len(), 12);
    for (index, pet) in PETS.iter().enumerate() {
        assert_eq!(pet.signature == SignatureKind::FireZone, index == ICARUS);
    }
    assert!(matches!(
        super::canonical_manifest().canonical(),
        Value::List(_)
    ));
    assert_eq!(Action::Start.canonical(), Action::Start.canonical());
    let _ = MANA_PER_TILE;
}
