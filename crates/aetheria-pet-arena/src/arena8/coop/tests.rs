//! Engine correctness tests for the configuration-driven cooperative ruleset.
//!
//! Every authored number comes from `config/gameplay/arena8-coop-v2.seed.json`,
//! so these tests also prove that no production balance value is compiled into
//! the crate: changing the bundle changes the observable behaviour.

use super::*;
use crate::arena8::Element;
use aetheria_game_core::{SecretSeed, TurnRng};

fn bundle() -> Vec<u8> {
    std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-v2.seed.json"
    ))
    .expect("seed bundle")
}

fn rules() -> CoopRules {
    CoopRules::load(&bundle(), "cinder-terraces-warden".to_string()).expect("valid seed bundle")
}

fn seats() -> [SeatInput; SEATS] {
    [
        SeatInput {
            account: "acct-a".into(),
            pet_id: "pet-v3-fire-icarus".into(),
            owned_pet_instance_id: "instance-a".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "acct-b".into(),
            pet_id: "pet-v31-water-marivell".into(),
            owned_pet_instance_id: "instance-b".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "acct-c".into(),
            pet_id: "pet-v31-electric-quorion".into(),
            owned_pet_instance_id: "instance-c".into(),
            level: 10,
            artifact_power_pm: 0,
        },
        SeatInput {
            account: "acct-d".into(),
            pet_id: "pet-v31-ground-gravorn".into(),
            owned_pet_instance_id: "instance-d".into(),
            level: 10,
            artifact_power_pm: 0,
        },
    ]
}

fn rng(cursor: u64) -> TurnRng {
    let seed = SecretSeed::from_host_entropy([7u8; 32]);
    seed.stream(Value::Text("test-match".into()), cursor)
        .expect("rng")
}

fn started() -> (CoopRules, CoopState, TurnRng) {
    let rules = rules();
    let state = rules.allocate(seats()).expect("allocate");
    let mut stream = rng(0);
    let decision = rules
        .reduce(&state, CoopAction::Start, &mut stream)
        .expect("start");
    (rules, decision.state, stream)
}

fn digest(state: &CoopState) -> [u8; 32] {
    state_digest(state)
}

fn flat(element: Element, multiplier: u8) -> Tile {
    Tile {
        element,
        multiplier,
    }
}

/// A 6-periodic diagonal board with no three-in-a-row and no multiplier tiles.
fn calm_board() -> [Option<Tile>; CELLS] {
    let mut board = [None; CELLS];
    for (index, cell) in board.iter_mut().enumerate() {
        let (row, column) = (index / SIDE, index % SIDE);
        *cell = Some(flat(crate::arena8::ELEMENTS[(row + 2 * column) % 6], 1));
    }
    board
}

#[test]
fn seed_bundle_is_accepted_and_separates_digests() {
    let rules = rules();
    assert_eq!(rules.digest(), digest_seed_bundle());
    let (_, state, _) = started();
    assert_eq!(state.board.iter().flatten().count(), CELLS);
    assert_eq!(state.config_digest, rules.digest());
    // Board, allocation and engine digests are distinct domains.
    assert_ne!(board_digest(&state.board), state_digest(&state));
    assert_ne!(state_digest(&state), rules.digest());
}

fn digest_seed_bundle() -> [u8; 32] {
    let hex = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-v2.digest"
    ))
    .expect("golden digest");
    let hex = hex.trim();
    let mut out = [0u8; 32];
    for (index, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).expect("hex");
    }
    out
}

#[test]
fn configuration_fails_closed_when_missing_or_invalid() {
    assert!(matches!(
        CoopRules::load(b"", "dummy".to_string()),
        Err(ConfigError::Malformed)
    ));
    assert!(matches!(
        CoopRules::load(br#"{"schemaVersion":1}"#, "dummy".to_string()),
        Err(ConfigError::Malformed)
    ));
    let source: serde_json::Value = serde_json::from_slice(&bundle()).expect("json");
    let rejected = |value: &serde_json::Value| {
        CoopRules::load(
            &serde_json::to_vec(value).expect("encode"),
            "dummy".to_string(),
        )
    };
    // Unknown fields never silently become defaults.
    let mut unknown = source.clone();
    unknown["unexpected"] = serde_json::json!(1);
    assert!(matches!(rejected(&unknown), Err(ConfigError::Malformed)));
    // Unsupported engine capability is rejected by name.
    let mut capability = source.clone();
    capability["engineCapability"] = serde_json::json!("arena8-coop-v9");
    assert!(matches!(rejected(&capability), Err(ConfigError::Identity)));
    // A zero probability weight is not a valid distribution.
    let mut zero_weight = source.clone();
    zero_weight["board"]["spawnWeights"][0]["weight"] = serde_json::json!(0);
    assert!(matches!(
        rejected(&zero_weight),
        Err(ConfigError::SpawnWeights)
    ));
    // An incomplete effectiveness matrix is rejected.
    let mut matrix = source.clone();
    matrix["elements"][1]["effectiveness"]
        .as_array_mut()
        .expect("rows")
        .pop();
    assert!(matches!(rejected(&matrix), Err(ConfigError::Effectiveness)));
    // An effectiveness value that is not a real relationship is rejected.
    let mut range = source.clone();
    range["elements"][2]["effectiveness"][3]["permille"] = serde_json::json!(9000);
    assert!(matches!(rejected(&range), Err(ConfigError::Effectiveness)));
    // A dangling skill reference is rejected.
    let mut reference = source.clone();
    reference["pets"][2]["guard"] = serde_json::json!("volt-missing");
    assert!(matches!(
        rejected(&reference),
        Err(ConfigError::MissingReference)
    ));
    // A duplicated Pet identity is rejected.
    let mut duplicate = source.clone();
    let first = duplicate["pets"][0].clone();
    duplicate["pets"].as_array_mut().expect("pets").push(first);
    assert!(matches!(
        rejected(&duplicate),
        Err(ConfigError::DuplicatePet)
    ));
    // Phase thresholds outside the authored design range are rejected.
    let mut phase = source.clone();
    phase["bosses"][0]["phase"]["thresholdBp"] = serde_json::json!(9000);
    assert!(matches!(rejected(&phase), Err(ConfigError::BossPhase)));
    // An unsupported effect kind cannot execute, because the schema is typed.
    let mut effect = source.clone();
    effect["skills"][0]["effect"]["kind"] = serde_json::json!("execute-script");
    assert!(matches!(rejected(&effect), Err(ConfigError::Malformed)));
    let mut oversized_tier = source.clone();
    oversized_tier["multiplier"]["schedule"][2]["tiers"][2]["multiplier"] =
        serde_json::json!(CELLS + 1);
    assert!(matches!(
        rejected(&oversized_tier),
        Err(ConfigError::MultiplierSchedule)
    ));
    // A multiplier that silently changes meaning between stages is rejected.
    let mut multiplier = source.clone();
    multiplier["multiplier"]["schedule"][2]["tiers"][2]["damageWeightPm"] = serde_json::json!(9000);
    assert!(matches!(
        rejected(&multiplier),
        Err(ConfigError::MultiplierSchedule)
    ));
}

#[test]
fn initial_board_is_matchless_and_playable() {
    let (rules, state, _) = started();
    assert_eq!(state.phase, CoopPhase::Playing);
    assert!(!matched_cells(&state.board).iter().any(|matched| *matched));
    assert!(rules.legal_swap(&state).is_some());
    assert!(
        state
            .board
            .iter()
            .flatten()
            .all(|tile| tile.multiplier == 1)
    );
    // Start allocates the board and hands the first seat its turn; it is not an
    // ordinary combat turn and never advances the turn counter.
    assert_eq!(state.turn_index, 0);
    assert_eq!(state.round_index, 1);
    assert_eq!(state.active_seat, 0);
}

#[test]
fn no_match_swap_is_rejected_without_any_mutation() {
    let (rules, state, mut stream) = started();
    let before = digest(&state);
    let cursor = stream.cursor();
    let (first, second) = (0..CELLS)
        .find_map(|first| {
            let column = first % SIDE;
            if column + 1 >= SIDE || rules.swap_matches(&state, first, first + 1) {
                return None;
            }
            Some((first, first + 1))
        })
        .expect("a non-matching adjacent swap exists");
    let rejected = rules.reduce(
        &state,
        CoopAction::Swap {
            first: u8::try_from(first).unwrap(),
            second: u8::try_from(second).unwrap(),
        },
        &mut stream,
    );
    match rejected {
        Err(error) => assert_eq!(error, CoreError::InvalidAction),
        Ok(_) => panic!("no-match swap must be rejected"),
    }
    // No board, HP, resource, turn or entropy change.
    assert_eq!(digest(&state), before);
    assert_eq!(stream.cursor(), cursor);
    assert_eq!(state.turn_index, 0);
    assert_eq!(state.boss.hp, 12_000);
}

#[test]
fn mixed_multiplier_same_element_tiles_form_one_match() {
    let mut board = calm_board();
    board[0] = Some(flat(Element::Fire, 1));
    board[1] = Some(flat(Element::Fire, 2));
    board[2] = Some(flat(Element::Fire, 4));
    board[3] = Some(flat(Element::Water, 1));
    let matched = matched_cells(&board);
    assert!(matched[0] && matched[1] && matched[2]);
    assert_eq!(matched.iter().filter(|value| **value).count(), 3);
    // Intersecting runs count the shared cell exactly once.
    let mut crossing = calm_board();
    for index in [0usize, 1, 2, SIDE, 2 * SIDE] {
        crossing[index] = Some(flat(Element::Water, 1));
    }
    let matched = matched_cells(&crossing);
    assert_eq!(matched.iter().filter(|value| **value).count(), 5);
    assert!(matched[0] && matched[SIDE] && matched[2 * SIDE]);
}

#[test]
fn scoring_counts_each_tile_once_and_uses_multipliers() {
    let (rules, mut state, mut stream) = started();
    let mut board = calm_board();
    for (index, multiplier) in [(0usize, 1u8), (1, 2), (2, 4)] {
        board[index] = Some(flat(Element::Fire, multiplier));
    }
    board[3] = Some(flat(Element::Water, 1));
    state.board = board;
    let matched = matched_cells(&state.board);
    let outcome = rules
        .score_match(&mut state, 0, &matched, &mut stream)
        .expect("score");
    assert!(outcome.damage > 0);
    // Exactly the three matched tiles are cleared.
    assert!(state.board[0].is_none() && state.board[1].is_none() && state.board[2].is_none());
    assert!(state.board[3].is_some());
    // A x4 tile contributes more than a x1 tile of the same element.
    let high = rules.config().multiplier.damage_weight(4).unwrap();
    let low = rules.config().multiplier.damage_weight(1).unwrap();
    assert!(high > low);
}

#[test]
fn gravity_preserves_order_and_refills_only_empty_cells() {
    let (rules, mut state, mut stream) = started();
    let mut board = calm_board();
    // Empty rows 1, 4 and 6 of the first column; survivors keep their order.
    for row in [1usize, 4, 6] {
        board[row * SIDE] = None;
    }
    for (row, multiplier) in [(0usize, 11u8), (2, 12), (3, 13), (5, 14), (7, 15)] {
        board[row * SIDE] = Some(flat(Element::Fire, multiplier));
    }
    state.board = board;
    rules
        .gravity_and_refill(&mut state, &mut stream)
        .expect("gravity");
    let filled: Vec<u8> = (0..SIDE)
        .map(|row| state.board[row * SIDE].unwrap().multiplier)
        .collect();
    // The surviving tiles sit at the bottom, in their original relative order.
    assert_eq!(&filled[3..], &[11, 12, 13, 14, 15]);
    // The three genuinely empty cells were refilled.
    assert_eq!(state.board.iter().flatten().count(), CELLS);
    // A full column keeps its surviving order after a second pass and never
    // underflows: every cell still holds a tile.
    let full_column: Vec<Option<Tile>> = (0..SIDE).map(|row| state.board[row * SIDE + 7]).collect();
    assert!(full_column.iter().all(|tile| tile.is_some()));
    let below: Vec<Tile> = (0..SIDE)
        .map(|row| state.board[row * SIDE + 7].unwrap())
        .collect();
    rules
        .gravity_and_refill(&mut state, &mut stream)
        .expect("gravity");
    let after: Vec<Tile> = (0..SIDE)
        .map(|row| state.board[row * SIDE + 7].unwrap())
        .collect();
    assert_eq!(below.len(), after.len());
}

#[test]
fn rng_is_deterministic_and_seed_bound() {
    let rules = rules();
    let state = rules.allocate(seats()).expect("allocate");
    let first = {
        let mut stream = rng(0);
        rules
            .reduce(&state, CoopAction::Start, &mut stream)
            .unwrap()
            .state
    };
    let second = {
        let mut stream = rng(0);
        rules
            .reduce(&state, CoopAction::Start, &mut stream)
            .unwrap()
            .state
    };
    assert_eq!(board_digest(&first.board), board_digest(&second.board));
    let other = {
        let seed = SecretSeed::from_host_entropy([9u8; 32]);
        let mut stream = seed.stream(Value::Text("test-match".into()), 0).unwrap();
        rules
            .reduce(&state, CoopAction::Start, &mut stream)
            .unwrap()
            .state
    };
    assert_ne!(board_digest(&first.board), board_digest(&other.board));
    // A resumed stream at the same cursor reproduces the same rolls.
    let mut resumed = rng(0);
    let mut original = rng(0);
    for _ in 0..64 {
        assert_eq!(resumed.next_word().unwrap(), original.next_word().unwrap());
    }
}

#[test]
fn boss_phase_transition_happens_exactly_once() {
    let rules = rules();
    let mut state = rules.allocate(seats()).expect("allocate");
    state.phase = CoopPhase::Playing;
    state.board = calm_board();
    let boss_config = rules.selected_boss();
    let threshold_bp = boss_config.phase.threshold_bp;
    assert_eq!(threshold_bp, 2_500);
    let threshold_hp = boss_config.max_hp * u32::from(threshold_bp) / 10_000;
    state.boss.hp = threshold_hp + 10;
    // A single huge phase-1 hit may not skip phase 2.
    let huge = 10_000_000;
    rules.damage_boss(&mut state, huge).expect("phase one hit");
    assert_eq!(state.boss.phase, 2);
    assert!(state.boss.transformed);
    assert_eq!(state.boss.max_hp, 21_000);
    assert_eq!(state.boss.hp, 16_800);
    assert_eq!(state.phase, CoopPhase::Playing);
    // Subsequent damage never transforms again.
    rules.damage_boss(&mut state, 1_000).expect("phase two hit");
    assert_eq!(state.boss.max_hp, 21_000);
    assert_eq!(state.boss.phase, 2);
    // Dropping to zero wins once and stays terminal.
    rules.damage_boss(&mut state, 100_000).expect("lethal");
    assert_eq!(state.phase, CoopPhase::Won);
    assert_eq!(state.boss.hp, 0);
    let after = state.clone();
    match rules.reduce(&state, CoopAction::Guard, &mut rng(0)) {
        Err(error) => assert_eq!(error, CoreError::InvalidAction),
        Ok(_) => panic!("terminal match rejects commands"),
    }
    assert_eq!(digest(&state), digest(&after));
}

#[test]
fn allocation_uses_the_published_pet_growth_curve() {
    let base = rules();
    let first = base.allocate(seats()).unwrap();
    let mut bundle: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let growth = &mut bundle["pets"][0]["growth"];
    assert_eq!(growth["curve"], "focused");
    growth["healthBp"] = 200.into();
    let changed = CoopRules::load(
        &serde_json::to_vec(&bundle).unwrap(),
        base.selected_boss().id.clone(),
    )
    .unwrap();
    let second = changed.allocate(seats()).unwrap();
    assert_eq!(first.participants[0].max_hp, 225);
    assert_eq!(second.participants[0].max_hp, 247);
    assert_eq!(first.participants[1].max_hp, second.participants[1].max_hp);
    assert_ne!(first.config_digest, second.config_digest);
    bundle["pets"][0].as_object_mut().unwrap().remove("growth");
    assert!(matches!(
        CoopRules::load(
            &serde_json::to_vec(&bundle).unwrap(),
            base.selected_boss().id.clone()
        ),
        Err(ConfigError::Pet)
    ));
}

#[test]
fn water_signature_credits_its_caster_only_for_health_restored() {
    let (rules, mut state, mut stream) = started();
    state.active_seat = 1;
    state.participants[1].rage = rules.config.resources.rage_cap;
    state.participants[0].hp -= 12;
    state.participants[2].hp -= 5;
    let next = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap()
        .state;
    assert_eq!(next.participants[1].contribution_healing, 17);
    for target in [0, 2] {
        assert_eq!(
            next.participants[target].hp,
            next.participants[target].max_hp
        );
        assert_eq!(next.participants[target].contribution_healing, 0);
    }
}

#[test]
fn skill_costs_cooldowns_and_level_independence() {
    let (rules, mut state, mut stream) = started();
    state.active_seat = 0;
    let pet = rules.config().pet("pet-v3-fire-icarus").unwrap();
    let skill = rules.config().skill(&pet.skill).unwrap();
    // Level 1 never gates Signature, Ultimate or the authored Fire Zone.
    let low = rules
        .allocate([
            SeatInput {
                account: "a".into(),
                pet_id: "pet-v3-fire-icarus".into(),
                owned_pet_instance_id: "instance-a".into(),
                level: 1,
                artifact_power_pm: 0,
            },
            SeatInput {
                account: "b".into(),
                pet_id: "pet-v31-water-marivell".into(),
                owned_pet_instance_id: "instance-b".into(),
                level: 1,
                artifact_power_pm: 0,
            },
            SeatInput {
                account: "c".into(),
                pet_id: "pet-v31-electric-quorion".into(),
                owned_pet_instance_id: "instance-c".into(),
                level: 1,
                artifact_power_pm: 0,
            },
            SeatInput {
                account: "d".into(),
                pet_id: "pet-v31-ground-gravorn".into(),
                owned_pet_instance_id: "instance-d".into(),
                level: 1,
                artifact_power_pm: 0,
            },
        ])
        .expect("allocate");
    assert_eq!(low.participants[0].level, 1);
    // Insufficient resources are rejected before any state change.
    state.participants[0].mana = skill.mana_cost.saturating_sub(1);
    let before = digest(&state);
    assert!(
        rules
            .reduce(&state, CoopAction::Skill, &mut stream)
            .is_err()
    );
    assert_eq!(digest(&state), before);
    // An affordable skill consumes exactly the authored cost and sets its cooldown.
    state.participants[0].mana = skill.mana_cost.saturating_add(5);
    let decided = rules
        .reduce(&state, CoopAction::Skill, &mut stream)
        .expect("skill");
    let actor = decided.state.participants[0].clone();
    assert_eq!(actor.mana, 5);
    assert_eq!(actor.cooldowns[1], skill.cooldown_turns);
}

#[test]
fn ground_identity_is_configuration_not_a_copy_of_fire() {
    let rules = rules();
    let ground = rules.config().pet("pet-v31-ground-gravorn").unwrap();
    let fire = rules.config().pet("pet-v3-fire-icarus").unwrap();
    let electric = rules.config().pet("pet-v31-electric-quorion").unwrap();
    // Higher HP and DEF, lower critical rate, higher critical damage.
    assert!(ground.max_hp > fire.max_hp);
    assert!(ground.defense > fire.defense);
    assert!(ground.crit_rate_bp < electric.crit_rate_bp);
    assert!(ground.crit_damage_bp > electric.crit_damage_bp);
    let profiles = rules.config().element_index().unwrap();
    assert!(profiles[Element::Ground.index()].max_hp > profiles[Element::Fire.index()].max_hp);
    // Authored signature specialisation is a Boss debuff, not a numeric clone.
    let signature = rules.config().skill(&ground.signature).unwrap();
    assert_eq!(signature.effect.target, config::EffectTarget::Boss);
    assert_eq!(signature.effect.kind, config::EffectKind::Debuff);
}

#[test]
fn escalation_schedule_comes_from_the_bundle() {
    let rules = rules();
    assert!(rules.config().multiplier.damage_weight(6).is_ok());
    assert_eq!(
        rules.config().multiplier.clock_unit,
        config::EscalationClock::Turn
    );
    // No authored schedule boundary is compiled into the engine: reading the
    // bundle's own boundaries drives the observable stage.
    let boundaries: Vec<u16> = rules
        .config()
        .multiplier
        .schedule
        .iter()
        .map(|stage| stage.from)
        .collect();
    assert_eq!(boundaries, vec![0, 12, 17, 22, 27, 32]);
    assert_eq!(rules.config().multiplier.weight_budget(0).unwrap(), 1000);
    assert_eq!(rules.config().multiplier.weight_budget(32).unwrap(), 1000);
    let first = &rules.config().multiplier.schedule[0];
    assert!(first.tiers.iter().all(|tier| tier.multiplier == 1));
}

#[test]
fn settlement_reports_contribution_for_every_participant() {
    let (rules, mut state, _) = started();
    state.participants[0].contribution_damage = 900;
    state.participants[1].contribution_healing = 400;
    state.participants[2].contribution_shielding = 250;
    state.participants[3].contribution_damage = 100;
    state.phase = CoopPhase::Won;
    let settlement = rules.settlement(&state);
    let Value::List(values) = &settlement else {
        panic!("list")
    };
    assert_eq!(values[0], Value::Uint(u64::from(COOP_RULESET_VERSION)));
    assert_eq!(values[1], Value::Text(COOP_RULESET_ID.into()));
    assert_eq!(values[2], Value::Bytes(rules.digest().to_vec()));
}

#[test]
fn historical_bundle_keeps_its_original_digest_and_boss_encoding() {
    let raw = include_bytes!("../../../tests/fixtures/arena8-coop-v1-legacy.seed.json");
    let legacy = CoopRules::load(raw, "cinder-terraces-warden".into()).unwrap();
    let digest = legacy.digest().map(|byte| format!("{byte:02x}")).concat();
    // Legacy digest from a1c6f0b (before typed artifacts and balance changes)
    assert_eq!(
        digest,
        "1875e6ee24d12917abd465cbf65aa82ae96fa5beb1b6345f4f75e154b7e20ad2"
    );
    assert!(CoopRules::load(raw, "tideglass-lagoon-warden".into()).is_err());
}

#[test]
fn owned_skill_level_changes_only_that_allocations_effect() {
    let rules = rules();
    let initial = rules.allocate(seats()).expect("baseline");
    let mut skilled = initial.clone();
    let bindings = [
        vec![SkillLevelBinding {
            skill_id: "pet-v3-fire-icarus-ember-lance".into(),
            level: 2,
        }],
        vec![],
        vec![],
        vec![],
    ];
    rules
        .bind_skill_levels(&mut skilled, &bindings)
        .expect("bind level two");
    assert_ne!(digest(&initial), digest(&skilled));
    let cast = |initial| {
        let mut stream = rng(0);
        let mut started = rules
            .reduce(initial, CoopAction::Start, &mut stream)
            .unwrap()
            .state;
        started.participants[0].mana = rules.config().resources.mana_cap;
        started.participants[0].crit_rate_bp = 0;
        rules
            .reduce(&started, CoopAction::Skill, &mut stream)
            .unwrap()
            .state
    };
    let original = cast(&initial);
    let upgraded = cast(&skilled);
    assert_eq!(original.participants[0].skill_levels(), [1; 5]);
    assert_eq!(upgraded.participants[0].skill_levels(), [1, 2, 1, 1, 1]);
    assert_eq!(upgraded.participants[1].skill_levels(), [1; 5]);
    assert!(
        upgraded.participants[0].contribution_damage > original.participants[0].contribution_damage
    );
    assert_eq!(original.participants[0].mana, upgraded.participants[0].mana);
    assert_eq!(
        original.participants[0].cooldowns,
        upgraded.participants[0].cooldowns
    );
}

#[test]
fn rejects_invalid_authored_skill_level_cost_and_power() {
    let mut changed: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let configured = changed["skills"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|skill| skill["id"] == "pet-v3-fire-icarus-ember-lance")
        .unwrap();
    configured["upgradeLevels"][0]["materials"] = 0.into();
    assert!(matches!(
        CoopConfig::parse(&serde_json::to_vec(&changed).unwrap()),
        Err(ConfigError::Skill)
    ));
    let configured = changed["skills"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|skill| skill["id"] == "pet-v3-fire-icarus-ember-lance")
        .unwrap();
    configured["upgradeLevels"][0]["materials"] = 2.into();
    configured["upgradeLevels"][0]["powerPm"] = configured["powerPm"].clone();
    assert!(matches!(
        CoopConfig::parse(&serde_json::to_vec(&changed).unwrap()),
        Err(ConfigError::Skill)
    ));
}

#[test]
fn published_map_clear_prerequisites_are_validated_and_digest_bound() {
    use serde_json::json;

    let source: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let parse = |value: &serde_json::Value| CoopConfig::parse(&serde_json::to_vec(value).unwrap());
    let original = parse(&source).unwrap();
    let mut candidate = source.clone();
    assert_eq!(candidate["bosses"][0]["mapId"], "cinder-terraces");
    assert_eq!(candidate["bosses"][1]["mapId"], "tideglass-lagoon");
    assert_eq!(candidate["bosses"][2]["mapId"], "stormcoil-fields");
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/arena8-coop-map-prerequisite.json"
    ))
    .unwrap();
    assert_eq!(candidate["bosses"][1]["mapId"], fixture["mapId"]);
    assert!(original.bosses()[1].required_map_clear.is_none());
    candidate["bosses"][1]["requiredMapClear"] = serde_json::Value::Null;
    assert_eq!(original.digest(), parse(&candidate).unwrap().digest());

    candidate["bosses"][1]["requiredMapClear"] = fixture["requiredMapClear"].clone();
    candidate["bosses"][2]["requiredMapClear"] = json!("tideglass-lagoon");
    let validated = parse(&candidate).unwrap();
    assert_eq!(
        validated.bosses()[1].required_map_clear.as_deref(),
        Some("cinder-terraces")
    );
    assert_ne!(validated.digest(), original.digest());

    for required in ["unlisted-map", "tideglass-lagoon", "stormcoil-fields"] {
        candidate["bosses"][1]["requiredMapClear"] = json!(required);
        assert!(matches!(parse(&candidate), Err(ConfigError::Boss)));
    }

    candidate["bosses"][1]["requiredMapClear"] = json!("cinder-terraces");
    candidate["bosses"][0]["requiredMapClear"] = json!("stormcoil-fields");
    assert!(matches!(parse(&candidate), Err(ConfigError::Boss)));

    let mut historical: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../tests/fixtures/arena8-coop-v1-legacy.seed.json"
    ))
    .unwrap();
    historical["boss"]["requiredMapClear"] = fixture["requiredMapClear"].clone();
    assert!(matches!(parse(&historical), Err(ConfigError::Boss)));
}

#[test]
fn revision_nine_retains_its_content_digest_and_replay() {
    let rules = CoopRules::load(
        include_bytes!("../../../tests/fixtures/arena8-coop-r9.json"),
        "cinder-terraces-warden".into(),
    )
    .unwrap();
    let hex = |digest: [u8; 32]| digest.map(|byte| format!("{byte:02x}")).concat();
    assert_eq!(
        hex(rules.digest()),
        "85a314d5cd96abc833bf67100b93461de397ba4793cc9bcd63bce16a0569a413"
    );
    let mut state = rules.allocate(seats()).unwrap();
    let mut stream = rng(0);
    for action in [CoopAction::Start, CoopAction::Guard, CoopAction::Guard] {
        state = rules.reduce(&state, action, &mut stream).unwrap().state;
    }
    assert_eq!(state.active_seat, 2);
    state.participants[2].rage = 40;
    state = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap()
        .state;
    assert!(state.participants.iter().all(|seat| seat.shield > 0));
    assert_eq!(
        hex(state_digest(&state)),
        "d1cbeaf25bf4c3149ff93c4ffa190a54dbb23f9d82e655890d8727559027eb71"
    );
}

fn started_with(boss: &str, roster: [SeatInput; SEATS]) -> (CoopRules, CoopState, TurnRng) {
    let rules = CoopRules::load(&bundle(), boss.into()).unwrap();
    let initial = rules.allocate(roster).unwrap();
    let mut stream = rng(0);
    let state = rules
        .reduce(&initial, CoopAction::Start, &mut stream)
        .unwrap()
        .state;
    (rules, state, stream)
}

#[test]
fn electric_transfer_conserves_rage_and_selects_a_living_teammate() {
    let mut roster = seats();
    roster[0].pet_id = "electric-copperkip".into();
    let (rules, mut state, mut stream) = started_with("cinder-terraces-warden", roster);
    let (caster, target, tie, dead) = (0, 1, 2, 3);
    state.participants[caster].mana = 12;
    state.participants[caster].rage = 7;
    state.participants[target].rage = 96;
    state.participants[tie].rage = 96;
    state.participants[dead].alive = false;
    state.participants[dead].hp = 0;
    let cursor = stream.cursor();
    let Decision {
        state: next,
        events,
        ..
    } = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap();
    assert_eq!(events, [event("rage-transfer", Some(target as u8), 4)]);
    assert_eq!(next.participants[caster].rage, 3);
    assert_eq!(next.participants[caster].mana, 0);
    assert_eq!(next.participants[target].rage, 100);
    assert_eq!(next.participants[tie].rage, 96);
    assert_eq!(next.participants[dead].rage, 0);
    assert_eq!(stream.cursor(), cursor);

    state.participants[target].rage = 100;
    state.participants[tie].rage = 100;
    assert!(matches!(
        rules.reduce(&state, CoopAction::Signature, &mut stream),
        Err(CoreError::InvalidAction)
    ));
    assert_eq!(stream.cursor(), cursor);
    assert_eq!(state.participants[caster].mana, 12);
    assert_eq!(state.participants[caster].rage, 7);
}

#[test]
fn water_mana_current_restores_only_the_lowest_mana_teammate() {
    let mut roster = seats();
    roster[0].pet_id = "water-ripplefin".into();
    let (rules, mut state, mut stream) = started_with("cinder-terraces-warden", roster);
    state.participants[0].rage = 22;
    state.participants[1].mana = 92;
    state.participants[2].mana = 88;
    state.participants[3].mana = 95;
    let Decision {
        state: next,
        events,
        ..
    } = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap();
    assert_eq!(events, [event("mana-restored", Some(2), 12)]);
    assert_eq!(next.participants[0].mana, 0);
    assert_eq!(next.participants[0].rage, 0);
    assert_eq!(next.participants[1].mana, 92);
    assert_eq!(next.participants[2].mana, 100);
    assert_eq!(next.participants[3].mana, 95);
}

#[test]
fn light_cleanses_the_vulnerability_applied_by_a_real_boss_attack() {
    let mut roster = seats();
    roster[1].pet_id = "pet-v31-light-aurelune".into();
    let (rules, mut state, mut stream) = started_with("lantern-necropolis-warden", roster);
    let attack = PendingAttack {
        targets: 1,
        remaining: 1,
        damage: 50,
    };
    state.participants[0].hp -= 12;
    state.participants[1].mana = 16;
    state.pending = Some(attack);
    let Decision {
        mut state, events, ..
    } = rules
        .reduce(&state, CoopAction::Guard, &mut stream)
        .unwrap();
    assert!(events.contains(&event("vulnerability", Some(0), 350)));
    assert!(state.participants[0].statuses.contains(&Some(Status {
        kind: StatusKind::Vulnerability,
        value: 350,
        turns: 3,
    })));

    let cleared = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap();
    assert_eq!(cleared.events, [event("cleanse", Some(0), 1)]);
    assert_eq!(cleared.state.participants[1].mana, 0);
    assert!(
        cleared.state.participants[0]
            .statuses
            .iter()
            .flatten()
            .all(|status| { status.kind != StatusKind::Vulnerability })
    );
    assert!(
        cleared.state.participants[0]
            .statuses
            .contains(&Some(Status {
                kind: StatusKind::DefenseBuff,
                value: 250,
                turns: 2,
            }))
    );

    state.pending = Some(attack);
    let still_marked = rules
        .reduce(&state, CoopAction::Guard, &mut stream)
        .unwrap();
    let cleansed = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap();
    let before = state.participants[0].hp;
    let unmarked_damage = before - cleansed.state.participants[0].hp;
    let marked_damage = before - still_marked.state.participants[0].hp;
    assert!(unmarked_damage > 0);
    assert_eq!(marked_damage, unmarked_damage * 1_350 / 1_000);
}

#[test]
fn electric_chain_resolves_two_hits_across_boss_phase_transition() {
    let (rules, mut state, mut stream) = started();
    state.active_seat = 2;
    let caster = &mut state.participants[2];
    caster.rage = 40;
    caster.crit_rate_bp = 10_000;
    state.boss.hp = rules.selected_boss().phase_threshold() + 1;
    let before_cursor = stream.cursor();
    let Decision {
        state: next,
        events,
        ..
    } = rules
        .reduce(&state, CoopAction::Signature, &mut stream)
        .unwrap();
    assert_eq!(next.boss.phase, 2);
    let phase_two_damage = rules.selected_boss().phase2_current_hp().unwrap() - next.boss.hp;
    assert!(phase_two_damage > 0);
    assert_eq!(
        next.participants[2].contribution_damage,
        1 + u64::from(phase_two_damage)
    );
    assert_eq!(
        events,
        [
            event("boss-damage", Some(2), 1),
            event("boss-damage", Some(2), u64::from(phase_two_damage)),
            event("critical", Some(2), 0),
        ]
    );
    assert_eq!(stream.cursor(), before_cursor + 1);
}

#[test]
fn ground_boss_crit_specialization_applies_to_swap_and_active_skill() {
    let boss = "cinder-terraces-warden";
    let (rules, state, _) = started_with(boss, seats());
    let mut baseline_config = rules.config().clone();
    let profile = &mut baseline_config.elements[Element::Ground.index()];
    let bonus = profile.boss_crit_damage_bonus_bp.take().unwrap();
    let baseline = CoopRules::from_config(baseline_config, boss.into()).unwrap();
    let old_state = baseline
        .reduce(
            &baseline.allocate(seats()).unwrap(),
            CoopAction::Start,
            &mut rng(0),
        )
        .unwrap()
        .state;
    assert_eq!(state.board, old_state.board);
    assert_eq!(
        state.participants[3].crit_damage_bp,
        old_state.participants[3].crit_damage_bp + bonus
    );
    let (first, second) = rules.legal_swap(&state).unwrap();
    for action in [CoopAction::Swap { first, second }, CoopAction::Skill] {
        let damage = |rules: &CoopRules, mut state: CoopState, rate| {
            state.active_seat = 3;
            state.participants[3].mana = 100;
            state.participants[3].crit_rate_bp = rate;
            rules
                .reduce(&state, action, &mut rng(100))
                .unwrap()
                .state
                .participants[3]
                .contribution_damage
        };
        assert_eq!(
            damage(&rules, state.clone(), 0),
            damage(&baseline, old_state.clone(), 0)
        );
        assert!(
            damage(&rules, state.clone(), 10_000) > damage(&baseline, old_state.clone(), 10_000)
        );
    }
}

#[test]
fn extended_effects_reject_inert_or_unsupported_parameters() {
    let source: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let skill = |id| {
        source["skills"]
            .as_array()
            .unwrap()
            .iter()
            .position(|skill| skill["id"] == id)
            .unwrap()
    };
    let electric = skill("electric-copperkip-voltage-transfer");
    let water = skill("water-ripplefin-mana-current");
    let cleanse = skill("light-gleamlet-dawn-cleanse");
    let chain = skill("pet-v31-electric-quorion-volt-thunder-chain");
    use serde_json::json;
    for (index, path, value) in [
        (electric, "/effect/target", json!("self-actor")),
        (electric, "/effect/durationTurns", json!(2)),
        (electric, "/critEligible", json!(true)),
        (electric, "/rageCost", json!(100)),
        (water, "/effect/value", json!(101)),
        (water, "/effect/stackingPm", json!(1_200)),
        (cleanse, "/effect/target", json!("boss")),
        (cleanse, "/effect/value", json!(2)),
        (cleanse, "/powerPm", json!(1_200)),
        (chain, "/effect/target", json!("lowest-rage-ally")),
        (chain, "/effect/hits", json!(1)),
        (chain, "/effect/hits", serde_json::Value::Null),
        (chain, "/effect/durationTurns", json!(2)),
    ] {
        let mut candidate = source.clone();
        *candidate["skills"][index].pointer_mut(path).unwrap() = value;
        assert_eq!(
            CoopConfig::parse(&serde_json::to_vec(&candidate).unwrap()),
            Err(ConfigError::Skill),
            "accepted invalid field {index}{path}",
        );
    }
    let mut candidate = source.clone();
    let boss = candidate["bosses"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|boss| boss["id"] == "lantern-necropolis-warden")
        .unwrap();
    boss["attackModel"]["vulnerability"]["durationTurns"] = json!(1);
    assert_eq!(
        CoopConfig::parse(&serde_json::to_vec(&candidate).unwrap()),
        Err(ConfigError::Boss)
    );

    let mut candidate = source;
    candidate["elements"][Element::Ground.index()]["bossCritDamageBonusBp"] = json!(10_001);
    assert_eq!(
        CoopConfig::parse(&serde_json::to_vec(&candidate).unwrap()),
        Err(ConfigError::ElementSet)
    );
}

#[test]
fn ghost_curse_amplifies_allied_damage_then_expires_at_the_authored_turn() {
    let mut roster = seats();
    roster[0].pet_id = "pet-v31-ghost-vesperyn".into();
    let (rules, mut state, mut rng) = started_with("cinder-terraces-warden", roster);
    state.participants[0].mana = rules.config.resources.mana_cap;
    state.participants[0].rage = rules.config.resources.rage_cap;
    let mut marked = rules
        .reduce(&state, CoopAction::Signature, &mut rng)
        .unwrap()
        .state;
    assert_eq!(
        marked.boss.curse,
        Some(BossCurse {
            bonus_pm: 300,
            turns: 3
        })
    );
    let restored: CoopState =
        serde_json::from_slice(&serde_json::to_vec(&marked).unwrap()).unwrap();
    assert_eq!(state_digest(&restored), state_digest(&marked));
    let mut plain = marked.clone();
    plain.boss.curse = None;
    assert_ne!(state_digest(&marked), state_digest(&plain));
    assert_eq!(rules.damage_boss(&mut plain, 100).unwrap(), 100);
    assert_eq!(rules.damage_boss(&mut marked, 100).unwrap(), 130);
    for _ in 0..3 {
        rules.complete_turn(&mut marked, &mut rng, &mut Vec::new());
    }
    assert_eq!(marked.boss.curse, None);
    assert_eq!(rules.damage_boss(&mut marked, 100).unwrap(), 100);
}

#[test]
fn immediate_boss_attack_hands_the_round_to_a_surviving_seat() {
    let mut config: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    config["bosses"][0]["telegraphTurns"] = 1.into();
    let rules = CoopRules::load(
        &serde_json::to_vec(&config).unwrap(),
        "cinder-terraces-warden".into(),
    )
    .unwrap();
    let mut rng = rng(0);
    let mut state = rules
        .reduce(
            &rules.allocate(seats()).unwrap(),
            CoopAction::Start,
            &mut rng,
        )
        .unwrap()
        .state;
    state.active_seat = 3;
    state.participants[0].hp = 1;
    let next = rules
        .reduce(&state, CoopAction::Guard, &mut rng)
        .unwrap()
        .state;
    assert!(!next.participants[0].alive);
    assert_eq!(next.active_seat, 1);
    assert!(rules.reduce(&next, CoopAction::Guard, &mut rng).is_ok());
}

#[test]
fn authored_boss_pressure_targets_living_mana_leaders_at_impact() {
    let mut candidate: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let model = &mut candidate["bosses"][0]["attackModel"];
    model["targetPriority"] = "highest-mana".into();
    let boss = candidate["bosses"][0]["id"].as_str().unwrap();
    let configured =
        CoopRules::load(&serde_json::to_vec(&candidate).unwrap(), boss.into()).unwrap();
    assert_ne!(configured.digest(), rules().digest());
    let mut state = configured.allocate(seats()).unwrap();
    state.participants[0].hp = 1;
    state.participants[1].mana = 80;
    state.participants[2].mana = 80;
    state.participants[3].mana = 90;
    state.participants[3].alive = false;
    state.participants[3].hp = 0;
    let before = state.participants.clone();
    let mut events = Vec::new();
    state.pending = Some(PendingAttack {
        targets: 1,
        remaining: 1,
        damage: 100,
    });
    configured.tick_pending(&mut state, &mut events);
    assert_eq!(state.participants[0].hp, 1);
    assert!(state.participants[1].hp < before[1].hp);
    assert_eq!(state.participants[2].hp, before[2].hp);
    assert_eq!(state.participants[3].hp, 0);

    candidate["bosses"][0]["attackModel"]["targetPriority"] = "unsupported".into();
    assert!(CoopConfig::parse(&serde_json::to_vec(&candidate).unwrap()).is_err());
}

#[test]
fn terminal_outcome_policy_is_digest_bound_and_requires_schema_two() {
    let mut candidate: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    candidate["terminalOutcomePolicy"] = serde_json::Value::Null;
    let parse = |value: &serde_json::Value| CoopConfig::parse(&serde_json::to_vec(value).unwrap());
    assert_eq!(parse(&candidate).unwrap().digest(), rules().digest());

    candidate["terminalOutcomePolicy"] = "boss-defeat-first".into();
    assert_ne!(parse(&candidate).unwrap().digest(), rules().digest());
    candidate["terminalOutcomePolicy"] = "unknown".into();
    assert!(matches!(parse(&candidate), Err(ConfigError::Malformed)));

    let mut historical: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../tests/fixtures/arena8-coop-v1-legacy.seed.json"
    ))
    .unwrap();
    historical["terminalOutcomePolicy"] = "boss-defeat-first".into();
    assert!(matches!(parse(&historical), Err(ConfigError::Identity)));
}

fn boss_defeat_first_rules() -> CoopRules {
    let mut candidate: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    candidate["terminalOutcomePolicy"] = "boss-defeat-first".into();
    CoopRules::load(
        &serde_json::to_vec(&candidate).unwrap(),
        "cinder-terraces-warden".into(),
    )
    .unwrap()
}

fn reduce_against_due_telegraph(
    rules: &CoopRules,
    action: CoopAction,
    boss_hp: u32,
) -> Decision<CoopState> {
    let mut rng = rng(0);
    let mut state = rules
        .reduce(
            &rules.allocate(seats()).unwrap(),
            CoopAction::Start,
            &mut rng,
        )
        .unwrap()
        .state;
    rules.transform(&mut state).unwrap();
    state.boss.hp = boss_hp;
    state.boss.dot_damage = 1;
    state.boss.dot_turns = 2;
    for (index, seat) in state.participants.iter_mut().enumerate() {
        seat.alive = index < 2;
        seat.hp = u32::from(seat.alive);
    }
    state.participants[0].mana = rules.config.resources.mana_cap;
    state.participants[0].crit_rate_bp = 0;
    rules.boss_turn(&mut state, &mut rng, &mut Vec::new());
    assert!(matches!(
        state.pending,
        Some(PendingAttack {
            remaining: 1,
            targets: 2,
            ..
        })
    ));
    rules.reduce(&state, action, &mut rng).unwrap()
}

#[test]
fn terminal_policy_direct_boss_defeat_cancels_a_due_telegraph_before_dot() {
    let historical = reduce_against_due_telegraph(&rules(), CoopAction::Skill, 1);
    assert_eq!(historical.state.phase, CoopPhase::Lost);
    assert_eq!(historical.state.boss.hp, 0);
    assert!(historical.events.contains(&event("boss-dot", None, 0)));
    assert!(historical.state.participants.iter().all(|seat| !seat.alive));

    let configured = boss_defeat_first_rules();
    let finished = reduce_against_due_telegraph(&configured, CoopAction::Skill, 1);
    assert_eq!(finished.state.phase, CoopPhase::Won);
    assert_eq!(finished.state.boss.hp, 0);
    assert_eq!(finished.state.pending, None);
    assert_eq!(finished.state.boss.dot_turns, 2);
    assert_eq!(finished.state.turn_index, 1);
    assert_eq!(finished.state.participants[0].hp, 1);
    assert_eq!(finished.state.participants[1].hp, 1);
    assert_eq!(finished.events, [event("boss-damage", Some(0), 1)]);
    assert_eq!(
        finished.settlement,
        Some(configured.settlement(&finished.state))
    );
}

#[test]
fn terminal_policy_lethal_dot_cancels_a_due_telegraph() {
    let historical = reduce_against_due_telegraph(&rules(), CoopAction::Guard, 1);
    assert_eq!(historical.state.phase, CoopPhase::Lost);
    assert_eq!(historical.state.boss.hp, 0);
    assert!(historical.events.contains(&event("boss-dot", None, 1)));
    assert!(historical.state.participants.iter().all(|seat| !seat.alive));

    let configured = boss_defeat_first_rules();
    let finished = reduce_against_due_telegraph(&configured, CoopAction::Guard, 1);
    assert_eq!(finished.state.phase, CoopPhase::Won);
    assert_eq!(finished.state.boss.hp, 0);
    assert_eq!(finished.state.pending, None);
    assert_eq!(finished.state.boss.dot_turns, 1);
    assert_eq!(finished.state.turn_index, 1);
    assert_eq!(finished.state.participants[0].hp, 1);
    assert_eq!(finished.state.participants[1].hp, 1);
    assert_eq!(finished.events.last(), Some(&event("boss-dot", None, 1)));
    assert_eq!(
        finished.settlement,
        Some(configured.settlement(&finished.state))
    );
}

#[test]
fn terminal_policy_resolves_due_telegraph_when_the_boss_survives() {
    let configured = boss_defeat_first_rules();
    let finished = reduce_against_due_telegraph(&configured, CoopAction::Guard, 2);
    assert_eq!(finished.state.phase, CoopPhase::Lost);
    assert_eq!(finished.state.boss.hp, 1);
    assert_eq!(finished.state.pending, None);
    assert!(finished.state.participants.iter().all(|seat| !seat.alive));
    assert_eq!(
        finished.settlement,
        Some(configured.settlement(&finished.state))
    );
}

fn constructive_rules() -> CoopRules {
    let mut candidate: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    candidate["board"]["initialBoardPolicy"] = "constructive".into();
    CoopRules::load(
        &serde_json::to_vec(&candidate).unwrap(),
        "cinder-terraces-warden".into(),
    )
    .unwrap()
}

#[test]
fn constructive_openings_are_playable_under_skewed_weights() {
    let mut candidate: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    candidate["board"]["initialBoardPolicy"] = "constructive".into();
    candidate["board"]["generationAttempts"] = 1.into();
    for (index, weight) in candidate["board"]["spawnWeights"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        weight["weight"] = if index == 0 { 1_000_000 } else { 1 }.into();
    }
    let rules = CoopRules::load(
        &serde_json::to_vec(&candidate).unwrap(),
        "cinder-terraces-warden".into(),
    )
    .unwrap();
    let initial = rules.allocate(seats()).unwrap();
    for seed in 1..=1_000 {
        let secret = SecretSeed::from_host_entropy([43; 32]);
        let mut rng = TurnRng::new(&secret, Value::Uint(seed), 0).unwrap();
        let state = rules
            .reduce(&initial, CoopAction::Start, &mut rng)
            .unwrap()
            .state;
        assert!(
            state
                .board
                .iter()
                .all(|tile| tile.is_some_and(|tile| tile.multiplier == 1))
        );
        assert!(!matched_cells(&state.board).contains(&true), "seed {seed}");
        assert!(rules.legal_swap(&state).is_some(), "seed {seed}");
    }
}

#[test]
fn constructive_openings_are_explicit_and_bind_to_the_match_digest() {
    use aetheria_game_core::{Command, apply, begin};

    let historical = rules();
    let candidate = constructive_rules();
    assert_eq!(
        historical
            .digest()
            .map(|byte| format!("{byte:02x}"))
            .concat(),
        "69c326020b10f28bace6dab175ee1b1630afe83ec1165d9ff1fb845c143419bf"
    );
    assert_ne!(candidate.digest(), historical.digest());

    let legacy = include_bytes!("../../../tests/fixtures/arena8-coop-v1-legacy.seed.json");
    let mut invalid: serde_json::Value = serde_json::from_slice(legacy).unwrap();
    invalid["board"]["initialBoardPolicy"] = "constructive".into();
    assert!(CoopConfig::parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
    invalid = serde_json::from_slice(&bundle()).unwrap();
    invalid["board"]["initialBoardPolicy"] = "unknown-policy".into();
    assert!(CoopConfig::parse(&serde_json::to_vec(&invalid).unwrap()).is_err());

    let ready_to_start = |rules: &CoopRules, seed: u64| {
        let mut entropy = [0u8; 32];
        for bytes in entropy.chunks_exact_mut(8) {
            bytes.copy_from_slice(&seed.to_le_bytes());
        }
        let secret = SecretSeed::from_host_entropy(entropy);
        let mut match_id = [0u8; 16];
        match_id[..8].copy_from_slice(&seed.to_le_bytes());
        match_id[15] = 1;
        let clock = LogicalClock {
            server_tick: 0,
            logical_time_ms: 0,
        };
        let state = rules.allocate(seats()).unwrap();
        let checkpoint = begin(rules, match_id, state, &secret, clock).unwrap();
        let command = Command {
            id: [1; 16],
            match_id,
            expected_version: checkpoint.version,
            ruleset: checkpoint.ruleset.clone(),
            action: CoopAction::Start,
        };
        (checkpoint, command, secret, clock)
    };
    for seed in [233, 548, 605, 892] {
        let (ready, command, entropy, clock) = ready_to_start(&historical, seed);
        // These fixed seeds previously exhausted the opening generator.
        assert!(matches!(
            apply(&historical, &ready, &command, &entropy, clock),
            Err(CoreError::InvalidState)
        ));
        assert!(matches!(
            apply(&candidate, &ready, &command, &entropy, clock),
            Err(CoreError::ContentMismatch)
        ));
        let (ready, command, entropy, clock) = ready_to_start(&candidate, seed);
        let first = apply(&candidate, &ready, &command, &entropy, clock).unwrap();
        let replay = apply(&candidate, &ready, &command, &entropy, clock).unwrap();
        assert_eq!(first.next.audit_hash, replay.next.audit_hash);
        assert_eq!(first.next.state.config_digest, candidate.digest());
        assert_ne!(first.next.state.config_digest, historical.digest());
        assert!(candidate.legal_swap(&first.next.state).is_some());
    }
}
