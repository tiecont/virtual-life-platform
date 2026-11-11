use std::{fs, path::PathBuf, process::Command as Process};
use vl_game_core::{Checkpoint, Command, Error, LogicalClock, Reducer, SecretSeed, apply, begin};
use vl_pet_arena::combat::{Action, Combat, Phase, State, legal_swap, rules_hash};

const MATCH: [u8; 16] = [41; 16];
fn clock(version: u64) -> LogicalClock {
    LogicalClock {
        server_tick: version,
        logical_time_ms: version * 1000,
    }
}
fn advance(
    previous: &Checkpoint<State>,
    action: Action,
    seed: &SecretSeed,
) -> Result<Checkpoint<State>, Error> {
    let mut id = [0; 16];
    id[..8].copy_from_slice(&(previous.version + 1).to_be_bytes());
    Ok(apply(
        &Combat,
        previous,
        &Command {
            id,
            match_id: MATCH,
            expected_version: previous.version,
            ruleset: Combat.ruleset(),
            action,
        },
        seed,
        clock(previous.version + 1),
    )?
    .next)
}
fn start(pet: u8, stage: u8, seed: &SecretSeed) -> Checkpoint<State> {
    let checkpoint = begin(
        &Combat,
        MATCH,
        State::new(pet, stage).unwrap(),
        seed,
        clock(0),
    )
    .unwrap();
    advance(&checkpoint, Action::Start, seed).unwrap()
}
fn intent(state: &State) -> Action {
    // Test driver chooses an intent from the board; all effects stay in Rust.
    if state.cooldown() == 0 {
        Action::Skill
    } else {
        let (first, second) = legal_swap(state.board()).unwrap();
        Action::Swap { first, second }
    }
}
fn finish(mut checkpoint: Checkpoint<State>, seed: &SecretSeed) -> Checkpoint<State> {
    while checkpoint.state.phase() == Phase::Playing {
        checkpoint = advance(&checkpoint, intent(&checkpoint.state), seed).unwrap();
        assert!(checkpoint.state.turn() <= 60);
        assert!(checkpoint.rng_cursor < checkpoint.version * vl_game_core::MAX_WORDS_PER_TURN);
        assert!(legal_swap(checkpoint.state.board()).is_some());
    }
    checkpoint
}

#[test]
fn full_pve_matches_are_seeded_bounded_and_reproducible_for_every_pet_and_stage() {
    let mut wins = 0;
    let mut losses = 0;
    for pet in 0..8 {
        for stage in 0..6 {
            for fixture_seed in 1..=4 {
                let seed = SecretSeed::from_host_entropy([fixture_seed; 32]);
                let first = finish(start(pet, stage, &seed), &seed);
                let second = finish(start(pet, stage, &seed), &seed);
                assert_eq!(first.state, second.state);
                assert_eq!(first.audit_hash, second.audit_hash);
                assert_eq!(first.rng_cursor, second.rng_cursor);
                match first.state.phase() {
                    Phase::Won => wins += 1,
                    Phase::Lost => losses += 1,
                    _ => panic!("nonterminal"),
                }
                assert!(advance(&first, Action::Pass, &seed).is_err());
            }
        }
    }
    assert!(wins > 0 && losses > 0);
}

#[test]
fn invalid_intents_versions_and_entropy_cannot_change_committed_state() {
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let checkpoint = start(0, 0, &seed);
    let before = checkpoint.state.encode().unwrap();
    for action in [
        Action::Start,
        Action::Swap {
            first: 255,
            second: 0,
        },
        Action::Swap {
            first: 0,
            second: 35,
        },
    ] {
        assert!(advance(&checkpoint, action, &seed).is_err());
        assert_eq!(checkpoint.state.encode().unwrap(), before);
        assert_eq!(checkpoint.version, 1);
    }
    assert!(
        advance(
            &checkpoint,
            Action::Pass,
            &SecretSeed::from_host_entropy([8; 32])
        )
        .is_err()
    );
    let after_skill = advance(&checkpoint, Action::Skill, &seed).unwrap();
    assert_eq!(after_skill.state.cooldown(), 3);
    assert!(advance(&after_skill, Action::Skill, &seed).is_err());
    let command = Command {
        id: [1; 16],
        match_id: MATCH,
        expected_version: 0,
        ruleset: Combat.ruleset(),
        action: Action::Pass,
    };
    assert!(matches!(
        apply(&Combat, &checkpoint, &command, &seed, clock(3)),
        Err(Error::VersionConflict)
    ));
    assert_eq!(checkpoint.state.encode().unwrap(), before);
}

#[test]
fn healing_can_reach_the_turn_cap_which_is_a_loss() {
    let seed = SecretSeed::from_host_entropy([9; 32]);
    let mut checkpoint = start(1, 0, &seed);
    while checkpoint.state.phase() == Phase::Playing {
        let action = if checkpoint.state.cooldown() == 0 {
            Action::Skill
        } else {
            Action::Pass
        };
        checkpoint = advance(&checkpoint, action, &seed).unwrap();
    }
    assert_eq!(checkpoint.state.turn(), 60);
    assert_eq!(checkpoint.state.phase(), Phase::Lost);
    assert!(checkpoint.state.health().raw() > 0);
    assert_eq!(checkpoint.state.enemy_health().raw(), 80_000);
}

#[test]
fn snapshot_codec_rejects_unknown_incompatible_and_impossible_state() {
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let checkpoint = start(0, 5, &seed);
    let bytes = checkpoint.state.encode().unwrap();
    assert_eq!(State::decode(&bytes).unwrap(), checkpoint.state);
    assert!(State::decode(&vec![b' '; 4097]).is_err());
    for (key, value) in [
        ("format", serde_json::json!(2)),
        ("rules_hash", serde_json::json!(vec![0; 32])),
        ("pet", serde_json::json!(255)),
        ("stage", serde_json::json!(6)),
        ("phase", serde_json::json!(7)),
        ("turn", serde_json::json!(61)),
        ("health", serde_json::json!(-1)),
        ("enemy_health", serde_json::json!(0)),
        ("cooldown", serde_json::json!(4)),
        ("board", serde_json::json!([0, 1])),
        ("telegraph", serde_json::json!({"turn": 0, "target": 6})),
        ("unrecognized", serde_json::json!(true)),
        (
            "player_status",
            serde_json::json!([{"kind":1,"potency":1000,"turns":2}]),
        ),
        (
            "enemy_status",
            serde_json::json!([{"kind":0,"potency":6000,"turns":0}]),
        ),
    ] {
        let mut invalid: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        invalid[key] = value;
        assert!(
            State::decode(&serde_json::to_vec(&invalid).unwrap()).is_err(),
            "{key}"
        );
    }
    for length in 0..bytes.len() {
        assert!(State::decode(&bytes[..length]).is_err());
    }
}

struct FixtureDir(PathBuf);
impl Drop for FixtureDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn checkpoint_json(checkpoint: &Checkpoint<State>) -> serde_json::Value {
    serde_json::json!({"state": checkpoint.state.encode().unwrap(), "version": checkpoint.version,
        "rng_cursor":checkpoint.rng_cursor,"seed_commitment":checkpoint.seed_commitment,"audit_hash":checkpoint.audit_hash})
}
fn restore(value: &serde_json::Value) -> Checkpoint<State> {
    let version = value["version"].as_u64().unwrap();
    Checkpoint {
        match_id: MATCH,
        ruleset: Combat.ruleset(),
        version,
        clock: clock(version),
        rng_cursor: value["rng_cursor"].as_u64().unwrap(),
        seed_commitment: serde_json::from_value(value["seed_commitment"].clone()).unwrap(),
        audit_hash: serde_json::from_value(value["audit_hash"].clone()).unwrap(),
        state: State::decode(&serde_json::from_value::<Vec<u8>>(value["state"].clone()).unwrap())
            .unwrap(),
    }
}

#[test]
fn checkpoint_restart_in_a_new_process_matches_uninterrupted_state_and_audit_hash() {
    let seed = SecretSeed::from_host_entropy([7; 32]); // Public fixture entropy only.
    if let Some(path) = std::env::var_os("VL_PET_REPLAY_FIXTURE") {
        let path = PathBuf::from(path);
        let checkpoint =
            restore(&serde_json::from_slice(&fs::read(path.join("input.json")).unwrap()).unwrap());
        let result = finish(checkpoint, &seed);
        fs::write(
            path.join("output.json"),
            serde_json::to_vec(&checkpoint_json(&result)).unwrap(),
        )
        .unwrap();
        return;
    }
    let dir = FixtureDir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "../../artifacts/pet-restart-{}",
        std::process::id()
    )));
    fs::create_dir_all(&dir.0).unwrap();
    let started = start(0, 0, &seed);
    let partial = advance(&started, Action::Skill, &seed).unwrap();
    assert_eq!(partial.state.phase(), Phase::Playing);
    fs::write(
        dir.0.join("input.json"),
        serde_json::to_vec(&checkpoint_json(&partial)).unwrap(),
    )
    .unwrap();
    let output = Process::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "checkpoint_restart_in_a_new_process_matches_uninterrupted_state_and_audit_hash",
            "--nocapture",
        ])
        .env("VL_PET_REPLAY_FIXTURE", &dir.0)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let resumed =
        restore(&serde_json::from_slice(&fs::read(dir.0.join("output.json")).unwrap()).unwrap());
    let uninterrupted = finish(started, &seed);
    assert_eq!(resumed.state.phase(), Phase::Won);
    assert_eq!(resumed.state, uninterrupted.state);
    assert_eq!(
        resumed.state.hash().unwrap(),
        uninterrupted.state.hash().unwrap()
    );
    assert_eq!(resumed.audit_hash, uninterrupted.audit_hash);
    assert_eq!(resumed.rng_cursor, uninterrupted.rng_cursor);
    assert_eq!(
        rules_hash(),
        [
            0x45, 0x7e, 0x9d, 0xdd, 0x98, 0x1a, 0x25, 0xb1, 0x01, 0x43, 0x14, 0xb1, 0x7b, 0xc4,
            0xe0, 0x14, 0x95, 0x0d, 0x8e, 0x19, 0xea, 0xbf, 0x3e, 0xc3, 0xec, 0x38, 0x6e, 0x2b,
            0x12, 0xaa, 0xbb, 0xfb,
        ]
    );
    assert_eq!(
        resumed.audit_hash,
        [
            0x9d, 0x36, 0x7c, 0xe2, 0x3c, 0x1c, 0x1c, 0xe9, 0xe4, 0xc2, 0x32, 0x8d, 0xb1, 0x89,
            0x6c, 0xb9, 0xe5, 0x29, 0x6b, 0x5c, 0x30, 0x20, 0x5e, 0x09, 0xff, 0xc0, 0x2a, 0x4e,
            0x25, 0xe5, 0x0a, 0xab,
        ]
    );
}
