use super::*;
use serde_json::{Value as Json, json};

const BUNDLE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../config/gameplay/arena8-coop-shared-rng-v1.candidate.json"
));
const V3_BUNDLE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../config/gameplay/arena8-coop-advanced-v1.candidate.json"
));
const FIRE: &str = "cinder-terraces-warden";

fn load() -> CoopRules {
    CoopRules::load(BUNDLE, FIRE.into()).unwrap()
}

fn parse(value: &Json) -> Result<CoopConfig, ConfigError> {
    CoopConfig::parse(&serde_json::to_vec(value).unwrap())
}

#[test]
fn validates_shared_weights_effects_and_fixed_strength_policy() {
    let original: Json = serde_json::from_slice(BUNDLE).unwrap();
    let historical: Json = serde_json::from_slice(V3_BUNDLE).unwrap();
    let mut rows = original["board"]["functionalTiles"]["spawnWeights"].clone();
    rows.as_array_mut().unwrap().pop();
    for (path, invalid) in [
        ("/engineCapability", json!("arena8-coop-v4")),
        ("/board/functionalTiles/spawnWeights", rows),
        ("/board/functionalTiles/spawnWeights/8/kind", json!("sword")),
        ("/board/functionalTiles/spawnWeights/8/weight", json!(0)),
        (
            "/board/functionalTiles/spawnWeights/8/weight",
            json!(1_000_001),
        ),
        ("/advancedJewels", historical["advancedJewels"].clone()),
        ("/party/maxRounds", json!(100)),
        ("/bosses/0/regular/maxRounds", json!(100)),
    ] {
        let mut modified = original.clone();
        *modified.pointer_mut(path).unwrap() = invalid;
        assert!(parse(&modified).is_err(), "{path}");
    }
    for forbidden_field in ["occupancyLimit", "encounters"] {
        let mut modified = original.clone();
        modified["advancedJewels"][forbidden_field] = json!(null);
        assert!(parse(&modified).is_err(), "{forbidden_field}");
    }
    let mut modified = original.clone();
    modified["bosses"][0]["solo"] = historical["bosses"][0]["solo"].clone();
    assert_eq!(parse(&modified), Err(ConfigError::Boss));
    assert!(parse(&historical).is_ok());
}

#[test]
fn validates_all_element_pairs_and_removes_ordinary_immunity() {
    let expected = [
        [1000, 500, 1000, 1000, 500, 1500],
        [1500, 1000, 1000, 1000, 1500, 1000],
        [1000, 1500, 1000, 1000, 500, 1000],
        [1000, 1000, 1000, 1000, 1000, 500],
        [1500, 500, 1500, 1000, 1000, 1000],
        [1000, 1000, 1000, 1500, 1000, 1000],
    ];
    let rules = load();
    let original: Json = serde_json::from_slice(BUNDLE).unwrap();
    for (a, attacker) in crate::arena8::ELEMENTS.into_iter().enumerate() {
        for (d, defender) in crate::arena8::ELEMENTS.into_iter().enumerate() {
            assert_eq!(rules.effectiveness(attacker, defender), expected[a][d]);
            let mut invalid = original.clone();
            invalid["elements"][a]["effectiveness"][d]["permille"] = json!(0);
            assert_eq!(parse(&invalid), Err(ConfigError::Effectiveness));
        }
        let mut mirror = original.clone();
        mirror["elements"][a]["effectiveness"][a]["permille"] = json!(500);
        assert_eq!(parse(&mirror), Err(ConfigError::Effectiveness));
    }
}

#[test]
fn natural_opening_refill_and_recovery_draw_every_kind() {
    fn observed(counts: [u64; TileKind::SHARED.len()]) -> u16 {
        counts
            .into_iter()
            .enumerate()
            .fold(0, |mask, (index, count)| {
                mask | (u16::from(count > 0) << index)
            })
    }
    let dead_board = std::array::from_fn(|index| {
        let i = (index / SIDE + 2 * (index % SIDE)) % TileKind::SHARED.len();
        Some(Tile {
            identity: TileIdentity::Kind(TileKind::SHARED[i]),
            multiplier: 1,
        })
    });
    let rules = load();
    let initial = rules.allocate(seats()).unwrap();
    let mut opening = 0;
    let mut refill = 0;
    let mut recovery = 0;
    for sample in 0..48u8 {
        let seed = SecretSeed::from_host_entropy([sample; 32]);
        let binding = Value::Text("shared-natural-spawns".into());
        let mut stream = seed.stream(binding, 0).unwrap();
        let mut observation = TurnObservation {
            natural_spawns: Some(simulation::NaturalSpawnDiagnostics::default()),
            ..TurnObservation::default()
        };
        let start = rules
            .reduce_observed(
                &initial,
                CoopAction::Start,
                None,
                &mut stream,
                &mut observation,
            )
            .unwrap();
        assert_eq!(
            start.events,
            vec![event("started", None, initial.boss.hp.into())]
        );
        assert_eq!(stream.cursor(), 0);
        let mut state = start.state;
        assert!(state.board.iter().all(Option::is_some));
        assert!(
            !matched_cells(&state.board)
                .into_iter()
                .any(|matched| matched)
        );
        assert!(rules.legal_swap(&state).is_some());
        let opening_counts = observation.natural_spawns.unwrap().opening;
        assert_eq!(opening_counts.iter().sum::<u64>(), CELLS as u64);
        opening |= observed(opening_counts);

        let mut board_entropy = stream
            .substream(
                "aetheria.arena8-coop.board.v1",
                state.board_rng_cursor.unwrap(),
            )
            .unwrap();
        state.board = [None; CELLS];
        rules
            .gravity_and_refill(&mut state, &mut board_entropy, &mut 0, &mut observation)
            .unwrap();
        let refill_counts = observation.natural_spawns.unwrap().refill;
        assert_eq!(refill_counts.iter().sum::<u64>(), CELLS as u64);
        refill |= observed(refill_counts);

        let recoveries = observation.dead_board_regenerations;
        state.board = dead_board;
        assert!(rules.legal_swap(&state).is_none());
        rules
            .gravity_and_refill(&mut state, &mut board_entropy, &mut 0, &mut observation)
            .unwrap();
        assert_eq!(observation.dead_board_regenerations, recoveries + 1);
        assert!(
            !matched_cells(&state.board)
                .into_iter()
                .any(|matched| matched)
        );
        assert!(rules.legal_swap(&state).is_some());
        assert_eq!(state.board.iter().flatten().count(), CELLS);
        let counts = observation.natural_spawns.unwrap().recovery;
        assert_eq!(counts.iter().sum::<u64>(), (recoveries + 1) * CELLS as u64);
        recovery |= observed(counts);
    }

    let all_kinds = (1 << TileKind::SHARED.len()) - 1;
    assert_eq!([opening, refill, recovery], [all_kinds; 3]);
}

#[test]
fn shared_board_replay_ignores_pet_and_combat_entropy_position() {
    let rules = load();
    let mut alternate = seats();
    alternate[0].pet_id = "pet-v31-light-aurelune".into();
    alternate[0].level = 40;
    let initial = rules.allocate(seats()).unwrap();
    let other_initial = rules.allocate(alternate).unwrap();
    let play = |state, action, cursor| rules.reduce(state, action, &mut rng(cursor)).unwrap().state;
    let first = play(&initial, CoopAction::Start, 0);
    let other = play(&other_initial, CoopAction::Start, 74);
    assert_eq!(first.board, other.board);
    assert_eq!(first.board_rng_cursor, other.board_rng_cursor);
    assert_ne!(first.participants[0].pet_id, other.participants[0].pet_id);

    let (a, b) = rules.legal_swap(&first).unwrap();
    let action = CoopAction::Swap {
        first: a,
        second: b,
    };
    let after = play(&first, action, 0);
    let other_after = play(&other, action, 74);
    assert_eq!(after.board, other_after.board);
    assert_eq!(after.board_rng_cursor, other_after.board_rng_cursor);
    assert!(after.board_rng_cursor > first.board_rng_cursor);

    let persisted = serde_json::to_vec(&first).unwrap();
    let restored: CoopState = serde_json::from_slice(&persisted).unwrap();
    assert_eq!(state_digest(&first), state_digest(&restored));
    assert_eq!(after, play(&restored, action, 0));
}

#[test]
fn same_warden_statistics_and_policy_apply_to_solo_and_coop() {
    let coop = load();
    let solo = CoopRules::load_solo(BUNDLE, FIRE.into()).unwrap();
    let regular = CoopRules::load_solo(BUNDLE, "cinder-terraces-regular".into()).unwrap();
    let seat = seats()[0].clone();
    let loadout = ArtifactLoadout {
        digest: ArtifactLoadout::digest(solo.digest(), &seat, &[]),
        entries: Vec::new(),
    };
    let ready = solo.allocate_solo(seat.clone(), &loadout).unwrap();
    let coop_ready = coop.allocate(seats()).unwrap();

    assert_eq!(coop.ruleset().version, SHARED_RNG_RULESET_VERSION);
    assert_eq!(solo.ruleset().version, SHARED_RNG_SOLO_RULESET_VERSION);
    assert_eq!(solo.selected_boss(), coop.selected_boss());
    assert_eq!(ready.boss, coop_ready.boss);
    assert_eq!(ready.participants.len(), 1);
    assert_eq!(coop_ready.participants.len(), SEATS);
    assert_eq!(solo.max_rounds(), None);
    assert_eq!(coop.max_rounds(), None);
    assert_ne!(
        regular.allocate_solo(seat, &loadout).unwrap().boss.hp,
        ready.boss.hp
    );
}

#[test]
fn icarus_fire_zone_retains_combat_effect_and_never_mutates_board() {
    let rules = load();
    let mut stream = rng(0);
    let ready = rules.allocate(seats()).unwrap();
    let mut started = rules
        .reduce(&ready, CoopAction::Start, &mut stream)
        .unwrap()
        .state;
    started.participants[0].mana = rules.config.resources.mana_cap;
    let resolved = rules
        .reduce(&started, CoopAction::FireZone, &mut stream)
        .unwrap();
    assert_eq!(resolved.state.board, started.board);
    assert_eq!(resolved.state.board_rng_cursor, started.board_rng_cursor);
    assert!(resolved.state.participants[0].fire_zone_turns > 0);
    assert!(resolved.state.boss.dot_damage > 0);
    assert!(resolved.state.boss.dot_turns > 0);
}

#[test]
fn warden_attack_stat_is_effective_only_in_the_new_schema() {
    fn charge_warden(rules: &CoopRules) -> u32 {
        let mut ready = rules.allocate(seats()).unwrap();
        rules.boss_turn(&mut ready, &mut rng(0), &mut Vec::new());
        ready.pending.unwrap().damage
    }
    fn authored(legacy: bool, attack_increase: u32) -> Vec<u8> {
        let source = if legacy { V3_BUNDLE } else { BUNDLE };
        let mut bundle: Json = serde_json::from_slice(source).unwrap();
        let boss = &mut bundle["bosses"][0];
        let attack = boss["attack"].as_u64().unwrap();
        boss["attack"] = json!(attack + u64::from(attack_increase));
        boss["critRateBp"] = json!(0);
        serde_json::to_vec(&bundle).unwrap()
    }
    let load = |legacy, attack_increase| {
        let bytes = authored(legacy, attack_increase);
        CoopRules::load(&bytes, FIRE.into()).unwrap()
    };
    let historical = charge_warden(&load(true, 0));
    assert_eq!(historical, charge_warden(&load(true, 36)));
    assert_eq!(historical, charge_warden(&load(false, 0)));
    assert_eq!(historical + 36, charge_warden(&load(false, 36)));

    let charge_regular = |attack_increase| {
        let bytes = authored(false, attack_increase);
        let regular = CoopRules::load_solo(&bytes, "cinder-terraces-regular".into()).unwrap();
        let seat = seats()[0].clone();
        let loadout = ArtifactLoadout {
            digest: ArtifactLoadout::digest(regular.digest(), &seat, &[]),
            entries: Vec::new(),
        };
        let mut ready = regular.allocate_solo(seat, &loadout).unwrap();
        regular.boss_turn(&mut ready, &mut rng(0), &mut Vec::new());
        ready.pending.unwrap().damage
    };
    assert_eq!(charge_regular(0), charge_regular(36));
}

#[test]
fn single_seat_warden_final_blow_proposes_the_ordinary_win_settlement() {
    let rules = CoopRules::load_solo(BUNDLE, FIRE.into()).unwrap();
    let seat = seats()[0].clone();
    let loadout = ArtifactLoadout {
        digest: ArtifactLoadout::digest(rules.digest(), &seat, &[]),
        entries: Vec::new(),
    };
    let ready = rules.allocate_solo(seat, &loadout).unwrap();
    let mut entropy = rng(0);
    let mut playing = rules
        .reduce_stamped(&ready, CoopAction::Start, Some(1_000), &mut entropy)
        .unwrap()
        .state;

    // Model a legitimate finishing blow in a focused phase-two fixture.
    rules.transform(&mut playing).unwrap();
    playing.boss.hp = 1;
    playing.turn_index = 10;
    playing.participants[0].mana = rules.config.resources.mana_cap;
    playing.pending = Some(PendingAttack {
        targets: 1,
        remaining: 1,
        damage: u32::MAX,
    });

    let decision = rules
        .reduce_stamped(&playing, CoopAction::Skill, Some(2_000), &mut entropy)
        .unwrap();
    assert_eq!(decision.state.phase, CoopPhase::Won);
    assert_eq!(decision.state.boss.hp, 0);
    assert_eq!(decision.state.pending, None);
    assert!(decision.state.participants[0].alive);
    assert_eq!(decision.state.participants[0].contribution_damage, 1);
    assert!(decision.events.contains(&event("boss-damage", Some(0), 1)));
    let settlement = decision.settlement.unwrap();
    assert_eq!(settlement, rules.settlement(&decision.state));
    let Value::List(fields) = settlement else {
        panic!("ordinary settlement envelope");
    };
    assert_eq!(fields[4], Value::Text("won".into()));
    assert_eq!(fields[5], Value::Text(FIRE.into()));
    assert!(matches!(&fields[6], Value::List(participants) if participants.len() == 1));
}
