use vl_game_core::{
    Canonical, Command, Decision, Fixed, LogicalClock, Reducer, Ruleset, SecretSeed, TurnRng,
    Value, apply, begin, canonical::list,
};
use vl_pet_arena::{
    Error,
    board::{Board, CELLS, training_board},
    content::{self, Element, PETS, STAGES},
    status::{Kind, Status, shielded_hit},
    telegraph::{Pattern, Telegraph},
};

#[test]
fn eight_pets_six_stages_and_guardian_have_pinned_content() {
    content::validate().unwrap();
    assert_eq!(PETS.len(), 8);
    assert_eq!(STAGES.len(), 6);
    for element in [
        Element::Ember,
        Element::Tide,
        Element::Grove,
        Element::Spark,
    ] {
        assert_eq!(PETS.iter().filter(|pet| pet.element == element).count(), 2);
    }
    for pair in STAGES.windows(2) {
        assert!(pair[1].enemy_health > pair[0].enemy_health);
        assert!(pair[1].enemy_attack > pair[0].enemy_attack);
    }
    assert_eq!(STAGES.iter().filter(|stage| stage.boss).count(), 1);
    assert_eq!(STAGES.last().unwrap().id, "prism-guardian");
    assert_eq!(content::CONTENT_ID, "pet-arena-training");
    assert_eq!(content::CONTENT_VERSION, 1);
    assert_eq!(
        content::content_hash().unwrap(),
        [
            223, 84, 202, 242, 52, 249, 71, 182, 120, 165, 233, 36, 220, 87, 250, 158, 192, 53,
            124, 62, 176, 14, 244, 90, 220, 12, 105, 228, 228, 250, 48, 138,
        ]
    );
}

#[test]
fn swaps_require_adjacent_distinct_tiles_and_a_new_match() {
    let board = training_board();
    assert!(board.matches().into_iter().all(|cell| !cell));
    let matched = board.swap(2, 8).unwrap();
    assert_eq!(
        matched.matches().into_iter().filter(|cell| *cell).count(),
        3
    );
    assert_eq!(matched.0[0..3], [Element::Ember; 3]);
    assert_eq!(board, training_board());
    for pair in [
        (0, 0),
        (0, 1),
        (5, 6),
        (0, 7),
        (0, 35),
        (36, 2),
        (usize::MAX, 1),
        (0, 6),
    ] {
        assert_eq!(board.swap(pair.0, pair.1), Err(Error::InvalidSwap));
    }
    assert_eq!(matched.swap(8, 9), Err(Error::InvalidBoard));
    assert_eq!(
        Board([Element::Tide; CELLS]).swap(0, 6),
        Err(Error::InvalidSwap)
    );
    for first in 0..CELLS {
        for second in 0..CELLS {
            if let Ok(next) = board.swap(first, second) {
                assert_eq!(
                    (first / 6).abs_diff(second / 6) + (first % 6).abs_diff(second % 6),
                    1
                );
                assert_ne!(board.0[first], board.0[second]);
                assert!(next.matches()[first] || next.matches()[second]);
                assert!(
                    board
                        .0
                        .iter()
                        .enumerate()
                        .all(|(at, cell)| at == first || at == second || *cell == next.0[at])
                );
            }
        }
    }
}

#[test]
fn match_detection_marks_full_horizontal_vertical_and_cross_runs() {
    let mut board = training_board();
    for at in 0..6 {
        board.0[at] = Element::Ember;
    }
    for at in [0, 6, 12, 18, 24, 30] {
        board.0[at] = Element::Ember;
    }
    let matches = board.matches();
    for at in [0, 1, 2, 3, 4, 5, 6, 12, 18, 24, 30] {
        assert!(matches[at]);
    }
}

#[test]
fn telegraphs_are_committed_one_turn_ahead_and_cannot_be_retargeted() {
    for stage in 0..6 {
        for turn in 0..60 {
            for choice in 0..6 {
                let intent = Telegraph::announce(stage, turn, choice).unwrap();
                intent.validate_for_resolution(stage, turn + 1).unwrap();
                assert_eq!(
                    intent.validate_for_resolution(stage, turn),
                    Err(Error::InvalidTelegraph)
                );
                assert_eq!(
                    intent.validate_for_resolution(stage, turn + 2),
                    Err(Error::InvalidTelegraph)
                );
                assert_eq!(
                    intent.validate_for_resolution((stage + 1) % 6, turn + 1),
                    Err(Error::InvalidTelegraph)
                );
                let expected = if intent.pattern == Pattern::Cross {
                    11
                } else {
                    6
                };
                assert_eq!(intent.cells.len(), expected);
                assert!(intent.cells.windows(2).all(|cells| cells[0] < cells[1]));
            }
        }
    }
    for (stage, turn, target) in [
        (6, 0, 0),
        (0, 60, 0),
        (0, u16::MAX, 0),
        (0, 0, 6),
        (255, 0, 255),
    ] {
        assert_eq!(
            Telegraph::announce(stage, turn, target),
            Err(Error::InvalidTelegraph)
        );
    }
    let intent = Telegraph::announce(5, 2, 3).unwrap();
    assert_eq!(intent.pattern, Pattern::Cross);
    let mut forged = intent.clone();
    forged.cells.pop();
    assert_eq!(
        forged.validate_for_resolution(5, 3),
        Err(Error::InvalidTelegraph)
    );
    let mut forged = intent.clone();
    forged.target = 4;
    assert_eq!(
        forged.validate_for_resolution(5, 3),
        Err(Error::InvalidTelegraph)
    );
    let mut forged = intent.clone();
    forged.resolves_turn = 2;
    assert_eq!(
        forged.validate_for_resolution(5, 2),
        Err(Error::InvalidTelegraph)
    );
}

#[test]
fn fixed_point_status_examples_expire_without_stacking_or_overflow() {
    let points = |value| Fixed::from_integer(value).unwrap();
    let poison = Status::new(Kind::Poison, points(6)).unwrap();
    let mut health = points(100);
    let mut active = Some(poison);
    while let Some(status) = active {
        health = health.checked_sub(status.potency).unwrap();
        active = status.expire().unwrap();
    }
    assert_eq!(health, points(82));
    assert_eq!(poison.refresh(poison).unwrap(), poison);
    let weakened = Status {
        potency: points(2),
        remaining_turns: 1,
        ..poison
    };
    assert_eq!(weakened.refresh(poison).unwrap(), poison);
    assert_eq!(
        shielded_hit(points(100), points(20), points(30)).unwrap(),
        (points(90), points(0))
    );
    assert_eq!(
        shielded_hit(points(5), points(0), points(30)).unwrap(),
        (points(0), points(0))
    );
    assert_eq!(
        shielded_hit(
            Fixed::from_raw(i64::MAX),
            points(0),
            Fixed::from_raw(i64::MAX)
        )
        .unwrap(),
        (points(0), points(0))
    );
    let fractional = shielded_hit(
        Fixed::from_raw(1501),
        Fixed::from_raw(500),
        Fixed::from_raw(1001),
    )
    .unwrap();
    assert_eq!(fractional, (points(1), points(0)));
    for potency in [0, -1, 100_001, i64::MAX] {
        assert_eq!(
            Status::new(Kind::Poison, Fixed::from_raw(potency)),
            Err(Error::InvalidStatus)
        );
    }
    assert_eq!(
        Status::new(Kind::Slow, points(2)),
        Err(Error::InvalidStatus)
    );
    assert_eq!(
        poison.refresh(Status::new(Kind::Empower, points(5)).unwrap()),
        Err(Error::InvalidStatus)
    );
    assert_eq!(
        Status {
            remaining_turns: 0,
            ..poison
        }
        .expire(),
        Err(Error::InvalidStatus)
    );
    assert_eq!(
        shielded_hit(points(-1), points(0), points(1)),
        Err(Error::InvalidStatus)
    );
}

#[derive(Clone)]
struct Fixture {
    turn: u16,
    telegraphs: Vec<Telegraph>,
}
impl Canonical for Fixture {
    fn canonical(&self) -> Value {
        list([
            Value::Uint(self.turn.into()),
            list(self.telegraphs.iter().map(|intent| {
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
struct FixtureRules;
impl Reducer for FixtureRules {
    type State = Fixture;
    type Action = Value;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: content::CONTENT_ID.into(),
            version: 1,
            content_hash: content::content_hash().unwrap(),
            rng_version: 1,
        }
    }
    fn validate(&self, state: &Fixture) -> Result<(), vl_game_core::Error> {
        if usize::from(state.turn) != state.telegraphs.len() {
            return Err(vl_game_core::Error::InvalidState);
        }
        for (turn, intent) in state.telegraphs.iter().enumerate() {
            if usize::from(intent.announced_turn) != turn
                || intent.validate_for_resolution(5, turn as u16 + 1).is_err()
            {
                return Err(vl_game_core::Error::InvalidState);
            }
        }
        Ok(())
    }
    fn reduce(
        &self,
        state: &Fixture,
        action: &Value,
        _: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<Fixture>, vl_game_core::Error> {
        if *action != Value::Uint(state.turn.into()) {
            return Err(vl_game_core::Error::InvalidAction);
        }
        let mut next = state.clone();
        next.telegraphs.push(
            Telegraph::draw(5, state.turn, rng).map_err(|_| vl_game_core::Error::InvalidAction)?,
        );
        next.turn += 1;
        Ok(Decision {
            state: next,
            events: vec![],
            projections: vec![],
            settlement: None,
        })
    }
}

fn fixture(seed: u8) -> vl_game_core::Checkpoint<Fixture> {
    let seed = SecretSeed::from_host_entropy([seed; 32]);
    let clock = LogicalClock {
        server_tick: 0,
        logical_time_ms: 0,
    };
    let mut state = begin(
        &FixtureRules,
        [3; 16],
        Fixture {
            turn: 0,
            telegraphs: vec![],
        },
        &seed,
        clock,
    )
    .unwrap();
    for turn in 0..6 {
        let command = Command {
            id: [turn + 1; 16],
            match_id: [3; 16],
            expected_version: turn.into(),
            ruleset: FixtureRules.ruleset(),
            action: Value::Uint(turn.into()),
        };
        state = apply(
            &FixtureRules,
            &state,
            &command,
            &seed,
            LogicalClock {
                server_tick: u64::from(turn + 1),
                logical_time_ms: u64::from(turn + 1) * 1000,
            },
        )
        .unwrap()
        .next;
    }
    state
}

#[test]
fn seeded_content_fixture_replays_exactly_with_the_existing_core_rng() {
    let first = fixture(7);
    let again = fixture(7);
    assert_eq!(first.audit_hash, again.audit_hash);
    assert_eq!(first.state.canonical(), again.state.canonical());
    assert_eq!(first.rng_cursor, 6);
    assert_ne!(first.audit_hash, fixture(8).audit_hash);
    assert_eq!(
        first.audit_hash,
        [
            22, 193, 131, 113, 204, 253, 209, 107, 40, 211, 254, 94, 65, 194, 234, 50, 2, 206, 43,
            232, 151, 184, 135, 133, 132, 57, 195, 80, 129, 21, 251, 76,
        ]
    );
}
