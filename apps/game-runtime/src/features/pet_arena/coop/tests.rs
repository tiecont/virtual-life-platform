use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use aetheria_persistence::{Completion, Error, Game};
use aetheria_pet_arena::arena8::coop::{CoopAction, CoopPhase, SEATS, SeatInput, content_hash};

fn bundle() -> Vec<u8> {
    std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-v1.seed.json"
    ))
    .expect("committed seed bundle")
}

fn seats() -> [SeatInput; SEATS] {
    ["icarus", "coralline", "volt", "terran"].map(|pet| SeatInput {
        account: format!("account-{pet}"),
        pet_id: pet.into(),
        level: 1,
        artifact_power_pm: 1_000,
    })
}

fn rules() -> Rules {
    Rules::load(&bundle(), seats()).expect("valid seed bundle and seats")
}

#[test]
fn bundle_binds_the_published_configuration_and_a_ready_board() {
    let rules = rules();
    let state = rules.initial().expect("allocation");
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
        ["icarus", "coralline", "volt", "terran"]
    );
    assert!(state.board.iter().all(Option::is_none));
}

#[test]
fn durable_state_roundtrips_and_rejects_a_different_allocation() {
    let rules = rules();
    let state = rules.initial().expect("allocation");
    let bytes = rules.encode(&state).expect("encode");
    assert_eq!(rules.decode(&bytes).expect("decode"), state);
    let mut other = seats();
    other[2].account = "someone-else".into();
    let foreign = Rules::load(&bundle(), other).expect("foreign allocation");
    assert!(matches!(foreign.decode(&bytes), Err(Error::Integrity)));
    let mut tampered = state.clone();
    tampered.config_digest = [0u8; 32];
    assert!(matches!(rules.encode(&tampered), Err(Error::Integrity)));
}

#[test]
fn membership_and_projection_are_scoped_to_the_authenticated_seat() {
    let rules = rules();
    let state = rules.initial().expect("allocation");
    assert!(rules.member(&state, "account-icarus"));
    assert!(!rules.member(&state, "account-outsider"));
    assert_eq!(rules.seat(&state, "account-volt"), Some(2));
    let projected = rules.project(&state, "account-volt").expect("projection");
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
fn invalid_bundles_and_allocations_fail_closed() {
    assert!(Rules::load(b"", seats()).is_err());
    let mut duplicate = seats();
    duplicate[1].account = duplicate[0].account.clone();
    assert!(Rules::load(&bundle(), duplicate).is_err());
    let mut repeated_pet = seats();
    repeated_pet[1].pet_id = repeated_pet[0].pet_id.clone();
    assert!(Rules::load(&bundle(), repeated_pet).is_err());
    let mut level_zero = seats();
    level_zero[0].level = 0;
    assert!(Rules::load(&bundle(), level_zero).is_err());
    let mut too_powerful = seats();
    too_powerful[0].artifact_power_pm = 5_001;
    assert!(Rules::load(&bundle(), too_powerful).is_err());
}

#[test]
fn only_a_terminal_state_completes_the_match() {
    let rules = rules();
    let state = rules.initial().expect("allocation");
    assert!(matches!(rules.completion(&state), Err(Error::Invalid)));
    let mut won = state.clone();
    won.phase = CoopPhase::Won;
    assert!(matches!(rules.completion(&won), Ok(Completion::Game)));
}
