#[path = "../examples/support/mod.rs"]
mod support;
use proptest::prelude::*;
use std::collections::BTreeMap;
use support::{Fixture, State};
use vl_game_core::{
    Canonical, Checkpoint, Command, Error, Fixed, LogicalClock, Reducer, SecretSeed, Value, apply,
    begin, canonical,
};

fn clock(turn: u64) -> LogicalClock {
    LogicalClock {
        server_tick: turn,
        logical_time_ms: 1000 + turn,
    }
}
fn initial(seed: &SecretSeed) -> Checkpoint<State> {
    begin(
        &Fixture,
        [1; 16],
        State {
            total: Fixed::from_raw(0),
            hidden_roll: 0,
        },
        seed,
        clock(0),
    )
    .unwrap()
}
fn command(version: u64, amount: i64) -> Command<Value> {
    Command {
        id: [2; 16],
        match_id: [1; 16],
        expected_version: version,
        ruleset: Fixture.ruleset(),
        action: Value::Int(amount),
    }
}

#[test]
fn canonical_frozen_bytes_and_order_are_unambiguous() {
    let value = Value::List(vec![
        Value::Null,
        Value::Bool(true),
        Value::Int(-1),
        Value::Uint(u64::MAX),
        Value::Text("a".into()),
    ]);
    let mut expected = b"VL-CANON\x01\x06\0\0\0\x05\0\x01\x01\x02".to_vec();
    expected.extend_from_slice(&(-1_i64).to_be_bytes());
    expected.push(3);
    expected.extend_from_slice(&u64::MAX.to_be_bytes());
    expected.extend_from_slice(b"\x05\0\0\0\x01a");
    assert_eq!(canonical::encode(&value).unwrap(), expected);
    let a: BTreeMap<_, _> = [("b".into(), Value::Uint(2)), ("a".into(), Value::Uint(1))].into();
    let b: BTreeMap<_, _> = [("a".into(), Value::Uint(1)), ("b".into(), Value::Uint(2))].into();
    assert_eq!(
        canonical::encode(&Value::Map(a)).unwrap(),
        canonical::encode(&Value::Map(b)).unwrap()
    );
    assert_ne!(
        canonical::hash("a", &Value::Int(1)).unwrap(),
        canonical::hash("b", &Value::Int(1)).unwrap()
    );
    assert_ne!(
        canonical::encode(&Value::Int(1)).unwrap(),
        canonical::encode(&Value::Uint(1)).unwrap()
    );
    assert_ne!(
        canonical::encode(&Value::Text("a".into())).unwrap(),
        canonical::encode(&Value::Bytes(vec![97])).unwrap()
    );
}

#[test]
fn canonical_capacity_depth_and_nodes_are_bounded() {
    assert_eq!(
        canonical::encode(&Value::Bytes(vec![0; 1_048_576])),
        Err(Error::Capacity)
    );
    assert_eq!(
        canonical::encode(&Value::List(vec![Value::Null; 30_000])),
        Err(Error::Capacity)
    );
    let mut deep = Value::Null;
    for _ in 0..33 {
        deep = Value::List(vec![deep]);
    }
    assert_eq!(canonical::encode(&deep), Err(Error::Capacity));
}

#[test]
fn fixed_edges_truncate_toward_zero_and_never_wrap() {
    assert_eq!(
        Fixed::from_raw(-1001)
            .checked_mul(Fixed::from_raw(500))
            .unwrap()
            .raw(),
        -500
    );
    assert_eq!(
        Fixed::from_raw(-1)
            .checked_div(Fixed::from_raw(3))
            .unwrap()
            .raw(),
        -333
    );
    assert_eq!(
        Fixed::from_raw(i64::MAX).checked_add(Fixed::from_raw(1)),
        Err(Error::Arithmetic)
    );
    assert_eq!(
        Fixed::from_raw(i64::MIN).checked_sub(Fixed::from_raw(1)),
        Err(Error::Arithmetic)
    );
    assert_eq!(
        Fixed::from_raw(i64::MIN).checked_div(Fixed::from_raw(-1)),
        Err(Error::Arithmetic)
    );
    assert_eq!(
        Fixed::from_raw(1).checked_div(Fixed::from_raw(0)),
        Err(Error::Arithmetic)
    );
    assert_eq!(Fixed::from_integer(i64::MAX), Err(Error::Arithmetic));
}

#[test]
fn metadata_failures_and_rejected_draws_leave_checkpoint_unchanged() {
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let mut state = initial(&seed);
    let before = canonical::encode(&state.state.canonical()).unwrap();
    for amount in [-1, 0, 1001, i64::MIN, i64::MAX] {
        assert!(matches!(
            apply(&Fixture, &state, &command(0, amount), &seed, clock(1)),
            Err(Error::InvalidAction)
        ));
        assert_eq!(state.version, 0);
        assert_eq!(state.rng_cursor, 0);
        assert_eq!(canonical::encode(&state.state.canonical()).unwrap(), before);
    }
    let mut bad = command(1, 1);
    assert!(matches!(
        apply(&Fixture, &state, &bad, &seed, clock(1)),
        Err(Error::VersionConflict)
    ));
    bad.expected_version = 0;
    bad.ruleset.version = 2;
    assert!(matches!(
        apply(&Fixture, &state, &bad, &seed, clock(1)),
        Err(Error::ContentMismatch)
    ));
    bad = command(0, 1);
    bad.match_id = [9; 16];
    assert!(matches!(
        apply(&Fixture, &state, &bad, &seed, clock(1)),
        Err(Error::VersionConflict)
    ));
    bad.match_id = state.match_id;
    bad.id = [0; 16];
    assert!(matches!(
        apply(&Fixture, &state, &bad, &seed, clock(1)),
        Err(Error::VersionConflict)
    ));
    assert!(matches!(
        apply(
            &Fixture,
            &state,
            &command(0, 1),
            &seed,
            LogicalClock {
                server_tick: 1,
                logical_time_ms: 999
            }
        ),
        Err(Error::ClockRegression)
    ));
    assert!(matches!(
        apply(
            &Fixture,
            &state,
            &command(0, 1),
            &SecretSeed::from_host_entropy([8; 32]),
            clock(1)
        ),
        Err(Error::InvalidState)
    ));
    state.version = u64::MAX;
    assert!(matches!(
        apply(&Fixture, &state, &command(u64::MAX, 1), &seed, clock(1)),
        Err(Error::VersionConflict)
    ));
    state.version = 0;
    state.state.hidden_roll = 100;
    assert!(matches!(
        apply(&Fixture, &state, &command(0, 1), &seed, clock(1)),
        Err(Error::InvalidState)
    ));
}

#[test]
fn restore_resumes_stream_and_hash_chain_without_public_secret() {
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let state = initial(&seed);
    let first = apply(&Fixture, &state, &command(0, 7), &seed, clock(1)).unwrap();
    let restored = first.next.clone();
    let a = apply(&Fixture, &first.next, &command(1, 8), &seed, clock(2)).unwrap();
    let b = apply(&Fixture, &restored, &command(1, 8), &seed, clock(2)).unwrap();
    assert_eq!(a.audit_record, b.audit_record);
    assert_eq!(a.next.audit_hash, b.next.audit_hash);
    assert_eq!(a.events, vec![Value::Int(15)]);
    assert_eq!(first.next.rng_cursor, 1);
    assert_eq!(a.next.rng_cursor, 2);
    assert_ne!(a.next.audit_hash, first.next.audit_hash);
    assert!(!a.audit_record.windows(32).any(|v| v == [7; 32]));
    let mut altered = restored;
    altered.audit_hash = [9; 32];
    assert_ne!(
        apply(&Fixture, &altered, &command(1, 8), &seed, clock(2))
            .unwrap()
            .next
            .audit_hash,
        a.next.audit_hash
    );
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]
    #[test]
    fn replay_matches_all_events_hashes_and_private_state(amounts in prop::collection::vec(1_i64..1001, 1..128), seed_bytes in any::<[u8;32]>()) {
        let seed = SecretSeed::from_host_entropy(seed_bytes);
        let mut a = initial(&seed); let mut b = initial(&seed);
        for (index, amount) in amounts.into_iter().enumerate() {
            let cmd = command(index as u64, amount);
            let left = apply(&Fixture, &a, &cmd, &seed, clock(index as u64 + 1)).unwrap();
            let right = apply(&Fixture, &b, &cmd, &seed, clock(index as u64 + 1)).unwrap();
            prop_assert_eq!(&left.audit_record, &right.audit_record);
            prop_assert_eq!(left.next.audit_hash, right.next.audit_hash);
            prop_assert_eq!(&left.events, &right.events);
            prop_assert_eq!(&left.next.state, &right.next.state);
            a = left.next; b = right.next;
        }
    }
    #[test]
    fn invalid_actions_do_not_advance_entropy(amount in any::<i64>().prop_filter("invalid amount", |v| !(1..=1000).contains(v))) {
        let seed = SecretSeed::from_host_entropy([7;32]);
        let state = initial(&seed);
        prop_assert!(matches!(apply(&Fixture, &state, &command(0, amount), &seed, clock(1)), Err(Error::InvalidAction)));
        let a = apply(&Fixture, &state, &command(0, 5), &seed, clock(1)).unwrap();
        let b = apply(&Fixture, &initial(&seed), &command(0, 5), &seed, clock(1)).unwrap();
        prop_assert_eq!(a.next.audit_hash, b.next.audit_hash);
    }
    #[test]
    fn fixed_arithmetic_matches_wide_integer_reference(a in any::<i64>(), b in any::<i64>()) {
        let left = Fixed::from_raw(a); let right = Fixed::from_raw(b);
        let expected = i64::try_from(i128::from(a) * i128::from(b) / 1000).map(Fixed::from_raw).map_err(|_| Error::Arithmetic);
        prop_assert_eq!(left.checked_mul(right), expected);
        if b != 0 {
            let expected = i64::try_from(i128::from(a) * 1000 / i128::from(b)).map(Fixed::from_raw).map_err(|_| Error::Arithmetic);
            prop_assert_eq!(left.checked_div(right), expected);
        }
    }
}
