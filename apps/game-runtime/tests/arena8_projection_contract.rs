//! Client-facing projection contract for \`arena8-pve\`.
//!
//! The Unity/client consumer may grow additively, but these top-level fields and
//! the absence of account/seed/checkpoint material are part of the contract.

use aetheria_game_runtime::features::pet_arena::arena8::domain::{Rules, content_hash};
use aetheria_persistence::Game;
use aetheria_pet_arena::arena8::binding::{Allocation, ArtifactSelection};

const ACCOUNT: &str = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OWNED: &str = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

fn fixture() -> Rules {
    Rules::allocate(Allocation {
        account: ACCOUNT.into(),
        owned_pet_id: OWNED.into(),
        pet_id: "fire-coalwhisk".into(),
        level: 20,
        encounter_id: "cinder-terraces-regular".into(),
        artifacts: vec![ArtifactSelection {
            definition_id: "core-emberglass".into(),
            upgrade_level: 1,
        }],
    })
    .unwrap()
}

#[test]
fn arena8_projection_contract_is_stable_and_secret_free() {
    let rules = fixture();
    let state = rules.initial().unwrap();
    let projection: serde_json::Value =
        serde_json::from_slice(&rules.project(&state, ACCOUNT).unwrap()).unwrap();
    let keys: Vec<&str> = projection
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(
        keys,
        vec![
            "artifacts",
            "board",
            "cooldown",
            "encounter",
            "enemyHealth",
            "enemyShield",
            "fireZoneTurns",
            "health",
            "mana",
            "modifiers",
            "pet",
            "phase",
            "rage",
            "ruleset",
            "schemaVersion",
            "skills",
            "snapshotDigest",
            "stats",
            "telegraph",
            "turn",
        ]
    );
    assert_eq!(projection["schemaVersion"], 1);
    assert_eq!(projection["ruleset"]["id"], "arena8-pve");
    assert_eq!(projection["ruleset"]["version"], 1);
    assert_eq!(
        projection["ruleset"]["contentHash"],
        content_hash()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    assert_eq!(projection["pet"]["id"], "fire-coalwhisk");
    assert_eq!(projection["pet"]["level"], 20);
    assert_eq!(projection["encounter"]["revision"], 1);
    assert_eq!(projection["modifiers"]["speed"]["active"], false);
    assert_eq!(projection["modifiers"]["speed"]["effect"], "inactive");
    assert_eq!(projection["modifiers"]["hp"]["active"], true);
    assert_eq!(projection["artifacts"].as_array().unwrap().len(), 1);
    assert_eq!(projection["board"].as_array().unwrap().len(), 64);
    let text = projection.to_string();
    assert!(!text.contains(ACCOUNT));
    assert!(!text.contains("seed"));
    assert!(!text.contains("checkpoint"));
}
