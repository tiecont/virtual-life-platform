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
        assert_eq!(report.wins + report.losses + report.unresolved, 4);
    }
}

#[test]
fn simulation_rejects_an_unbounded_seed_count() {
    let rules = rules();
    assert!(simulate(&rules, Policy::Tactical, 0).is_err());
    assert!(simulate(&rules, Policy::Tactical, 1_001).is_err());
}
