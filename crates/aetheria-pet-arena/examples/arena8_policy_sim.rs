//! Deterministic Arena8 public-information policy simulation.
//!
//! The policy sees only the committed board and resource projection. It never
//! reads future tiles or runtime entropy. It is a measurement harness, not a
//! balance authority.

use aetheria_game_core::{Command, LogicalClock, Reducer, SecretSeed, apply, begin};
use aetheria_pet_arena::arena8::binding::{Allocation, ArtifactSelection};
use aetheria_pet_arena::arena8::{
    Action, Arena8Bound, BoundState, Phase, SIGNATURE_MANA, SIGNATURE_RAGE, SKILL_MANA,
    ULTIMATE_MANA, ULTIMATE_RAGE,
};

fn play(pet: &str, encounter: &str, level: u8, seed_byte: u8) -> (Phase, u32) {
    let snapshot = Allocation {
        account: "11111111-1111-4111-8111-111111111111".into(),
        owned_pet_id: "22222222-2222-4222-8222-222222222222".into(),
        pet_id: pet.into(),
        level,
        encounter_id: encounter.into(),
        artifacts: Vec::<ArtifactSelection>::new(),
    }
    .bind()
    .expect("authored scenario");
    let rules = Arena8Bound;
    let seed = SecretSeed::from_host_entropy([seed_byte; 32]);
    let mut checkpoint = begin(
        &rules,
        [42; 16],
        BoundState::allocate(snapshot).unwrap(),
        &seed,
        LogicalClock {
            server_tick: 0,
            logical_time_ms: 0,
        },
    )
    .unwrap();
    let mut turns = 0;
    while !checkpoint.state.core().phase().terminal() && turns < 24 {
        let core = checkpoint.state.core();
        let action = if core.phase() == Phase::Ready {
            Action::Start
        } else if core.cooldown() == 0
            && core.mana() >= ULTIMATE_MANA
            && core.rage() >= ULTIMATE_RAGE
        {
            Action::Ultimate
        } else if core.cooldown() == 0
            && core.mana() >= SIGNATURE_MANA
            && core.rage() >= SIGNATURE_RAGE
        {
            Action::Signature
        } else if core.cooldown() == 0 && core.mana() >= SKILL_MANA {
            Action::Skill
        } else if let Some(legal) = core.board().legal_move() {
            Action::Swap {
                first: legal.first,
                second: legal.second,
            }
        } else {
            Action::Guard
        };
        let version = checkpoint.version;
        let next = apply(
            &rules,
            &checkpoint,
            &Command {
                id: [u8::try_from(turns + 1).unwrap(); 16],
                match_id: [42; 16],
                expected_version: version,
                ruleset: rules.ruleset(),
                action,
            },
            &seed,
            LogicalClock {
                server_tick: version + 1,
                logical_time_ms: (version + 1) * 1000,
            },
        );
        match next {
            Ok(transition) => {
                checkpoint = transition.next;
                turns += 1;
            }
            Err(_) => break,
        }
    }
    (checkpoint.state.core().phase(), turns)
}

fn main() {
    let scenarios = [
        ("fire-coalwhisk", "cinder-terraces-regular", 1u8),
        ("water-dewskip", "cinder-terraces-regular", 1u8),
        ("ground-clodkin", "cinder-terraces-regular", 1u8),
        ("fire-coalwhisk", "cinder-terraces-boss", 16u8),
        ("fire-coalwhisk", "tideglass-lagoon-regular", 16u8),
    ];
    let mut total_wins = 0;
    let mut total_runs = 0;
    for (pet, encounter, level) in scenarios {
        let mut wins = 0;
        let mut losses = 0;
        let mut unresolved = 0;
        let mut turns = 0u32;
        for seed in 0u8..100 {
            let (phase, count) = play(pet, encounter, level, seed.wrapping_add(1));
            turns += count;
            match phase {
                Phase::Won => wins += 1,
                Phase::Lost => losses += 1,
                _ => unresolved += 1,
            }
        }
        total_wins += wins;
        total_runs += 100;
        println!(
            "{} {} Lv{}: wins={} losses={} unresolved={} avg_turns={:.2}",
            pet,
            encounter,
            level,
            wins,
            losses,
            unresolved,
            turns as f64 / 100.0
        );
    }
    println!("TOTAL wins={total_wins}/{total_runs}");
}
