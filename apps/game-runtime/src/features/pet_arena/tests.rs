use super::domain::{Rules, State, content_hash};
use crate::features::runtime::application::NativeGame;
use vl_game_core::{Command, LogicalClock, Reducer, SecretSeed, apply, begin};
use vl_persistence::{Completion, Game};
use vl_pet_arena::combat::{Action, Phase, legal_swap};
const PLAYER: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
fn fixture_rules() -> Rules {
    Rules {
        player: PLAYER.into(),
        pet: 0,
        stage: 0,
    }
}
#[test]
fn adapter_contract_rejects_forgery_and_cross_account_projection() {
    let rules = fixture_rules();
    let state = rules.initial().unwrap();
    assert!(rules.completion(&state).is_err());
    assert!(rules.project(&state, "intruder").is_err());
    assert!(!rules.can_spectate(&state, "intruder"));
    for bytes in [
        br#"{"epoch":1,"action":{"kind":"start","reward":9000}}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"swap","first":256,"second":0}}"#,
        br#"{"epoch":1,"action":{"kind":"reward"}}"#,
    ] {
        assert!(rules.parse("pet.intent.v1", bytes).is_err());
    }
    assert!(
        rules
            .parse("fixture.advance.v1", br#"{"epoch":1}"#)
            .is_err()
    );
    let bytes = rules.encode(&state).unwrap();
    let mut other = fixture_rules();
    other.stage = 1;
    assert!(other.decode(&bytes).is_err());
    let other = State {
        player: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".into(),
        combat: state.combat,
    };
    assert!(rules.validate(&other).is_err());
    assert_ne!(content_hash(), vl_pet_arena::combat::rules_hash());
}
#[test]
fn terminal_sentinel_is_server_derived_and_replayable_for_wins_and_losses() {
    let rules = fixture_rules();
    for lose in [false, true] {
        let seed = SecretSeed::from_host_entropy([7; 32]);
        let mut checkpoint = begin(
            &rules,
            [1; 16],
            rules.initial().unwrap(),
            &seed,
            LogicalClock {
                server_tick: 0,
                logical_time_ms: 0,
            },
        )
        .unwrap();
        loop {
            let state = &checkpoint.state.combat;
            let action = if state.phase() == Phase::Ready {
                Action::Start
            } else if lose {
                Action::Pass
            } else if state.cooldown() == 0 {
                Action::Skill
            } else {
                let (first, second) = legal_swap(state.board()).unwrap();
                Action::Swap { first, second }
            };
            let version = checkpoint.version + 1;
            let result = apply(
                &rules,
                &checkpoint,
                &Command {
                    id: [version as u8; 16],
                    match_id: [1; 16],
                    expected_version: checkpoint.version,
                    ruleset: rules.ruleset(),
                    action,
                },
                &seed,
                LogicalClock {
                    server_tick: version,
                    logical_time_ms: version,
                },
            )
            .unwrap();
            let terminal = matches!(result.next.state.combat.phase(), Phase::Won | Phase::Lost);
            assert_eq!(result.settlement.is_some(), terminal);
            let encoded = rules.encode(&result.next.state).unwrap();
            assert_eq!(
                rules.decode(&encoded).unwrap().combat,
                result.next.state.combat
            );
            if terminal {
                assert!(
                    matches!(rules.completion(&result.next.state).unwrap(), Completion::PetArena { won } if won == !lose)
                );
                let projection = rules.project(&result.next.state, PLAYER).unwrap();
                assert!(!String::from_utf8(projection).unwrap().contains(PLAYER));
                break;
            }
            checkpoint = result.next;
        }
    }
}
