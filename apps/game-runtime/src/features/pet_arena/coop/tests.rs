use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use aetheria_game_core::{Error as CoreError, SecretSeed, Value};
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::binding::ArtifactSlot;
use aetheria_pet_arena::arena8::coop::config::EffectKind;
use aetheria_pet_arena::arena8::coop::{
    ArtifactLoadout, CoopAction, CoopCommand, CoopConfig, CoopPhase, CoopState, EquippedArtifact,
    SEATS, SeatInput, Status, StatusKind, content_hash,
};

fn bundle() -> Vec<u8> {
    std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-v2.seed.json"
    ))
    .expect("committed seed bundle")
}

fn seats() -> [SeatInput; SEATS] {
    // Use canonical pet IDs from the seed (one per element for variety)
    [
        ("pet-v3-fire-icarus", "instance-icarus"),
        ("pet-v31-water-marivell", "instance-marivell"),
        ("pet-v31-electric-quorion", "instance-quorion"),
        ("pet-v31-ground-gravorn", "instance-gravorn"),
    ]
    .map(|(pet, instance)| SeatInput {
        account: format!("account-{pet}"),
        pet_id: pet.into(),
        owned_pet_instance_id: instance.into(),
        level: 1,
        artifact_power_pm: 0,
    })
}

fn bindings(bundle: &[u8], seats: &[SeatInput; SEATS]) -> [ArtifactLoadout; SEATS] {
    let digest = CoopConfig::parse(bundle).unwrap().digest();
    seats.each_ref().map(|seat| ArtifactLoadout {
        digest: ArtifactLoadout::digest(digest, seat, &[]),
        entries: vec![],
    })
}

fn load(seats: [SeatInput; SEATS]) -> Result<Rules, aetheria_pet_arena::arena8::coop::ConfigError> {
    let bundle = bundle();
    let loadouts = bindings(&bundle, &seats);
    Rules::load(
        &bundle,
        seats,
        "cinder-terraces-warden".into(),
        Some(&loadouts),
    )
}

fn rules() -> Rules {
    load(seats()).expect("valid seed bundle and seats")
}

#[test]
fn bundle_binds_the_published_configuration_and_a_ready_board() {
    let rules = rules();
    let state = rules.initial();
    assert_eq!(state.phase, CoopPhase::Ready);
    assert_eq!(state.config_digest, rules.engine().digest());
    assert_eq!(rules.content_hash(), content_hash(rules.engine().digest()));
    assert_eq!(state.boss.max_hp, 12_000);
    assert_eq!(state.boss.phase, 1);
    assert_eq!(
        state
            .participants
            .iter()
            .map(|seat| seat.pet_id.as_str())
            .collect::<Vec<_>>(),
        [
            "pet-v3-fire-icarus",
            "pet-v31-water-marivell",
            "pet-v31-electric-quorion",
            "pet-v31-ground-gravorn"
        ]
    );
    assert!(state.board.iter().all(Option::is_none));
}

#[test]
fn durable_state_roundtrips_and_rejects_a_different_allocation() {
    let rules = rules();
    let state = rules.initial();
    let bytes = rules.encode(&state).expect("encode");
    assert_eq!(rules.decode(&bytes).expect("decode"), state);
    let mut other = seats();
    other[2].account = "someone-else".into();
    let foreign = load(other).expect("foreign allocation");
    assert!(matches!(foreign.decode(&bytes), Err(Error::Integrity)));
    let mut tampered = state.clone();
    tampered.config_digest = [0u8; 32];
    assert!(matches!(rules.encode(&tampered), Err(Error::Integrity)));
}

#[test]
fn membership_and_projection_are_scoped_to_the_authenticated_seat() {
    let rules = rules();
    let state = rules.initial();
    assert!(rules.member(&state, "account-pet-v3-fire-icarus"));
    assert!(!rules.member(&state, "account-outsider"));
    assert_eq!(
        rules.seat(&state, "account-pet-v31-electric-quorion"),
        Some(2)
    );
    let projected = rules
        .project(&state, "account-pet-v31-electric-quorion")
        .expect("projection");
    assert!(projected.len() <= 16_384);
    let value: serde_json::Value = serde_json::from_slice(&projected).expect("json");
    assert_eq!(value["schemaVersion"], 1);
    assert_eq!(value["ruleset"]["id"], "arena8-coop-pve");
    assert_eq!(
        value["ruleset"]["contentHash"].as_str().map(str::len),
        Some(64)
    );
    assert_eq!(value["you"], 2);
    assert_eq!(value["participants"].as_array().map(Vec::len), Some(4));
    assert_eq!(value["board"].as_array().map(Vec::len), Some(64));
    assert_eq!(value["boss"]["maxHp"], 12_000);
    assert_eq!(value["phase"], "ready");
    assert!(matches!(
        rules.project(&state, "account-outsider"),
        Err(Error::Unauthorized)
    ));
}

#[test]
fn projected_utility_readiness_matches_the_reducer() {
    for pet_id in [
        "electric-copperkip",
        "water-ripplefin",
        "pet-v31-light-aurelune",
    ] {
        let mut roster = seats();
        roster[0].pet_id = pet_id.into();
        let rules = load(roster).expect("utility Pet allocation");
        let engine = rules.engine();
        let config = engine.config();
        let pet = config.pet(pet_id).unwrap();
        let signature = config.skill(&pet.signature).unwrap();
        let seed = SecretSeed::from_host_entropy([7; 32]);
        let mut rng = seed
            .stream(Value::Text("utility-readiness".into()), 0)
            .unwrap();
        let mut state = engine
            .reduce(&rules.initial(), CoopAction::Start, &mut rng)
            .unwrap()
            .state;
        let account = state.participants[0].account.clone();
        let cursor = rng.cursor();
        state.participants[0].mana = config.resources.mana_cap;
        state.participants[0].rage = config.resources.rage_cap;
        for ally in &mut state.participants[1..] {
            ally.mana = config.resources.mana_cap;
            ally.rage = config.resources.rage_cap;
        }

        let projected_ready = |state: &CoopState| {
            let projected = rules.project(state, &account).unwrap();
            let value: serde_json::Value = serde_json::from_slice(&projected).unwrap();
            let ability = value["abilities"]
                .as_array()
                .unwrap()
                .iter()
                .find(|ability| ability["kind"] == "signature")
                .unwrap();
            assert_eq!(ability["id"], signature.id);
            ability["ready"].as_bool().unwrap()
        };
        let assert_can_cast = |state: &CoopState, expected| {
            assert_eq!(projected_ready(state), expected, "{pet_id} projection");
            let mut rng = seed
                .stream(Value::Text("utility-readiness".into()), cursor)
                .unwrap();
            let decision = engine.reduce(state, CoopAction::Signature, &mut rng);
            if expected {
                assert!(decision.is_ok(), "{pet_id} reducer");
            } else {
                assert!(
                    matches!(decision, Err(CoreError::InvalidAction)),
                    "{pet_id} reducer"
                );
                assert_eq!(rng.cursor(), cursor, "{pet_id} rejected cast entropy");
            }
        };

        assert_can_cast(&state, false);
        let target = &mut state.participants[1];
        match signature.effect.kind {
            EffectKind::RageTransfer => target.rage -= 1,
            EffectKind::ManaRestore => target.mana -= 1,
            EffectKind::Cleanse => {
                target.statuses[0] = Some(Status {
                    kind: StatusKind::Vulnerability,
                    value: 100,
                    turns: 2,
                });
            }
            _ => panic!("unexpected utility signature for {pet_id}"),
        }
        assert_can_cast(&state, true);

        if signature.effect.kind == EffectKind::RageTransfer {
            let mut no_donor_rage = state.clone();
            no_donor_rage.participants[0].rage = signature.rage_cost;
            assert_can_cast(&no_donor_rage, false);
        }

        let mut dead_target = state.clone();
        dead_target.participants[1].alive = false;
        dead_target.participants[1].hp = 0;
        assert_can_cast(&dead_target, false);
        for ally in &mut dead_target.participants[2..] {
            ally.alive = false;
            ally.hp = 0;
        }
        assert_can_cast(&dead_target, false);

        let mut on_cooldown = state.clone();
        on_cooldown.participants[0].cooldowns[2] = 1;
        assert_can_cast(&on_cooldown, false);

        state.active_seat = 1;
        assert!(
            !projected_ready(&state),
            "{pet_id} inactive seat projection"
        );
    }
}

#[test]
fn intents_are_strict_and_never_carry_authority() {
    let rules = rules();
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":7,"action":{"kind":"start"}}"#
            )
            .expect("start"),
        (7, CoopCommand::new(CoopAction::Start))
    );
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":8,"action":{"kind":"swap","first":1,"second":2}}"#
            )
            .expect("swap"),
        (
            8,
            CoopCommand::new(CoopAction::Swap {
                first: 1,
                second: 2
            })
        )
    );
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":9,"action":{"kind":"fireZone"}}"#
            )
            .expect("fire zone"),
        (9, CoopCommand::new(CoopAction::FireZone))
    );
    for payload in [
        br#"{"epoch":1,"action":{"kind":"unknown"}}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"expireTurn"}}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"endTurn"},"serverTimestampMs":1}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"start"},"account":"attacker"}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"swap","first":1}}"#.as_slice(),
        br#"{"epoch":1}"#.as_slice(),
    ] {
        assert!(matches!(
            rules.parse("arena8-coop.intent.v1", payload),
            Err(Error::Invalid)
        ));
    }
    assert!(matches!(
        rules.parse(
            "arena8.intent.v1",
            br#"{"epoch":1,"action":{"kind":"start"}}"#
        ),
        Err(Error::Invalid)
    ));
}

#[test]
fn only_the_owner_of_the_active_seat_may_command() {
    let rules = rules();
    let state = rules.initial();
    assert!(rules.authorize(
        &state,
        "account-pet-v3-fire-icarus",
        &CoopCommand::new(CoopAction::Start)
    ));
    assert!(!rules.authorize(
        &state,
        "account-pet-v31-water-marivell",
        &CoopCommand::new(CoopAction::Start)
    ));
    assert!(!rules.authorize(
        &state,
        "account-outsider",
        &CoopCommand::new(CoopAction::Guard)
    ));
}

#[test]
fn invalid_bundles_and_allocations_fail_closed() {
    assert!(Rules::load(b"", seats(), "cinder-terraces-warden".into(), None).is_err());
    // Duplicate accounts must fail.
    let mut duplicate = seats();
    duplicate[1].account = duplicate[0].account.clone();
    assert!(load(duplicate).is_err());
    // Duplicate owned_pet_instance_id must fail (even with different accounts).
    let mut duplicate_instance = seats();
    duplicate_instance[1].owned_pet_instance_id =
        duplicate_instance[0].owned_pet_instance_id.clone();
    assert!(load(duplicate_instance).is_err());
    // Same pet species with different owned_pet_instance_id is allowed.
    let mut same_species = seats();
    same_species[1].pet_id = same_species[0].pet_id.clone();
    same_species[1].owned_pet_instance_id = "instance-different".into();
    assert!(load(same_species).is_ok());
    let mut level_zero = seats();
    level_zero[0].level = 0;
    assert!(load(level_zero).is_err());
    let mut too_powerful = seats();
    too_powerful[0].artifact_power_pm = 5_001;
    assert!(load(too_powerful).is_err());
}

#[test]
fn only_a_terminal_state_completes_the_match() {
    let rules = rules();
    let state = rules.initial();
    assert!(matches!(rules.completion(&state), Err(Error::Invalid)));
    let mut won = state.clone();
    won.phase = CoopPhase::Won;
    match rules.completion(&won) {
        Ok(Completion::Proposal(value)) => {
            assert_eq!(value["kind"], "coop.completed.v1");
            assert_eq!(value["outcome"], "won");
            assert_eq!(value["ruleset"], "arena8-coop-pve");
            assert_eq!(value["participants"].as_array().map(Vec::len), Some(4));
            assert_eq!(
                value["participants"][0]["account"],
                "account-pet-v3-fire-icarus"
            );
        }
        _ => panic!("unexpected completion"),
    }
}

#[test]
fn historical_allocation_retains_the_legacy_snapshot_shape() {
    let bundle = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/arena8-coop-v1-legacy.seed.json"
    ))
    .unwrap();
    let historic_pets = ["icarus", "coralline", "volt", "terran"];
    let mut seats = seats();
    for (seat, species) in seats.iter_mut().zip(historic_pets) {
        seat.pet_id = species.into();
    }
    for seat in &mut seats {
        seat.artifact_power_pm = 1_000;
    }
    let rules = Rules::load(&bundle, seats, "cinder-terraces-warden".into(), None).unwrap();
    let state = rules.initial();
    let bytes = rules.encode(&state).unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(json["state"].get("boss_id").is_none());
    assert!(
        json["state"]["participants"][0]
            .get("owned_pet_instance_id")
            .is_none()
    );
    assert!(
        json["state"]["participants"][0]
            .get("artifact_loadout_digest")
            .is_none()
    );
    assert_eq!(rules.decode(&bytes).unwrap(), state);
}

#[test]
fn equipped_artifacts_apply_authored_stats_and_bind_the_exact_instances() {
    let bundle = bundle();
    let digest = CoopConfig::parse(&bundle).unwrap().digest();
    let mut roster = seats();
    roster[0].level = 20;
    let baseline = load(roster.clone()).unwrap().initial();
    let mut loadouts = bindings(&bundle, &roster);
    let entries = [
        (ArtifactSlot::Core, "core-emberglass", 2),
        (ArtifactSlot::Aegis, "aegis-bastionplate", 2),
        (ArtifactSlot::Rune, "rune-mistquill", 2),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (slot, id, upgrade_level))| EquippedArtifact {
        slot,
        artifact_id: format!("81110000-0000-4000-8000-{index:012}"),
        definition_id: id.into(),
        upgrade_level,
    })
    .collect::<Vec<_>>();
    loadouts[0] = ArtifactLoadout {
        digest: ArtifactLoadout::digest(digest, &roster[0], &entries),
        entries,
    };
    let game = |loadouts: &[ArtifactLoadout; SEATS]| {
        Rules::load(
            &bundle,
            roster.clone(),
            "cinder-terraces-warden".into(),
            Some(loadouts),
        )
    };
    let bound = game(&loadouts).unwrap();
    let state = bound.initial();
    assert_eq!(state.participants[0].hp, baseline.participants[0].hp + 15);
    assert_eq!(
        state.participants[0].attack,
        baseline.participants[0].attack + 7
    );
    assert_eq!(
        state.participants[0].defense,
        baseline.participants[0].defense + 6
    );
    assert_eq!(
        state.participants[0].artifact_loadout_digest.as_deref(),
        Some(loadouts[0].digest.as_str())
    );
    assert_eq!(state.participants[1..], baseline.participants[1..]);
    let bytes = bound.encode(&state).unwrap();
    assert_eq!(game(&loadouts).unwrap().decode(&bytes).unwrap(), state);
    let mut tampered_state = state.clone();
    tampered_state.participants[0].attack += 1;
    assert!(matches!(
        bound.encode(&tampered_state),
        Err(Error::Integrity)
    ));

    loadouts[0].entries[0].artifact_id = "90000000-0000-4000-8000-000000000000".into();
    assert!(
        game(&loadouts).is_err(),
        "the supplied digest still names the old instance"
    );
    loadouts[0].digest = ArtifactLoadout::digest(digest, &roster[0], &loadouts[0].entries);
    let replacement = game(&loadouts).unwrap();
    assert!(matches!(replacement.decode(&bytes), Err(Error::Integrity)));
    assert_eq!(
        replacement.initial().participants[0].hp,
        state.participants[0].hp
    );

    loadouts[0].entries[1].slot = ArtifactSlot::Core;
    loadouts[0].digest = ArtifactLoadout::digest(digest, &roster[0], &loadouts[0].entries);
    assert!(
        game(&loadouts).is_err(),
        "a recomputed digest cannot authorize a second Core"
    );
    assert!(Rules::load(&bundle, roster, "cinder-terraces-warden".into(), None).is_err());
}

#[test]
fn artifact_catalog_validation_fails_closed() {
    let mut authored: serde_json::Value = serde_json::from_slice(&bundle()).unwrap();
    let validate =
        |value: &serde_json::Value| CoopConfig::parse(&serde_json::to_vec(value).unwrap());
    let valid = validate(&authored).unwrap();
    authored["artifacts"][0]["modifiers"]["hp"] = 5.into();
    assert_ne!(validate(&authored).unwrap().digest(), valid.digest());
    authored["artifacts"][0]["modifiers"]["unsupported"] = 1.into();
    assert!(validate(&authored).is_err());
    authored.as_object_mut().unwrap().remove("artifacts");
    assert!(
        validate(&authored).is_err(),
        "a typed allocation requires an authored catalog"
    );
}

#[test]
fn durable_skill_level_must_match_the_original_allocation() {
    use aetheria_pet_arena::arena8::coop::SkillLevelBinding;

    let base = rules();
    let upgraded = Rules::load_with_skill_levels(
        &bundle(),
        seats(),
        "cinder-terraces-warden".into(),
        Some(&bindings(&bundle(), &seats())),
        &[
            vec![SkillLevelBinding {
                skill_id: "pet-v3-fire-icarus-ember-lance".into(),
                level: 2,
            }],
            vec![],
            vec![],
            vec![],
        ],
    )
    .unwrap();
    let original_state = base.initial();
    let upgraded_state = upgraded.initial();
    let old_bytes = base.encode(&original_state).unwrap();
    let new_bytes = upgraded.encode(&upgraded_state).unwrap();
    assert_eq!(base.decode(&old_bytes).unwrap(), original_state);
    assert_eq!(upgraded.decode(&new_bytes).unwrap(), upgraded_state);
    assert!(matches!(base.decode(&new_bytes), Err(Error::Integrity)));
    assert!(matches!(upgraded.decode(&old_bytes), Err(Error::Integrity)));
    let projected = upgraded
        .project(&upgraded_state, "account-pet-v3-fire-icarus")
        .unwrap();
    let view: serde_json::Value = serde_json::from_slice(&projected).unwrap();
    assert_eq!(
        view["participants"][0]["skillLevels"],
        serde_json::json!([1, 2, 1, 1, 1])
    );
    assert!(view["participants"][1].get("skillLevels").is_none());
}

#[test]
fn solo_functional_runtime_projects_one_seat_and_commits_typed_completion() {
    let bundle = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-functional-v1.candidate.json"
    ));
    let seats = seats();
    let loadouts = bindings(bundle, &seats);
    let boss_id = "cinder-terraces-warden";
    let solo = Rules::load_solo(
        bundle,
        seats[0].clone(),
        boss_id.into(),
        &loadouts[0],
        vec![],
    )
    .unwrap();
    let coop = Rules::load(bundle, seats.clone(), boss_id.into(), Some(&loadouts)).unwrap();
    let account = &seats[0].account;
    let initial = solo.initial();
    assert_ne!(solo.content_hash(), coop.content_hash());
    assert_eq!(initial.participants.len(), 1);
    assert_eq!(initial.boss.max_hp, 1700);
    assert!(!solo.authorize(
        &initial,
        &seats[1].account,
        &CoopCommand::new(CoopAction::Start)
    ));
    assert!(solo.authorize(&initial, account, &CoopCommand::new(CoopAction::Start)));
    assert!(coop.decode(&solo.encode(&initial).unwrap()).is_err());
    assert!(solo.decode(&coop.encode(&coop.initial()).unwrap()).is_err());

    let seed = SecretSeed::from_host_entropy([31; 32]);
    let mut stream = seed
        .stream(Value::Text("solo-functional-runtime".into()), 0)
        .unwrap();
    let mut playing = solo
        .engine()
        .reduce(&initial, CoopAction::Start, &mut stream)
        .unwrap()
        .state;
    let value: serde_json::Value =
        serde_json::from_slice(&solo.project(&playing, account).unwrap()).unwrap();
    assert_eq!(value["ruleset"]["id"], "arena8-functional-pve");
    assert_eq!(value["ruleset"]["version"], 1);
    assert_eq!(value["you"], 0);
    assert_eq!(value["participants"].as_array().unwrap().len(), 1);
    assert_eq!(value["board"].as_array().unwrap().len(), 64);
    assert!(
        value["board"]
            .as_array()
            .unwrap()
            .iter()
            .all(|tile| tile.get("kind").is_some() && tile.get("element").is_none())
    );
    assert!(
        value["abilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|skill| skill["kind"] == "fire-zone")
    );
    assert!(solo.project(&playing, &seats[1].account).is_err());
    assert_eq!(
        solo.decode(&solo.encode(&playing).unwrap()).unwrap(),
        playing
    );
    let mut completed = None;
    for _ in 0..26 {
        let (first, second) = solo.engine().legal_swap(&playing).unwrap();
        let decision = solo
            .engine()
            .reduce(&playing, CoopAction::Swap { first, second }, &mut stream)
            .unwrap();
        playing = decision.state;
        if let Some(payload) = decision.settlement {
            completed = Some(payload);
            break;
        }
    }
    assert!(completed.is_some());
    let Completion::Proposal(proposal) = solo.completion(&playing).unwrap() else {
        panic!("expected solo settlement proposal");
    };
    assert_eq!(proposal["kind"], "solo.completed.v1");
    assert!(proposal.get("encounterId").is_none());
    assert_eq!(proposal["ruleset"], "arena8-functional-pve");
    assert_eq!(proposal["participants"].as_array().unwrap().len(), 1);
    assert_eq!(proposal["participants"][0]["account"], account.as_str());
    assert!(
        solo.engine()
            .reduce(&playing, CoopAction::Guard, &mut stream)
            .is_err()
    );
}

#[test]
fn solo_regular_projection_and_settlement_bind_to_authored_encounter() {
    let bundle = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-functional-v1.candidate.json"
    ));
    let seats = seats();
    let loadouts = bindings(bundle, &seats);
    let solo = |id: &str| {
        Rules::load_solo(bundle, seats[0].clone(), id.into(), &loadouts[0], vec![]).unwrap()
    };
    let account = &seats[0].account;
    let regular = solo("cinder-terraces-regular");
    let boss = solo("cinder-terraces-warden");

    let initial = regular.initial();
    let view: serde_json::Value =
        serde_json::from_slice(&regular.project(&initial, account).unwrap()).unwrap();
    assert_eq!(view["bossId"], "cinder-terraces-regular");
    assert_eq!(view["boss"]["maxHp"], 420);
    assert!(boss.decode(&regular.encode(&initial).unwrap()).is_err());
    assert!(regular.completion(&initial).is_err());

    // Drive real accepted swaps to obtain a terminal proposal.
    let entropy = SecretSeed::from_host_entropy([31; 32]);
    let mut rng = entropy
        .stream(Value::Text("functional-regular-match".into()), 0)
        .unwrap();
    let mut state = regular
        .engine()
        .reduce(&initial, CoopAction::Start, &mut rng)
        .unwrap()
        .state;
    for _ in 0..15 {
        let (first, second) = regular.engine().legal_swap(&state).unwrap();
        state = regular
            .engine()
            .reduce(&state, CoopAction::Swap { first, second }, &mut rng)
            .unwrap()
            .state;
        if state.phase.terminal() {
            break;
        }
    }
    assert!(state.phase.terminal());
    assert_eq!(state.boss.phase, 1);
    let Completion::Proposal(proposal) = regular.completion(&state).unwrap() else {
        panic!("expected solo regular proposal")
    };
    assert_eq!(proposal["encounterId"], "cinder-terraces-regular");
    assert_eq!(proposal["kind"], "solo.completed.v1");
    assert_eq!(proposal["configDigest"], view["ruleset"]["configDigest"]);
    assert_eq!(proposal["contentHash"], view["ruleset"]["contentHash"]);
    assert_eq!(proposal["participants"].as_array().unwrap().len(), 1);
}

#[test]
fn v1_v2_functional_v1_projections_omit_v3_only_fields() {
    let f1_bundle = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-functional-v1.candidate.json"
    ));
    let roster = seats();
    let f1_rules = Rules::load(
        f1_bundle,
        roster.clone(),
        "cinder-terraces-warden".into(),
        Some(&bindings(f1_bundle, &roster)),
    )
    .unwrap();
    let v2_rules = rules();
    for (label, game) in [("v2", &v2_rules), ("functional-v1", &f1_rules)] {
        let initial = game.initial();
        let view: serde_json::Value = serde_json::from_slice(
            &game
                .project(&initial, "account-pet-v3-fire-icarus")
                .unwrap(),
        )
        .unwrap();
        let obj = view.as_object().unwrap();
        for forbidden in [
            "turnTimeoutMs",
            "turnDeadlineUnixMs",
            "turnRemainingMs",
            "serverUnixMs",
            "maxRounds",
            "canEndTurn",
            "fireZoneActiveTurns",
            "fireZoneCells",
        ] {
            assert!(!obj.contains_key(forbidden), "{label} leaked {forbidden}");
        }
        for seat in view["participants"].as_array().unwrap() {
            let s_obj = seat.as_object().unwrap();
            for forbidden in ["hasUltimate", "ultimateReady", "fireZoneTurns", "passives"] {
                assert!(
                    !s_obj.contains_key(forbidden),
                    "{label} seat leaked {forbidden}"
                );
            }
        }
        if let Some(abilities) = view.get("abilities").and_then(|v| v.as_array()) {
            for ab in abilities {
                let a_obj = ab.as_object().unwrap();
                for forbidden in ["maxCooldown", "effectKind", "target", "powerPm"] {
                    assert!(
                        !a_obj.contains_key(forbidden),
                        "{label} ability leaked {forbidden}"
                    );
                }
            }
        }
    }
}

#[test]
fn v3_projection_timers_abilities_ultimate_and_fire_zone_contract() {
    use super::domain::SYSTEM_ACTOR_ID;
    use crate::features::runtime::application::system_expire_command_id;
    use aetheria_pet_arena::arena8::coop::{FIRE_ZONE_CELLS, V3_RULESET_VERSION};
    use std::sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    };
    use uuid::Uuid;

    let v3_bundle = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-functional-v2.candidate.json"
    ));
    let roster = seats();
    let loadouts = bindings(v3_bundle, &roster);
    let fake_clock = Arc::new(AtomicU64::new(1_700_000_000_000));
    let clock_clone = Arc::clone(&fake_clock);
    let rules = Rules::load(
        v3_bundle,
        roster,
        "cinder-terraces-warden".into(),
        Some(&loadouts),
    )
    .unwrap()
    .with_clock(Arc::new(move || clock_clone.load(Ordering::Acquire)));

    let ready_state = rules.initial();
    let ready_bytes = rules
        .project(&ready_state, "account-pet-v3-fire-icarus")
        .unwrap();
    assert!(ready_bytes.len() <= 16_384);
    let ready_view: serde_json::Value = serde_json::from_slice(&ready_bytes).unwrap();
    assert_eq!(ready_view["ruleset"]["version"], V3_RULESET_VERSION);
    assert_eq!(ready_view["turnTimeoutMs"], 15_000);
    assert_eq!(ready_view["turnDeadlineUnixMs"], serde_json::Value::Null);
    assert_eq!(ready_view["turnRemainingMs"], serde_json::Value::Null);
    assert_eq!(ready_view["serverUnixMs"], 1_700_000_000_000u64);
    assert_eq!(ready_view["maxRounds"], serde_json::Value::Null);
    assert_eq!(ready_view["canEndTurn"], false);
    assert_eq!(ready_view["fireZoneActiveTurns"], 0);
    assert_eq!(ready_view["fireZoneCells"], serde_json::json!([]));
    assert!(ready_view.get("team").is_none());

    let seed = SecretSeed::from_host_entropy([9; 32]);
    let mut rng = seed.stream(Value::Text("v3-view".into()), 0).unwrap();
    let playing = rules
        .engine()
        .reduce_stamped(
            &ready_state,
            CoopAction::Start,
            Some(fake_clock.load(Ordering::Acquire)),
            &mut rng,
        )
        .unwrap()
        .state;

    // 6s elapsed => 9_000ms remaining, active seat canEndTurn = true, inactive seat false.
    fake_clock.store(1_700_000_006_000, Ordering::Release);
    let active_bytes = rules
        .project(&playing, "account-pet-v3-fire-icarus")
        .unwrap();
    assert!(active_bytes.len() <= 16_384);
    let active_view: serde_json::Value = serde_json::from_slice(&active_bytes).unwrap();
    assert_eq!(active_view["turnDeadlineUnixMs"], 1_700_000_015_000u64);
    assert_eq!(active_view["turnRemainingMs"], 9_000);
    assert_eq!(active_view["serverUnixMs"], 1_700_000_006_000u64);
    assert_eq!(active_view["canEndTurn"], true);
    let active_abilities = active_view["abilities"].as_array().unwrap();
    assert_eq!(active_abilities.len(), 5);
    for ability in active_abilities {
        assert!(ability.get("maxCooldown").is_some());
        assert!(ability.get("effectKind").is_some());
        assert!(ability.get("target").is_some());
        assert!(ability.get("powerPm").is_some());
    }
    for (idx, seat) in active_view["participants"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        assert_eq!(seat["hasUltimate"], true, "seat {idx}");
        assert_eq!(seat["ultimateReady"], false, "seat {idx}");
        assert_eq!(seat["fireZoneTurns"], 0, "seat {idx}");
        assert_eq!(seat["passives"], serde_json::json!([]), "seat {idx}");
    }
    let inactive_view: serde_json::Value = serde_json::from_slice(
        &rules
            .project(&playing, "account-pet-v31-water-marivell")
            .unwrap(),
    )
    .unwrap();
    assert_eq!(inactive_view["canEndTurn"], false);

    // At or past deadline, turnRemainingMs clamps to 0 and canEndTurn becomes false.
    fake_clock.store(1_700_000_020_000, Ordering::Release);
    let expired_view: serde_json::Value = serde_json::from_slice(
        &rules
            .project(&playing, "account-pet-v3-fire-icarus")
            .unwrap(),
    )
    .unwrap();
    assert_eq!(expired_view["turnRemainingMs"], 0);
    assert_eq!(expired_view["canEndTurn"], false);

    // Charge Icarus ultimate & cast FireZone; inspect fireZoneCells and ultimateReady.
    let mut charged = playing.clone();
    charged.participants[0].mana = 100;
    charged.participants[0].rage = 100;
    charged.participants[1].rage = 100;
    let charged_view: serde_json::Value = serde_json::from_slice(
        &rules
            .project(&charged, "account-pet-v3-fire-icarus")
            .unwrap(),
    )
    .unwrap();
    assert_eq!(charged_view["participants"][0]["ultimateReady"], true);
    assert_eq!(charged_view["participants"][1]["ultimateReady"], true);

    fake_clock.store(1_700_000_007_000, Ordering::Release);
    let fired = rules
        .engine()
        .reduce_stamped(
            &charged,
            CoopAction::FireZone,
            Some(fake_clock.load(Ordering::Acquire)),
            &mut rng,
        )
        .unwrap()
        .state;
    let fire_bytes = rules.project(&fired, "account-pet-v3-fire-icarus").unwrap();
    assert!(fire_bytes.len() <= 16_384);
    let fire_view: serde_json::Value = serde_json::from_slice(&fire_bytes).unwrap();
    assert_eq!(fire_view["participants"][0]["fireZoneTurns"], 2);
    assert_eq!(fire_view["participants"][1]["fireZoneTurns"], 0);
    assert_eq!(fire_view["fireZoneActiveTurns"], 2);
    assert_eq!(
        fire_view["fireZoneCells"],
        serde_json::json!(FIRE_ZONE_CELLS)
    );

    // Intent parsing + authorization boundaries for EndTurn & ExpireTurn.
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":2,"action":{"kind":"endTurn"}}"#,
            )
            .unwrap(),
        (2, CoopCommand::new(CoopAction::EndTurn))
    );
    assert!(matches!(
        rules.parse(
            "arena8-coop.intent.v1",
            br#"{"epoch":2,"action":{"kind":"expireTurn","turnIndex":0}}"#,
        ),
        Err(Error::Invalid)
    ));
    let expire_cmd =
        CoopCommand::timed(CoopAction::ExpireTurn { turn_index: 0 }, 1_700_000_016_000);
    assert!(!rules.authorize(&playing, "account-pet-v3-fire-icarus", &expire_cmd));
    assert!(rules.authorize(&playing, SYSTEM_ACTOR_ID, &expire_cmd));
    assert!(!rules.authorize(
        &playing,
        SYSTEM_ACTOR_ID,
        &CoopCommand::new(CoopAction::EndTurn)
    ));
    assert!(rules.authorize(
        &playing,
        "account-pet-v3-fire-icarus",
        &CoopCommand::new(CoopAction::EndTurn)
    ));

    // Deterministic system command id per (match_id, turn_index).
    let match_a = Uuid::from_u128(0x1111_2222_3333_4444_5555_6666_7777_8888);
    let match_b = Uuid::from_u128(0x1111_2222_3333_4444_5555_6666_7777_8889);
    let id0 = system_expire_command_id(match_a, 0);
    assert_eq!(id0, system_expire_command_id(match_a, 0));
    assert_ne!(id0, system_expire_command_id(match_a, 1));
    assert_ne!(id0, system_expire_command_id(match_b, 0));
    assert!(!id0.is_nil());
}
