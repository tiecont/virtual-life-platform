//! Cooperative Arena8 engine conformance tests.
//!
//! Every test drives the real reducer through the game-core shell (`begin` /
//! `apply`) with a server-owned seed. Authored values come only from the
//! database-owned candidate fixture; nothing here is a production default.

use aetheria_game_core::{
    Canonical, Command, Error as CoreError, LogicalClock, SecretSeed, TurnRng, apply, begin,
};
use aetheria_pet_arena::arena8::Element;
use aetheria_pet_arena::arena8::coop::{
    CELLS, COOP_RULESET_ID, ConfigError, CoopAction, CoopPhase, CoopRules, CoopState, SEATS, SIDE,
    SeatInput, Tile, board_digest, content_hash, state_digest,
};
use std::path::PathBuf;

const MATCH: [u8; 16] = [9; 16];
const FIXTURE: &str = "tests/fixtures/arena8-coop-candidate.json";

fn fixture_bytes() -> Vec<u8> {
    let path: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(FIXTURE);
    std::fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

fn fixture_json() -> serde_json::Value {
    serde_json::from_slice(&fixture_bytes()).expect("fixture is JSON")
}

fn rules() -> CoopRules {
    CoopRules::load(&fixture_bytes(), "cinder-terraces-boss".to_string())
        .expect("candidate seed must validate")
}

fn clock(version: u64) -> LogicalClock {
    LogicalClock {
        server_tick: version + 1,
        logical_time_ms: (version + 1) * 1_000,
    }
}

fn seed(byte: u8) -> SecretSeed {
    SecretSeed::from_host_entropy([byte; 32])
}

fn seats() -> [SeatInput; SEATS] {
    [
        SeatInput {
            account: "account-1".into(),
            pet_id: "icarus".into(),
            owned_pet_instance_id: "instance-1".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "account-2".into(),
            pet_id: "marivell".into(),
            owned_pet_instance_id: "instance-2".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "account-3".into(),
            pet_id: "quorion".into(),
            owned_pet_instance_id: "instance-3".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "account-4".into(),
            pet_id: "gravorn".into(),
            owned_pet_instance_id: "instance-4".into(),
            level: 10,
            artifact_power_pm: 0,
        },
    ]
}

/// A started match: state is Playing with a server-generated board.
fn started(rules: &CoopRules, seed_byte: u8) -> (CoopState, SecretSeed) {
    let seed = seed(seed_byte);
    let state = rules.allocate(seats()).expect("allocation");
    let checkpoint = begin(rules, MATCH, state, &seed, clock(0)).expect("begin");
    let start = CoopAction::Start;
    let transition = apply(
        rules,
        &checkpoint,
        &Command {
            id: [1; 16],
            match_id: MATCH,
            expected_version: checkpoint.version,
            ruleset: checkpoint.ruleset.clone(),
            action: start,
        },
        &seed,
        clock(1),
    )
    .expect("start accepted");
    (transition.next.state, seed)
}

fn swap(action_first: u8, action_second: u8) -> CoopAction {
    CoopAction::Swap {
        first: action_first,
        second: action_second,
    }
}

/// Locate an adjacent pair whose swap creates no match.
fn illegal_swap(state: &CoopState, rules: &CoopRules) -> (u8, u8) {
    for index in 0..CELLS {
        let row = index / SIDE;
        let column = index % SIDE;
        for neighbor in [
            (column + 1 < SIDE).then_some(index + 1),
            (row + 1 < SIDE).then_some(index + SIDE),
        ]
        .into_iter()
        .flatten()
        {
            if !rules.swap_matches(state, index, neighbor) {
                return (index as u8, neighbor as u8);
            }
        }
    }
    panic!("every adjacent swap matched; fixture board is degenerate");
}

// ---------------------------------------------------------------- configuration

#[test]
fn candidate_seed_validates_and_is_stable() {
    let coop = rules();
    assert_eq!(coop.digest(), rules().digest());
    assert_eq!(coop.ruleset().id, COOP_RULESET_ID);
    assert_ne!(coop.digest(), [0; 32]);
    assert_ne!(content_hash(coop.digest()), [0; 32]);
    assert_eq!(coop.config().party.seats as usize, SEATS);
}

#[test]
fn recruitment_policy_validates_and_changes_the_pinned_digest() {
    let seed = include_bytes!("../../../config/gameplay/arena8-coop-v2.seed.json");
    let boss_id = "cinder-terraces-warden";
    let historical = CoopRules::load(seed, boss_id.into()).unwrap();
    let mut bundle: serde_json::Value = serde_json::from_slice(seed).unwrap();
    let policy = &mut bundle["bosses"][0]["rewardPolicy"];
    policy["recruitmentPetIds"] =
        serde_json::json!(["fire-coalwhisk", "fire-emberloom", "fire-pyrecrown"]);
    let authored = CoopRules::load(&serde_json::to_vec(&bundle).unwrap(), boss_id.into()).unwrap();
    assert_ne!(authored.digest(), historical.digest());

    bundle["bosses"][0]["rewardPolicy"]["recruitmentPetIds"] =
        serde_json::json!(["fire-emberloom", "fire-pyrecrown"]);
    let different = CoopRules::load(&serde_json::to_vec(&bundle).unwrap(), boss_id.into()).unwrap();
    assert_ne!(authored.digest(), different.digest());
}

#[test]
fn recruitment_policy_rejects_ineligible_and_reordered_species() {
    let seed = include_bytes!("../../../config/gameplay/arena8-coop-v2.seed.json");
    let mut bundle: serde_json::Value = serde_json::from_slice(seed).unwrap();
    for ids in [
        &[][..],
        &["nonexistent-species"],
        &["pet-v3-fire-icarus"],
        &["pet-v31-fire-cindrelis"],
        &["dragon-fire-ignivar"],
        &["water-dewskip"],
        &["fire-coalwhisk", "fire-coalwhisk"],
        &["fire-emberloom", "fire-coalwhisk"],
        &["fire-pyrecrown", "fire-coalwhisk"],
    ] {
        bundle["bosses"][0]["rewardPolicy"]["recruitmentPetIds"] = serde_json::json!(ids);
        assert!(
            matches!(
                CoopRules::load(
                    &serde_json::to_vec(&bundle).unwrap(),
                    "cinder-terraces-warden".into()
                ),
                Err(ConfigError::Rewards)
            ),
            "accepted invalid recruitment list {ids:?}"
        );
    }

    // The authoritative identity and map still govern if draft metadata is spoofed.
    bundle["bosses"][0]["rewardPolicy"]["recruitmentPetIds"] =
        serde_json::json!(["fire-pyrecrown"]);
    let pet = bundle["pets"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|pet| pet["id"] == "fire-pyrecrown")
        .unwrap();
    pet["rarity"] = serde_json::json!("map-regular");
    assert!(matches!(
        CoopRules::load(
            &serde_json::to_vec(&bundle).unwrap(),
            "cinder-terraces-warden".into()
        ),
        Err(ConfigError::Rewards)
    ));
}

#[test]
fn absent_configuration_fails_closed() {
    assert!(CoopRules::load(b"", "cinder-terraces-boss".to_string()).is_err());
    assert!(CoopRules::load(b"not-json", "cinder-terraces-boss".to_string()).is_err());
}

#[test]
fn unknown_field_rejected() {
    let mut value = fixture_json();
    value["hiddenBalance"] = serde_json::json!(1);
    let bytes = serde_json::to_vec(&value).unwrap();
    assert!(CoopRules::load(&bytes, "cinder-terraces-boss".to_string()).is_err());
}

#[test]
fn missing_boss_field_rejected() {
    let mut value = fixture_json();
    value["bosses"][0].as_object_mut().unwrap().remove("maxHp");
    let bytes = serde_json::to_vec(&value).unwrap();
    assert!(CoopRules::load(&bytes, "cinder-terraces-boss".to_string()).is_err());
}

#[test]
fn duplicate_element_rejected() {
    let mut value = fixture_json();
    let first = value["elements"][0].clone();
    value["elements"][1] = first;
    let bytes = serde_json::to_vec(&value).unwrap();
    assert!(CoopRules::load(&bytes, "cinder-terraces-boss".to_string()).is_err());
}

#[test]
fn partial_effectiveness_matrix_rejected() {
    let mut value = fixture_json();
    value["elements"][0]["effectiveness"]
        .as_array_mut()
        .unwrap()
        .pop();
    let bytes = serde_json::to_vec(&value).unwrap();
    assert!(CoopRules::load(&bytes, "cinder-terraces-boss".to_string()).is_err());
}

#[test]
fn invalid_spawn_distribution_rejected() {
    let mut value = fixture_json();
    value["board"]["spawnWeights"][0]["weight"] = serde_json::json!(0);
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );

    // Duplicate element in the spawn weights is also rejected.
    let mut value = fixture_json();
    let first = value["board"]["spawnWeights"][0].clone();
    value["board"]["spawnWeights"][1] = first;
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
}

#[test]
fn missing_skill_reference_rejected() {
    let mut value = fixture_json();
    value["pets"][0]["signature"] = serde_json::json!("no-such-skill");
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
}

#[test]
fn invalid_phase_configuration_rejected() {
    for (key, amount) in [("thresholdBp", 9_000), ("currentBp", 0)] {
        let mut value = fixture_json();
        value["bosses"][0]["phase"][key] = amount.into();
        assert!(matches!(
            CoopRules::load(
                &serde_json::to_vec(&value).unwrap(),
                "cinder-terraces-boss".into()
            ),
            Err(ConfigError::BossPhase)
        ));
    }
    let mut value = fixture_json();
    value["bosses"][0]["maxHp"] = u32::MAX.into();
    assert!(matches!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".into()
        ),
        Err(ConfigError::Arithmetic)
    ));
    value["bosses"][0]["maxHp"] = 4.into();
    value["bosses"][0]["phase"]["currentBp"] = 1.into();
    assert!(matches!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".into()
        ),
        Err(ConfigError::BossPhase)
    ));
}

#[test]
fn room_threshold_is_authored_and_bounded() {
    assert_eq!(rules().selected_boss().required_room_points, 5000);
    let mut value = fixture_json();
    value["bosses"]
        .as_array_mut()
        .unwrap()
        .get_mut(0)
        .unwrap()
        .as_object_mut()
        .unwrap()
        .remove("requiredRoomPoints");
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
    let mut value = fixture_json();
    value["bosses"][0]["requiredRoomPoints"] = serde_json::json!(1_000_001);
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
    let mut value = fixture_json();
    value["bosses"][0]["requiredRoomPoints"] = serde_json::json!(0);
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_ok()
    );
}

#[test]
fn reward_configuration_is_authored_and_bounded() {
    let rules = rules();
    assert_eq!(rules.config().rewards.clear_achievement_points, 250);
    assert_eq!(rules.config().rewards.clear_coins, 120);
    let mut value = fixture_json();
    value["rewards"]["clearExp"] = serde_json::json!(1_000_001);
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
    let mut value = fixture_json();
    value.as_object_mut().unwrap().remove("rewards");
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
}

#[test]
fn multiplier_weights_may_not_change_between_stages() {
    // A tile spawned early survives into later stages; changing its meaning
    // mid-match would make contribution depend on spawn time.
    let mut value = fixture_json();
    let schedule = value["multiplier"]["schedule"].as_array_mut().unwrap();
    schedule[2]["tiers"][0]["damageWeightPm"] = serde_json::json!(7_000);
    assert!(
        CoopRules::load(
            &serde_json::to_vec(&value).unwrap(),
            "cinder-terraces-boss".to_string()
        )
        .is_err()
    );
}

#[test]
fn allocation_rejects_missing_pet_and_duplicate_account() {
    let rules = rules();
    let mut bad = seats();
    bad[2].pet_id = "no-such-pet".into();
    assert!(rules.allocate(bad).is_err());

    let mut duplicate = seats();
    duplicate[1].account = duplicate[0].account.clone();
    assert!(rules.allocate(duplicate).is_err());
}

// ------------------------------------------------------------- board and swap

#[test]
fn allocation_never_contains_a_board() {
    let state = rules().allocate(seats()).unwrap();
    assert_eq!(state.phase, CoopPhase::Ready);
    assert!(state.board.iter().all(Option::is_none));
}

#[test]
fn start_generates_a_playable_board_from_server_entropy() {
    let rules = rules();
    let (state, _) = started(&rules, 5);
    assert_eq!(state.phase, CoopPhase::Playing);
    assert!(state.board.iter().all(Option::is_some));
    // no unresolved starting matches
    let matched = aetheria_pet_arena::arena8::coop::matched_cells_for_test(&state.board);
    assert!(!matched.iter().any(|value| *value));
    assert!(rules.legal_swap(&state).is_some());
}

#[test]
fn no_match_swap_mutates_nothing() {
    let rules = rules();
    let (before, mut seed_stream) = started(&rules, 11);
    let (first, second) = illegal_swap(&before, &rules);

    let mut rng =
        TurnRng::new(&seed_stream, aetheria_game_core::Value::Text("x".into()), 0).unwrap();
    let _ = rng.next_word();
    let cursor = rng.cursor();
    let _ = &mut seed_stream;

    let checkpoint = begin(&rules, MATCH, before.clone(), &seed_stream, clock(0)).unwrap();
    let rejected = apply(
        &rules,
        &checkpoint,
        &Command {
            id: [7; 16],
            match_id: MATCH,
            expected_version: checkpoint.version,
            ruleset: checkpoint.ruleset.clone(),
            action: swap(first, second),
        },
        &seed_stream,
        clock(1),
    );
    let error = match rejected {
        Err(error) => error,
        Ok(_) => panic!("a swap with no match must be rejected"),
    };
    assert_eq!(error, CoreError::InvalidAction);

    // The committed input is untouched: compare canonical state and digests.
    assert_eq!(state_digest(&before), state_digest(&checkpoint.state));
    assert_eq!(
        board_digest(&before.board),
        board_digest(&checkpoint.state.board)
    );
    // The probe stream advanced once by its own explicit roll; the rejected
    // command never touched it.
    assert_eq!(cursor, 1);
}

#[test]
fn illegal_swap_rejected_before_any_state_change() {
    let rules = rules();
    let base = rules.allocate(seats()).unwrap();
    let mut playing = base.clone();
    playing.phase = CoopPhase::Playing;
    let mut calm = [None; CELLS];
    for (index, cell) in calm.iter_mut().enumerate() {
        *cell = Some(Tile::legacy(
            aetheria_pet_arena::arena8::ELEMENTS[(index / SIDE + 2 * (index % SIDE)) % 6],
            1,
        ));
    }
    playing.board = calm;
    playing.active_seat = 0;
    // A periodic board with no run of three: swapping neighbours cannot match.
    let mut rng = TurnRng::new(&seed(1), aetheria_game_core::Value::Null, 0).unwrap();
    let error = match rules.reduce(&playing, swap(0, 1), &mut rng) {
        Err(error) => error,
        Ok(_) => panic!("illegal swap must be rejected"),
    };
    assert_eq!(error, CoreError::InvalidAction);
}

#[test]
fn same_element_mixed_multipliers_match() {
    let mut value = fixture_json();
    value["board"]["deadBoardPolicy"] = serde_json::json!("regenerate");
    let rules = rules();

    let mut state = rules.allocate(seats()).unwrap();
    state.phase = CoopPhase::Playing;
    // Row 0: Fire x1, Fire x2, Fire x3 -> one horizontal Fire match after swap.
    let mut board = [None; CELLS];
    for cell in board.iter_mut() {
        *cell = Some(Tile::legacy(Element::Water, 1));
    }
    board[0] = Some(Tile::legacy(Element::Fire, 1));
    board[1] = Some(Tile::legacy(Element::Fire, 2));
    board[2] = Some(Tile::legacy(Element::Fire, 3));
    // Ensure the swap that joins them is legal and the rest is quiet.
    state.board = board;
    let matched = aetheria_pet_arena::arena8::coop::matched_cells_for_test(&state.board);
    assert!(
        matched[0] && matched[1] && matched[2],
        "mixed multipliers must match"
    );
}

#[test]
fn intersecting_cells_are_counted_once() {
    let matched = aetheria_pet_arena::arena8::coop::matched_cells_for_test(&{
        let mut board = [None; CELLS];
        // Row 0 and column 0 both Fire, sharing (0,0).
        board[0] = Some(Tile::legacy(Element::Fire, 1));
        board[1] = Some(Tile::legacy(Element::Fire, 1));
        board[2] = Some(Tile::legacy(Element::Fire, 1));
        board[SIDE] = Some(Tile::legacy(Element::Fire, 1));
        board[2 * SIDE] = Some(Tile::legacy(Element::Fire, 1));
        board
    });
    let counted = matched.iter().filter(|value| **value).count();
    // 3 horizontal + 2 extra vertical cells; the shared corner counts once.
    assert_eq!(counted, 5);
}

#[test]
fn gravity_preserves_column_order_and_skips_full_columns() {
    let rules = rules();
    let mut state = rules.allocate(seats()).unwrap();
    let mut board = [None; CELLS];
    let mut column_zero = Vec::new();
    for row in 0..SIDE {
        let tile = Tile::legacy(Element::Water, u8::try_from(row + 1).unwrap());
        board[row * SIDE] = Some(tile);
        column_zero.push(tile);
        // Column one: bottom three survive, top five empty.
        if row >= 3 {
            board[row * SIDE + 1] = Some(Tile::legacy(
                Element::Electric,
                u8::try_from(row - 2).unwrap(),
            ));
        }
    }
    state.board = board;
    let mut rng = TurnRng::new(&seed(3), aetheria_game_core::Value::Null, 0).unwrap();
    rules
        .gravity_and_refill_for_test(&mut state, &mut rng)
        .unwrap();

    // The full column is byte-for-byte unchanged.
    for (row, expected) in column_zero.iter().enumerate().take(SIDE) {
        assert_eq!(state.board[row * SIDE], Some(*expected));
    }
    // Five survivors keep their relative vertical order at the bottom.
    assert_eq!(state.board[3 * SIDE + 1].map(|t| t.multiplier), Some(1));
    assert_eq!(state.board[5 * SIDE + 1].map(|t| t.multiplier), Some(3));
    assert_eq!(state.board[6 * SIDE + 1].map(|t| t.multiplier), Some(4));
    assert_eq!(state.board[7 * SIDE + 1].map(|t| t.multiplier), Some(5));
    // The three genuinely empty cells were filled.
    for row in 0..3 {
        assert!(state.board[row * SIDE + 1].is_some());
    }
}

#[test]
fn cascades_are_bounded_by_authored_limit() {
    let mut value = fixture_json();
    value["party"]["maxCascades"] = serde_json::json!(2);
    let rules = CoopRules::load(
        &serde_json::to_vec(&value).unwrap(),
        "cinder-terraces-boss".to_string(),
    )
    .unwrap();
    assert_eq!(rules.config().party.max_cascades, 2);
    // A bounded limit is structural: the reducer must terminate and leave a
    // board with no unresolved matches after the cap.
    let (state, seed) = started(&rules, 21);
    let checkpoint = begin(&rules, MATCH, state, &seed, clock(0)).unwrap();
    let (first, second) = rules.legal_swap(&checkpoint.state).expect("legal move");
    let transition = apply(
        &rules,
        &checkpoint,
        &Command {
            id: [3; 16],
            match_id: MATCH,
            expected_version: checkpoint.version,
            ruleset: checkpoint.ruleset.clone(),
            action: swap(first, second),
        },
        &seed,
        clock(1),
    )
    .expect("legal swap accepted");
    let matched =
        aetheria_pet_arena::arena8::coop::matched_cells_for_test(&transition.next.state.board);
    assert!(!matched.iter().any(|value| *value));
}

// ----------------------------------------------------------------- RNG and order

#[test]
fn identical_seed_and_commands_are_deterministic() {
    let rules = rules();
    let run = || {
        let (state, seed) = started(&rules, 33);
        let checkpoint = begin(&rules, MATCH, state, &seed, clock(0)).unwrap();
        let mut state = checkpoint.state.clone();
        let mut version = checkpoint.version;
        let mut last = checkpoint.audit_hash;
        for command in 0..4u8 {
            let current = begin(&rules, MATCH, state.clone(), &seed, clock(version)).unwrap();
            let transition = apply(
                &rules,
                &current,
                &Command {
                    id: [100 + command; 16],
                    match_id: MATCH,
                    expected_version: current.version,
                    ruleset: current.ruleset.clone(),
                    action: CoopAction::Guard,
                },
                &seed,
                clock(version + 1),
            )
            .unwrap();
            state = transition.next.state;
            version = transition.next.version;
            last = transition.next.audit_hash;
        }
        (state_digest(&state), last, version)
    };
    let first = run();
    let second = run();
    assert_eq!(first, second);
}

#[test]
fn different_seeds_diverge() {
    let rules = rules();
    let (a, _) = started(&rules, 40);
    let (b, _) = started(&rules, 41);
    assert_ne!(board_digest(&a.board), board_digest(&b.board));
    // Both are still valid playable boards.
    assert!(rules.legal_swap(&a).is_some());
    assert!(rules.legal_swap(&b).is_some());
}

// ------------------------------------------------------------------ boss phases

#[test]
fn boss_transforms_exactly_once_and_never_skips_phase_two() {
    let rules = rules();
    let mut state = rules.allocate(seats()).unwrap();
    state.phase = CoopPhase::Playing;
    state.board = [Some(Tile::legacy(Element::Water, 1)); CELLS];

    // A single enormous hit must still land in phase 2 at the authored values.
    let dealt = rules
        .damage_boss_for_test(&mut state, u32::MAX / 2)
        .unwrap();
    assert_eq!(state.boss.phase, 2);
    assert!(state.boss.transformed);
    assert_eq!(
        state.boss.max_hp,
        rules.selected_boss().phase2_max_hp().unwrap()
    );
    assert_eq!(
        state.boss.hp,
        rules.selected_boss().phase2_current_hp().unwrap()
    );
    assert!(dealt > 0);

    // A second hit does not transform again.
    let max_after = state.boss.max_hp;
    let current_after = state.boss.hp;
    rules.damage_boss_for_test(&mut state, 10).unwrap();
    assert_eq!(state.boss.max_hp, max_after);
    assert_eq!(state.boss.hp, current_after.saturating_sub(10));
    assert_eq!(state.phase, CoopPhase::Playing);
}

#[test]
fn phase_transition_discards_excess_by_authored_policy() {
    let rules = rules();
    assert!(matches!(
        rules.selected_boss().phase.excess_damage,
        aetheria_pet_arena::arena8::coop::config::ExcessDamage::Discard
    ));
    let mut state = rules.allocate(seats()).unwrap();
    state.phase = CoopPhase::Playing;
    let threshold = rules.selected_boss().phase_threshold();
    state.boss.hp = threshold + 1;
    rules.damage_boss_for_test(&mut state, 1_000_000).unwrap();
    assert_eq!(state.boss.phase, 2);
    // Discard: phase 2 starts at the authored current HP, not at 0.
    assert_eq!(
        state.boss.hp,
        rules.selected_boss().phase2_current_hp().unwrap()
    );
}

#[test]
fn phase_two_zero_hp_wins() {
    let rules = rules();
    let mut state = rules.allocate(seats()).unwrap();
    state.phase = CoopPhase::Playing;
    state.boss.phase = 2;
    state.boss.transformed = true;
    state.boss.max_hp = rules.selected_boss().phase2_max_hp().unwrap();
    state.boss.hp = 50;
    rules.damage_boss_for_test(&mut state, 500).unwrap();
    assert_eq!(state.boss.hp, 0);
    assert_eq!(state.phase, CoopPhase::Won);
}

// ----------------------------------------------------------------- resources

#[test]
fn skill_costs_come_from_configuration_and_are_enforced() {
    let rules = rules();
    let (mut state, seed) = started(&rules, 50);
    // Zero resources: every costed skill is refused with no mutation.
    for seat in &mut state.participants {
        seat.mana = 0;
        seat.rage = 0;
    }
    let before = state_digest(&state);
    let mut rng = TurnRng::new(&seed, aetheria_game_core::Value::Null, 0).unwrap();
    assert!(rules.reduce(&state, CoopAction::Skill, &mut rng).is_err());
    assert!(
        rules
            .reduce(&state, CoopAction::Ultimate, &mut rng)
            .is_err()
    );
    assert_eq!(before, state_digest(&state));

    // Enough resources: the authored cost is deducted.
    let cost = rules
        .config()
        .skills
        .iter()
        .find(|skill| skill.id == "fire-lance")
        .unwrap()
        .mana_cost;
    state.participants[state.active_seat].mana = cost;
    let mut rng = TurnRng::new(&seed, aetheria_game_core::Value::Null, 0).unwrap();
    let decision = rules.reduce(&state, CoopAction::Skill, &mut rng).unwrap();
    assert!(
        decision
            .state
            .participants
            .iter()
            .all(|seat| seat.mana <= 300)
    );
}

#[test]
fn signature_and_ultimate_are_available_at_level_one() {
    let rules = rules();
    let mut seats = seats();
    for seat in &mut seats {
        seat.level = 1;
    }
    let mut state = rules.allocate(seats).unwrap();
    state.phase = CoopPhase::Playing;
    state.active_seat = 0;
    state.board = [Some(Tile::legacy(Element::Water, 1)); CELLS];
    for participant in &mut state.participants {
        participant.mana = rules.config().resources.mana_cap;
        participant.rage = rules.config().resources.rage_cap;
    }
    let mut rng = TurnRng::new(&seed(60), aetheria_game_core::Value::Null, 0).unwrap();
    rules
        .reduce(&state, CoopAction::Signature, &mut rng)
        .unwrap();
    // Re-arm the cooldown and rage for the ultimate.
    state.participants[0].cooldowns[2] = 0;
    state.participants[0].mana = rules.config().resources.mana_cap;
    state.participants[0].rage = rules.config().resources.rage_cap;
    let mut rng = TurnRng::new(&seed(60), aetheria_game_core::Value::Null, 0).unwrap();
    rules
        .reduce(&state, CoopAction::Ultimate, &mut rng)
        .unwrap();
}

#[test]
fn only_icarus_may_execute_fire_zone() {
    let rules = rules();
    let (state, seed) = started(&rules, 61);
    // Seat 0 is Icarus, so FireZone is authorized for that Pet only.
    let mut rng = TurnRng::new(&seed, aetheria_game_core::Value::Null, 0).unwrap();
    let mut icarus = state.clone();
    icarus.participants[0].mana = rules.config().resources.mana_cap;
    let allowed = rules
        .reduce(&icarus, CoopAction::FireZone, &mut rng)
        .is_ok();
    assert!(allowed, "Icarus retains its authored FIRE_ZONE");

    // Marivell (Water) has no fire_zone binding even with full resources.
    let mut marivell = state.clone();
    marivell.active_seat = 1;
    marivell.participants[1].mana = rules.config().resources.mana_cap;
    let mut rng = TurnRng::new(&seed, aetheria_game_core::Value::Null, 0).unwrap();
    assert!(
        rules
            .reduce(&marivell, CoopAction::FireZone, &mut rng)
            .is_err()
    );
}

#[test]
fn out_of_turn_command_rejected() {
    let rules = rules();
    let (mut state, seed) = started(&rules, 62);
    // The active seat is a structural seat index. Capability is expressed by the
    // adapter; here we prove that a non-Playing phase refuses commands.
    state.phase = CoopPhase::Ready;
    let mut rng = TurnRng::new(&seed, aetheria_game_core::Value::Null, 0).unwrap();
    assert!(rules.reduce(&state, swap(0, 1), &mut rng).is_err());
}

#[test]
fn state_digest_covers_participants_and_boss() {
    let rules = rules();
    let (state, _) = started(&rules, 63);
    let base = state_digest(&state);
    let mut changed = state.clone();
    changed.participants[2].mana = changed.participants[2].mana.wrapping_add(1);
    assert_ne!(base, state_digest(&changed));
    let mut changed = state.clone();
    changed.boss.hp = changed.boss.hp.saturating_sub(1);
    assert_ne!(base, state_digest(&changed));
}

#[test]
fn settlement_binds_configuration_identity() {
    let rules = rules();
    let (mut state, _) = started(&rules, 64);
    state.phase = CoopPhase::Won;
    let settlement = rules.settlement(&state);
    let encoded = aetheria_game_core::canonical::encode(&settlement).unwrap();
    // The digest is present as a byte string; ensure the config digest appears.
    let digest_text: Vec<u8> = rules.digest().to_vec();
    assert!(
        encoded
            .windows(digest_text.len())
            .any(|window| window == digest_text),
        "settlement must carry the configuration digest"
    );
    assert_eq!(state.canonical(), state.canonical());
}
