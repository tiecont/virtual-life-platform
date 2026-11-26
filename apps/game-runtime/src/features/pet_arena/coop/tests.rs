use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::binding::ArtifactSlot;
use aetheria_pet_arena::arena8::coop::{
    ArtifactLoadout, CoopAction, CoopConfig, CoopPhase, EquippedArtifact, SEATS, SeatInput,
    content_hash,
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
fn intents_are_strict_and_never_carry_authority() {
    let rules = rules();
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":7,"action":{"kind":"start"}}"#
            )
            .expect("start"),
        (7, CoopAction::Start)
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
            CoopAction::Swap {
                first: 1,
                second: 2
            }
        )
    );
    assert_eq!(
        rules
            .parse(
                "arena8-coop.intent.v1",
                br#"{"epoch":9,"action":{"kind":"fireZone"}}"#
            )
            .expect("fire zone"),
        (9, CoopAction::FireZone)
    );
    for payload in [
        br#"{"epoch":1,"action":{"kind":"unknown"}}"#.as_slice(),
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
    assert!(rules.authorize(&state, "account-pet-v3-fire-icarus", &CoopAction::Start));
    assert!(!rules.authorize(&state, "account-pet-v31-water-marivell", &CoopAction::Start));
    assert!(!rules.authorize(&state, "account-outsider", &CoopAction::Guard));
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
        "/../../config/gameplay/arena8-coop-v1.seed.json"
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
