use std::path::Path;
use std::process::Command;

use aetheria_pet_arena::arena8::coop::CoopRules;
use serde_json::Value;

const BINARY: &str = env!("CARGO_BIN_EXE_aetheria-game-runtime");
const FIRE: &str = "cinder-terraces-warden";
const WATER: &str = "tideglass-lagoon-warden";

fn run(flag: &str, version: u8, args: &[&str]) -> std::process::Output {
    let bundle = match version {
        1 => "tests/fixtures/arena8-coop-v1-legacy.seed.json".to_string(),
        v => format!("../../config/gameplay/arena8-coop-v{v}.seed.json"),
    };
    run_bundle(flag, &bundle, args)
}

fn run_bundle(flag: &str, bundle: &str, args: &[&str]) -> std::process::Output {
    let bundle = Path::new(env!("CARGO_MANIFEST_DIR")).join(bundle);
    Command::new(BINARY)
        .arg(flag)
        .arg(bundle)
        .args(args)
        .output()
        .expect("run isolated cooperative simulation CLI")
}

fn report(flag: &str, version: u8, args: &[&str]) -> Value {
    let output = run(flag, version, args);
    assert!(output.status.success(), "{:?}", output);
    serde_json::from_slice(&output.stdout).expect("simulation report")
}

#[test]
fn compares_both_selected_encounters_through_the_same_reducer() {
    let legacy = report("--simulate-coop", 1, &["tactical", "4"]);
    assert_eq!(legacy["bossId"], FIRE);

    let default = report("--simulate-coop", 2, &["tactical", "4"]);
    let water = report("--simulate-coop", 2, &["tactical", "4", WATER]);
    let comparison = report("--compare-coop", 2, &["4", FIRE, WATER]);
    let rows = comparison.as_array().expect("comparison array");
    assert_eq!(rows.len(), 8);
    assert_eq!(rows[2], default);
    assert_eq!(rows[6], water);
    assert_eq!(water["bossId"], WATER);
    assert_ne!(water["contributions"], default["contributions"]);
    assert_eq!(water["contentDigest"], default["contentDigest"]);
    for (boss, rows) in [(FIRE, &rows[..4]), (WATER, &rows[4..])] {
        for (policy, row) in ["random", "basic", "tactical", "coordinated"]
            .into_iter()
            .zip(rows)
        {
            assert_eq!(row["bossId"], boss);
            assert_eq!(row["seeds"], 4);
            let phase_actions = row["phaseTwoActions"].as_u64().unwrap();
            assert!(phase_actions <= row["totalActions"].as_u64().unwrap());
            if row["phaseTwoReached"] == 0 {
                assert_eq!(phase_actions, 0);
            }
            assert_eq!(row["policy"], policy);
            assert_eq!(row["contributions"].as_array().unwrap().len(), 4);
        }
    }
}

#[test]
fn rejects_unknown_encounters_and_unbounded_comparisons() {
    for (flag, version, args) in [
        ("--simulate-coop", 1, &["tactical", "4", WATER][..]),
        (
            "--simulate-coop",
            2,
            &["tactical", "4", "unknown-encounter"][..],
        ),
        ("--compare-coop", 2, &["4", FIRE, FIRE][..]),
        ("--compare-coop", 2, &["26", FIRE, WATER][..]),
    ] {
        let output = run(flag, version, args);
        assert!(!output.status.success());
        assert!(output.stdout.is_empty());
    }
}

#[test]
fn validation_reports_version_and_hash_of_the_solo_adapter() {
    let legacy = report("--check-gameplay-config", 1, &[]);
    assert!(!legacy.as_object().unwrap().contains_key("soloContentHash"));
    assert!(
        !legacy
            .as_object()
            .unwrap()
            .contains_key("soloRulesetVersion")
    );

    for (candidate, version) in [(1, 1), (2, 2)] {
        let path =
            format!("../../config/gameplay/arena8-coop-functional-v{candidate}.candidate.json");
        let output = run_bundle("--check-gameplay-config", &path, &[]);
        assert!(output.status.success(), "{output:?}");
        let receipt: Value = serde_json::from_slice(&output.stdout).expect("validation receipt");
        let bundle = std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join(path)).unwrap();
        let ruleset = CoopRules::load_solo(&bundle, FIRE.into())
            .unwrap()
            .ruleset();
        let hash = ruleset
            .content_hash
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        assert_eq!(ruleset.version, version);
        assert_eq!(receipt["soloRulesetVersion"], version);
        assert_eq!(receipt["soloContentHash"], hash);
    }
}
