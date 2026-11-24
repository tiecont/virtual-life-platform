//! Frozen-compatibility pins.
//!
//! These digests were captured from the committed source before the Wave B
//! binding/reducer refactor. The refactor must not change any of them: the 6x6
//! V1 reducer, the V3 taxonomy, the Wave 1 action replay and the arena8 v1
//! six-Pet reducer stay byte-compatible.
use aetheria_game_core::{LogicalClock, Reducer, SecretSeed};
use aetheria_pet_arena::arena8::{Action, Arena8Engine, Phase};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn play(pet: u8, encounter: u8) -> (String, String, u16, Phase) {
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let mut engine = Arena8Engine::new(
        seed,
        [42; 16],
        pet,
        encounter,
        LogicalClock {
            server_tick: 0,
            logical_time_ms: 0,
        },
    )
    .unwrap();
    let mut next = 1_u8;
    loop {
        let state = engine.state();
        if state.phase().terminal() {
            break;
        }
        let action = if state.phase() == Phase::Ready {
            Action::Start
        } else {
            let legal = state.board().legal_move().unwrap();
            Action::Swap {
                first: legal.first,
                second: legal.second,
            }
        };
        let version = engine.version();
        engine
            .submit(
                [next; 16],
                version,
                action,
                LogicalClock {
                    server_tick: version + 1,
                    logical_time_ms: (version + 1) * 1000,
                },
            )
            .unwrap();
        next = next.wrapping_add(1);
    }
    let replay = engine.replay();
    (
        hex(&replay.digest()),
        hex(&replay.final_state_hash),
        u16::try_from(engine.version()).unwrap(),
        engine.state().phase(),
    )
}

#[test]
fn arena8_v1_replays_are_byte_compatible() {
    for (pet, encounter, replay, state, version, phase) in [
        (
            0,
            0,
            "e182eaf745490ddc725483f6e519b5dfeed3aef39eef49d063d0897b19d8b4c2",
            "b04717c834a070710557ffd1b587fe30f3eaf2386ee71ca2af488339e95ab868",
            10,
            Phase::Won,
        ),
        (
            3,
            5,
            "c261abb124198dec0ca722adae2af37c4c56214a2959266f7e4f0d8bd1cfa968",
            "a0df76d9815891e8cf7a5af07486113a94601aa334763ce0b877617478374877",
            10,
            Phase::Lost,
        ),
        (
            5,
            11,
            "cfa10e844f118d862436ab0c873a6aeb796869d8d8379838dee667610a0f444c",
            "7751f6133b592179fc50b2816260b4299a06a72698c3fdb4a2095f6c18c6c7f4",
            11,
            Phase::Lost,
        ),
    ] {
        let (actual_replay, actual_state, actual_version, actual_phase) = play(pet, encounter);
        assert_eq!(actual_replay, replay, "arena8 v1 replay changed");
        assert_eq!(actual_state, state, "arena8 v1 final state changed");
        assert_eq!(actual_version, version);
        assert_eq!(actual_phase, phase);
    }
}

#[test]
fn frozen_v1_v3_and_wave1_digests_are_unchanged() {
    assert_eq!(
        hex(&aetheria_pet_arena::arena8::rules_hash().unwrap()),
        "abbb42ac44be33526dac273b229bffaa525f330b9daaf9636d4f1842d228b4c7"
    );
    assert_eq!(
        hex(&aetheria_pet_arena::combat::rules_hash()),
        "457e9ddd981a25b1014314b17bc4e014950d8e19eabf3ec3ec386e2b12aabbfb"
    );
    assert_eq!(
        aetheria_pet_arena::wave1_mvp::rules_hash_hex().unwrap(),
        "769f4b614239d4fb083f4e80194b39275521eefc4ef83f451e87f2642b7ce1c5"
    );
    assert_eq!(
        hex(&aetheria_pet_arena::content::CONTENT_HASH),
        "90945367c761daebcc4a15506e47f349821f479945cc47fbf85072f7cd0651ac"
    );
    // The bound ruleset is a separate version: it never reuses the v1 id.
    let bound = aetheria_pet_arena::arena8::Arena8Bound;
    assert_eq!(
        aetheria_pet_arena::arena8::binding::BOUND_RULESET_ID,
        "aetheria-pet-arena-arena8-pve"
    );
    assert_ne!(bound.ruleset().id, aetheria_pet_arena::arena8::RULESET_ID);
}
