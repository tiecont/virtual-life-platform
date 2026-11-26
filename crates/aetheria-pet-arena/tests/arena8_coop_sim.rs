use aetheria_pet_arena::arena8::coop::CoopRules;
use aetheria_pet_arena::arena8::coop::simulation::{Policy, simulate};

fn rules() -> CoopRules {
    let bytes = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-v1.seed.json"
    ))
    .expect("committed seed bundle");
    CoopRules::load(&bytes, "cinder-terraces-warden".to_string()).expect("valid seed bundle")
}

#[test]
fn tactical_simulation_is_deterministic_and_bounded() {
    let rules = rules();
    let first = simulate(&rules, Policy::Tactical, 8).expect("simulation");
    let second = simulate(&rules, Policy::Tactical, 8).expect("simulation");
    assert_eq!(first, second);
    assert_eq!(first.seeds, 8);
    assert_eq!(first.wins + first.losses + first.unresolved, 8);
    assert!(first.total_actions > 0);
    assert!(first.phase_two_reached <= 8);
    assert!(first.average_rounds_milli > 0);
}

#[test]
fn every_policy_runs_the_same_seed_set() {
    let rules = rules();
    for policy in [
        Policy::Random,
        Policy::Basic,
        Policy::Tactical,
        Policy::Coordinated,
    ] {
        let report = simulate(&rules, policy, 4).expect("simulation");
        assert_eq!(report.policy, policy);
        assert_eq!(
            report.casts_by_skill.values().sum::<u64>(),
            report.ability_casts
        );
        assert_eq!(report.wins + report.losses + report.unresolved, 4);
    }
}

#[test]
fn simulation_rejects_an_unbounded_seed_count() {
    let rules = rules();
    assert!(simulate(&rules, Policy::Tactical, 0).is_err());
    assert!(simulate(&rules, Policy::Tactical, 1_001).is_err());
}

#[test]
fn customized_party_preserves_distinct_instances_and_checks_gear_and_skill_bindings() {
    use aetheria_pet_arena::arena8::coop::simulation::{SimulationSeat, simulate_party};
    let bundle = include_bytes!("../../../config/gameplay/arena8-coop-v2.seed.json");
    let rules = CoopRules::load(bundle, "cinder-terraces-warden".into()).unwrap();
    let mut party: [SimulationSeat; 4] = std::array::from_fn(|_| SimulationSeat {
        pet_id: "fire-coalwhisk".into(),
        level: 10,
        artifacts: Vec::new(),
        skill_levels: Vec::new(),
    });
    let plain = simulate_party(&rules, Policy::Basic, 3, Some(&party)).unwrap();
    let item = serde_json::from_value(serde_json::json!({
        "slot":"core","artifactId":"cc111111-0000-4000-8000-111111111111",
        "definitionId":"core-emberglass","upgradeLevel":2
    }))
    .unwrap();
    party[0].artifacts.push(item);
    party[0].skill_levels.push(
        serde_json::from_value(serde_json::json!({
            "skillId":"fire-coalwhisk-ember-lance","level":2
        }))
        .unwrap(),
    );
    let equipped = simulate_party(&rules, Policy::Basic, 3, Some(&party)).unwrap();
    assert_ne!(plain.contributions, equipped.contributions);
    assert!(
        equipped
            .contributions
            .iter()
            .all(|seat| seat.pet_id == "fire-coalwhisk")
    );
    party[1].artifacts = party[0].artifacts.clone();
    assert!(simulate_party(&rules, Policy::Basic, 3, Some(&party)).is_err());
    party[1].artifacts.clear();
    party[0].skill_levels[0].level = 99;
    assert!(simulate_party(&rules, Policy::Basic, 3, Some(&party)).is_err());
}
