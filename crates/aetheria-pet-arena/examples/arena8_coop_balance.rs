//! Compare the authoritative cooperative reducer offline on explicit seeds.

use aetheria_pet_arena::arena8::coop::{
    CoopRules,
    simulation::{COMPARISON_MAX_BOSSES, POLICIES, SimulationSeat, analyze_party},
};
use std::error::Error;
use std::fs;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let [bundle_path, party_path, seed_start, seed_count, bosses @ ..] = args.as_slice() else {
        return Err(
            "Usage: arena8_coop_balance BUNDLE PARTY FIRST_SEED SEED_COUNT BOSS [BOSS]".into(),
        );
    };
    if bosses.is_empty()
        || bosses.len() > COMPARISON_MAX_BOSSES
        || (bosses.len() == 2 && bosses[0] == bosses[1])
    {
        return Err("Specify one or two distinct Boss IDs".into());
    }

    let seed_start = seed_start.parse()?;
    let seed_count = seed_count.parse()?;
    let bundle = fs::read(bundle_path)?;
    let party: [SimulationSeat; 4] = serde_json::from_slice(&fs::read(party_path)?)?;
    let mut reports = Vec::with_capacity(bosses.len() * POLICIES.len());
    for boss in bosses {
        let rules =
            CoopRules::load(&bundle, boss.clone()).map_err(|err| format!("{}: {err:?}", boss))?;
        for policy in POLICIES {
            reports.push(
                analyze_party(&rules, policy, seed_start, seed_count, Some(&party))
                    .map_err(|err| err.message())?,
            );
        }
    }
    println!("{}", serde_json::to_string(&reports)?);
    Ok(())
}
