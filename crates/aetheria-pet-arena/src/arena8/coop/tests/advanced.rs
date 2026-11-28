use super::*;
use serde_json::json;

const BUNDLE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../config/gameplay/arena8-coop-advanced-v1.candidate.json"
));
const GHOST: &str = "lantern-necropolis-warden";
const WATER: &str = "tideglass-lagoon-warden";
const LIGHT: &str = "dawn-prism-sanctum-warden";
const FIRE: &str = "cinder-terraces-warden";

fn advanced_rules(encounter: &str) -> CoopRules {
    CoopRules::load(BUNDLE, encounter.into()).unwrap()
}

fn tile(kind: TileKind, multiplier: u8) -> Option<Tile> {
    Some(Tile {
        identity: TileIdentity::Kind(kind),
        multiplier,
    })
}

fn basic_board() -> [Option<Tile>; CELLS] {
    std::array::from_fn(|i| tile(TileKind::ALL[(i / SIDE + 2 * (i % SIDE)) % 6], 1))
}

fn count(state: &CoopState, kind: TileKind) -> usize {
    state
        .board
        .iter()
        .flatten()
        .filter(|t| t.identity == TileIdentity::Kind(kind))
        .count()
}

#[test]
fn candidate_pins_new_ruleset_and_preserves_all_221_ability_contracts() {
    let base: serde_json::Value = serde_json::from_slice(v3_bundle()).unwrap();
    let candidate: serde_json::Value = serde_json::from_slice(BUNDLE).unwrap();
    for key in base.as_object().unwrap().keys().filter(|key| {
        !matches!(
            key.as_str(),
            "schemaVersion" | "engineCapability" | "configId" | "contentRevision"
        )
    }) {
        assert_eq!(candidate[key], base[key], "{key}");
    }
    assert_eq!(candidate["skills"].as_array().unwrap().len(), 221);
    assert_eq!(candidate["pets"].as_array().unwrap().len(), 55);
    let rules = advanced_rules(GHOST);
    let solo = CoopRules::load_solo(BUNDLE, GHOST.into()).unwrap();
    assert_eq!((rules.ruleset().version, solo.ruleset().version), (4, 3));
    assert_ne!(rules.ruleset().content_hash, solo.ruleset().content_hash);
    let parse = |j: &serde_json::Value| CoopConfig::parse(&serde_json::to_vec(j).unwrap());
    for (path, bad) in [
        ("/schemaVersion", json!(4)),
        ("/engineCapability", json!("arena8-coop-v3")),
        ("/advancedJewels", json!(null)),
        ("/advancedJewels/frostReductionPm", json!([150, 151, 1000])),
        ("/advancedJewels/natureActorLimits", json!([3, 2, 1])),
        ("/advancedJewels/occupancyLimit", json!(2)),
        ("/advancedJewels/encounters/0/encounterId", json!("missing")),
        (
            "/advancedJewels/encounters/0/skills/0/skillId",
            json!("missing"),
        ),
        ("/advancedJewels/encounters/0/opening/kind", json!("sword")),
        ("/advancedJewels/encounters/0/opening/count", json!(1)),
        (
            "/board/functionalTiles/spawnWeights/0/kind",
            json!("nature"),
        ),
    ] {
        let mut modified = candidate.clone();
        *modified.pointer_mut(path).unwrap() = bad;
        assert!(parse(&modified).is_err(), "{path}");
    }
    let mut historical = base.clone();
    historical["advancedJewels"] = candidate["advancedJewels"].clone();
    assert!(parse(&historical).is_err());
    historical["advancedJewels"] = json!(null);
    assert!(parse(&historical).is_err());
    let mut altered = candidate;
    altered["advancedJewels"]["frostReductionPm"][1] = json!(201);
    assert_ne!(parse(&altered).unwrap().digest(), rules.digest());
}

#[test]
fn deterministic_conversions_have_an_immediate_scoring_swap_and_do_not_consume_rng() {
    for (encounter, kind) in [
        (GHOST, TileKind::Nature),
        (WATER, TileKind::Frost),
        (LIGHT, TileKind::Astral),
    ] {
        let rules = advanced_rules(encounter);
        let historical = CoopRules::load(v3_bundle(), encounter.into()).unwrap();
        let mut entropy = rng(0);
        let mut old_entropy = rng(0);
        let initial = rules.allocate(seats()).unwrap();
        let start = rules
            .reduce_stamped(&initial, CoopAction::Start, Some(1000), &mut entropy)
            .unwrap();
        historical
            .reduce(
                &historical.allocate(seats()).unwrap(),
                CoopAction::Start,
                &mut old_entropy,
            )
            .unwrap();
        assert_eq!(entropy.cursor(), old_entropy.cursor());
        assert_eq!(count(&start.state, kind), 3);
        assert_eq!(start.state.turn_deadline_ms, Some(16_000));
        assert!(
            start
                .events
                .contains(&event(&format!("generated-{}", kind.name()), None, 3))
        );
        for n in 3..=5 {
            let mut state = start.state.clone();
            state.board = basic_board();
            rules.convert_group(
                &mut state,
                super::super::advanced::Conversion { kind, count: n },
                &mut vec![],
            );
            let swap = (0..CELLS)
                .find_map(|a| {
                    [a + 1, a + SIDE].into_iter().find_map(|b| {
                        if !rules.swap_matches(&state, a, b) {
                            return None;
                        }
                        let mut board = state.board;
                        board.swap(a, b);
                        matched_cells(&board)
                            .iter()
                            .zip(board)
                            .filter(|(m, t)| {
                                **m && t.is_some_and(|t| t.identity == TileIdentity::Kind(kind))
                            })
                            .count()
                            .eq(&usize::from(n))
                            .then_some((a, b))
                    })
                })
                .expect("generated group has a legal scoring swap");
            let parsed: CoopState =
                serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
            let action = CoopAction::Swap {
                first: swap.0 as u8,
                second: swap.1 as u8,
            };
            let left = rules
                .reduce_stamped(&state, action, Some(2000), &mut rng(82))
                .unwrap();
            let right = rules
                .reduce_stamped(&parsed, action, Some(2000), &mut rng(82))
                .unwrap();
            assert_eq!(state_digest(&left.state), state_digest(&right.state));
            assert_eq!(left.events, right.events);
            assert!(left.events.contains(&event(
                &format!("matched-{}", kind.name()),
                Some(state.active_seat as u8),
                n.into()
            )));
        }
    }
    let rules = advanced_rules(FIRE);
    let state = rules
        .reduce(
            &rules.allocate(seats()).unwrap(),
            CoopAction::Start,
            &mut rng(0),
        )
        .unwrap()
        .state;
    assert!(
        !state
            .board
            .iter()
            .flatten()
            .any(|t| matches!(t.identity,TileIdentity::Kind(k) if k.advanced()))
    );
    let mut corrupted = state;
    corrupted.board[0] = tile(TileKind::Nature, 1);
    assert!(rules.validate(&corrupted).is_err());
    corrupted.config_digest = v3_rules().digest();
    assert!(v3_rules().validate(&corrupted).is_err());
}

#[test]
fn only_an_accepted_bound_skill_converts_and_the_occupancy_cap_is_atomic() {
    let rules = advanced_rules(WATER);
    let mut state = rules
        .reduce(
            &rules.allocate(seats()).unwrap(),
            CoopAction::Start,
            &mut rng(0),
        )
        .unwrap()
        .state;
    state.active_seat = 1; // Marivell's existing healing signature.
    state.participants[1].mana = 0;
    assert!(
        rules
            .reduce(&state, CoopAction::Signature, &mut rng(0))
            .is_err()
    );
    state.participants[1].mana = rules.config.resources.mana_cap;
    state.participants[1].rage = rules.config.resources.rage_cap;
    state.participants[1].hp -= 30;
    let cast = rules
        .reduce(&state, CoopAction::Signature, &mut rng(0))
        .unwrap();
    assert!(cast.events.contains(&event("generated-frost", None, 3)));
    assert!(cast.state.participants[1].hp > state.participants[1].hp);
    assert_eq!(count(&cast.state, TileKind::Frost), 6);
    let mut full = cast.state;
    let conversion = super::super::advanced::Conversion {
        kind: TileKind::Nature,
        count: 3,
    };
    rules.convert_group(&mut full, conversion, &mut vec![]);
    assert_eq!(count(&full, TileKind::Nature), 3);
    let before = full.board;
    let mut events = vec![];
    rules.convert_group(&mut full, conversion, &mut events);
    assert_eq!(full.board, before);
    assert_eq!(events, [event("generated-nature", None, 0)]);
    rules.dead_board(&mut full, &mut rng(90)).unwrap();
    assert!(rules.legal_swap(&full).is_some());
    assert!(
        full.board
            .iter()
            .flatten()
            .all(|t| matches!(t.identity,TileIdentity::Kind(k) if !k.advanced()))
    );
}

#[test]
fn nature_groups_cleanse_only_eligible_slots_and_one_living_ally_without_healing() {
    let rules = advanced_rules(GHOST);
    let mut state = rules.allocate(seats()).unwrap();
    state.active_seat = 0;
    let vulnerable = Some(Status {
        kind: StatusKind::Vulnerability,
        value: 150,
        turns: 3,
    });
    let buff = Some(Status {
        kind: StatusKind::DefenseBuff,
        value: 500,
        turns: 4,
    });
    for seat in &mut state.participants {
        seat.statuses = [vulnerable, buff, vulnerable, vulnerable];
    }
    state.participants[1].alive = false;
    state.participants[1].hp = 0;
    state.participants[0].hp = 1;
    // Cross of five unique tiles. x8 must not scale cleanse counts.
    for i in [1, 8, 9, 10, 17] {
        state.board[i] = tile(TileKind::Nature, 8);
    }
    assert_eq!(rules.advanced_matches(&mut state, &mut vec![]), 0);
    assert_eq!(state.participants[0].statuses, [None, buff, None, None]);
    assert_eq!(state.participants[0].hp, 1);
    assert_eq!(state.participants[1].statuses[0], vulnerable);
    assert_eq!(state.participants[1].hp, 0);
    assert_eq!(
        state.participants[2].statuses,
        [None, buff, vulnerable, vulnerable]
    );
    assert_eq!(state.participants[3].statuses[0], vulnerable);
    state.participants.truncate(1);
    state.board = [None; CELLS];
    // Adjacent same-kind triples in separate rows award two match-3 effects.
    for i in [0, 1, 2, 8, 9, 10] {
        state.board[i] = tile(TileKind::Nature, 8);
    }
    state.participants[0].statuses = [vulnerable, vulnerable, vulnerable, buff];
    let mut events = vec![];
    rules.advanced_matches(&mut state, &mut events);
    assert_eq!(
        state.participants[0].statuses,
        [None, None, vulnerable, buff]
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| **e == event("matched-nature", Some(0), 3))
            .count(),
        2
    );
}

#[test]
fn frost_strongest_persists_until_one_committed_multi_target_impact() {
    let rules = advanced_rules(WATER);
    let mut state = rules.allocate(seats()).unwrap();
    state.board[..5].fill(tile(TileKind::Frost, 8));
    rules.advanced_matches(&mut state, &mut vec![]);
    state.board[3..5].fill(None);
    rules.advanced_matches(&mut state, &mut vec![]);
    assert_eq!(state.chill_reduction_pm, Some(250));
    state.pending = Some(PendingAttack {
        targets: 2,
        remaining: 2,
        damage: 100,
    });
    let mut events = vec![];
    rules.tick_pending(&mut state, &mut events);
    assert!(events.is_empty());
    let mut fresh: CoopState =
        serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
    let mut control = fresh.clone();
    control.chill_reduction_pm = None;
    assert_ne!(state_digest(&control), state_digest(&fresh));
    rules.tick_pending(&mut control, &mut vec![]);
    rules.tick_pending(&mut fresh, &mut events);
    assert_eq!(fresh.chill_reduction_pm, None);
    assert_eq!(
        events
            .iter()
            .filter(|e| **e == event("chill-consumed", None, 250))
            .count(),
        1
    );
    let mut hit_count = 0;
    for (index, original) in state.participants.iter().enumerate() {
        let raw = original.hp - control.participants[index].hp;
        let reduced = original.hp - fresh.participants[index].hp;
        if raw > 0 {
            hit_count += 1;
        }
        assert_eq!(reduced, raw * 750 / 1000);
    }
    assert_eq!(hit_count, 2);
    events.clear();
    rules.apply_boss_attack(&mut fresh, 2, 100, &mut events);
    assert!(!events.contains(&event("chill-consumed", None, 250)));
}

#[test]
fn astral_uses_row_major_survivors_once_after_settling_and_obeys_current_ceiling() {
    let rules = advanced_rules(LIGHT);
    let mut state = rules.allocate(seats()).unwrap();
    state.board = basic_board();
    // This bottom-row motif guarantees a legal swap after refilling the top.
    for i in [56, 57, 50] {
        state.board[i] = tile(TileKind::Sword, 1);
    }
    state.board[58] = tile(TileKind::Mana, 1);
    state.board[..4].fill(tile(TileKind::Astral, 8));
    assert_eq!(rules.advanced_matches(&mut state, &mut vec![]), 2);
    let matched = matched_cells(&state.board);
    let mut entropy = rng(0);
    let outcome = rules
        .score_functional_match(&mut state, 0, &matched, &mut entropy, &mut vec![])
        .unwrap();
    assert_eq!((outcome.damage, entropy.cursor()), (0, 0));
    let mut survivors = u64::MAX;
    rules
        .gravity_and_refill(
            &mut state,
            &mut entropy,
            &mut survivors,
            &mut TurnObservation::default(),
        )
        .unwrap();
    assert_eq!(survivors, !0b1111u64);
    let mut manual = rules.allocate(seats()).unwrap();
    manual.board = basic_board();
    manual.board[0] = tile(TileKind::Astral, 1);
    manual.board[2] = tile(TileKind::Sword, 8);
    let eligible = 0b11_1101; // cell 1 represents a refill, and 2 is at the cap.
    rules.amplify(&mut manual, eligible, 2, &mut vec![]);
    assert_eq!(manual.board[3].unwrap().multiplier, 1); // x1-only opening stage
    manual.turn_index = 42;
    let mut events = vec![];
    rules.amplify(&mut manual, eligible, 2, &mut events);
    assert_eq!(manual.board[0], tile(TileKind::Astral, 1));
    assert_eq!(manual.board[1].unwrap().multiplier, 1);
    assert_eq!(manual.board[2], tile(TileKind::Sword, 8));
    assert_eq!(
        (
            manual.board[3].unwrap().multiplier,
            manual.board[4].unwrap().multiplier,
            manual.board[5].unwrap().multiplier
        ),
        (2, 2, 1)
    );
    assert_eq!(events.len(), 2);
}

#[test]
fn nature_run_lengths_and_intersections_use_unique_cells_in_solo() {
    let rules = advanced_rules(GHOST);
    let vulnerability = Some(Status {
        kind: StatusKind::Vulnerability,
        value: 150,
        turns: 3,
    });
    for (cells, cleanses) in [
        (&[0, 1, 2][..], 1),
        (&[0, 8, 16, 24][..], 2),
        (&[0, 1, 2, 3, 4][..], 3),
        (&[0, 1, 2, 9, 17][..], 3),   // T
        (&[0, 8, 16, 17, 18][..], 3), // L
        (&[1, 8, 9, 10, 17][..], 3),  // Cross
    ] {
        let mut state = rules.allocate(seats()).unwrap();
        state.participants.truncate(1);
        state.active_seat = 0;
        state.participants[0].statuses = [vulnerability; 4];
        state.board = [None; CELLS];
        for &cell in cells {
            state.board[cell] = tile(TileKind::Nature, 8);
        }
        let mut events = Vec::new();
        rules.advanced_matches(&mut state, &mut events);
        let mut expected = vec![event("matched-nature", Some(0), cells.len() as u64)];
        expected.extend((0..cleanses).map(|_| event("nature-cleanse", Some(0), 1)));
        assert_eq!(events, expected, "shape {cells:?}");
        assert_eq!(
            state.participants[0].statuses.iter().flatten().count(),
            4 - cleanses
        );
    }
}
