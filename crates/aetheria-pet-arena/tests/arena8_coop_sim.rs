use aetheria_pet_arena::arena8::coop::CoopRules;
use aetheria_pet_arena::arena8::coop::simulation::{Policy, simulate};

fn rules() -> CoopRules {
    let bytes = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/arena8-coop-v1-legacy.seed.json"
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

#[test]
fn tactical_policy_uses_support_while_the_boss_is_immune_to_its_attacks() {
    use aetheria_pet_arena::arena8::coop::simulation::{SimulationSeat, simulate_party};
    let rules = CoopRules::load(
        include_bytes!("../../../config/gameplay/arena8-coop-v2.seed.json"),
        "tideglass-lagoon-warden".into(),
    )
    .unwrap();
    let party = std::array::from_fn(|_| SimulationSeat {
        pet_id: "fire-coalwhisk".into(),
        level: 60,
        artifacts: vec![],
        skill_levels: vec![],
    });
    let run = |policy| simulate_party(&rules, policy, 3, Some(&party)).unwrap();
    for policy in [Policy::Tactical, Policy::Coordinated] {
        let report = run(policy);
        assert_eq!(report.unresolved, 0);
        assert!(
            !report
                .casts_by_skill
                .contains_key("fire-coalwhisk-ember-lance")
        );
        assert!(
            !report
                .casts_by_skill
                .contains_key("fire-coalwhisk-blazing-descent")
        );
        assert!(
            report
                .casts_by_skill
                .contains_key("fire-coalwhisk-ember-solar-flare")
        );
    }
    assert!(
        run(Policy::Random)
            .casts_by_skill
            .contains_key("fire-coalwhisk-ember-lance")
    );
}

#[test]
fn offline_seed_ranges_preserve_existing_reports_and_classify_defeats() {
    use aetheria_pet_arena::arena8::coop::simulation::analyze_party;

    let rules = rules();
    let baseline = simulate(&rules, Policy::Tactical, 4).unwrap();
    let first = analyze_party(&rules, Policy::Tactical, 1, 4, None).unwrap();
    let holdout = analyze_party(&rules, Policy::Tactical, 101, 4, None).unwrap();

    assert_eq!(first.report, baseline);
    assert_eq!(first.seed_start, 1);
    assert_eq!(holdout.seed_start, 101);
    assert_ne!(first.report, holdout.report);
    assert_eq!(
        holdout,
        analyze_party(&rules, Policy::Tactical, 101, 4, None).unwrap()
    );
    let diagnostics = holdout.diagnostics;
    assert_eq!(
        diagnostics.team_wipes + diagnostics.round_limit_defeats + diagnostics.other_defeats,
        holdout.report.losses
    );
    assert!(diagnostics.matches_with_damage > 0);
    assert!(analyze_party(&rules, Policy::Tactical, 0, 4, None).is_err());
    assert!(analyze_party(&rules, Policy::Tactical, 1, 26, None).is_err());
}

#[test]
fn v3_simulation_budget_marks_unresolved_never_lost_and_uncapped_endurance_wins() {
    use aetheria_pet_arena::arena8::coop::simulation::simulate_with_budget;

    let v3_bytes =
        include_bytes!("../../../config/gameplay/arena8-coop-functional-v2.candidate.json");
    let v3 = CoopRules::load(v3_bytes, "cinder-terraces-warden".into()).unwrap();

    // Tight evaluation budget leaves matches non-terminal => counted as unresolved, never Lost.
    let tight = simulate_with_budget(&v3, Policy::Tactical, 4, 2).unwrap();
    assert_eq!(tight.seeds, 4);
    assert_eq!(tight.unresolved, 4);
    assert_eq!(tight.losses, 0);
    assert_eq!(tight.wins, 0);

    // Uncapped high-HP endurance fight crossing round 40 finishes as Won without round-limit loss.
    let mut endurance_cfg: serde_json::Value = serde_json::from_slice(v3_bytes).unwrap();
    endurance_cfg["bosses"][0]["maxHp"] = 4_800.into();
    endurance_cfg["bosses"][0]["defense"] = 200.into();
    endurance_cfg["bosses"][0]["attackModel"]["baseDamage"] = 10.into();
    endurance_cfg["bosses"][0]["attackModel"]["perRoundDamage"] = 0.into();
    endurance_cfg["bosses"][0]["attackModel"]["minimumDamage"] = 2.into();
    endurance_cfg["bosses"][0]["phase"]["thresholdBp"] = 2_500.into();
    let endurance = CoopRules::load(
        &serde_json::to_vec(&endurance_cfg).unwrap(),
        "cinder-terraces-warden".into(),
    )
    .unwrap();
    let report = simulate(&endurance, Policy::Tactical, 4).unwrap();
    assert_eq!(report.unresolved, 0);
    assert_eq!(report.losses, 0);
    assert_eq!(report.wins, 4);
}
