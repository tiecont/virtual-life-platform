//! Compare the authoritative cooperative reducer offline on explicit seeds.

use aetheria_pet_arena::arena8::coop::{
    CoopConfig, CoopRules,
    simulation::{COMPARISON_MAX_BOSSES, POLICIES, SimulationSeat, analyze_party, analyze_solo},
};
use serde_json::json;
use std::collections::BTreeSet;
use std::error::Error;
use std::fs;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if let [flag, bundle] = args.as_slice()
        && flag == "--audit-skills"
    {
        return audit_skills(bundle);
    }
    let (solo, args) = match args.as_slice() {
        [flag, rest @ ..] if flag == "--solo" => (true, rest),
        args => (false, args),
    };
    let [bundle_path, party_path, seed_start, seed_count, bosses @ ..] = args else {
        return Err(
            "Usage: arena8_coop_balance [--solo] BUNDLE PARTY_OR_SEAT FIRST_SEED SEED_COUNT ENCOUNTER [ENCOUNTER]".into(),
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
    let party = fs::read(party_path)?;
    let mut reports = Vec::with_capacity(bosses.len() * POLICIES.len());
    for boss in bosses {
        if solo {
            let seat: SimulationSeat = serde_json::from_slice(&party)?;
            let rules = CoopRules::load_solo(&bundle, boss.clone())
                .map_err(|err| format!("{boss}: {err:?}"))?;
            for policy in POLICIES {
                reports.push(
                    analyze_solo(&rules, policy, seed_start, seed_count, &seat)
                        .map_err(|err| err.message())?,
                );
            }
        } else {
            let seats: [SimulationSeat; 4] = serde_json::from_slice(&party)?;
            let rules =
                CoopRules::load(&bundle, boss.clone()).map_err(|err| format!("{boss}: {err:?}"))?;
            for policy in POLICIES {
                reports.push(
                    analyze_party(&rules, policy, seed_start, seed_count, Some(&seats))
                        .map_err(|err| err.message())?,
                );
            }
        }
    }
    println!("{}", serde_json::to_string(&reports)?);
    Ok(())
}

fn audit_skills(bundle: &str) -> Result<(), Box<dyn Error>> {
    let bytes = fs::read(bundle)?;
    let config = CoopConfig::parse(&bytes).map_err(|error| format!("{error:?}"))?;
    let mut seen = BTreeSet::new();
    let mut rows = Vec::new();
    for pet in &config.pets {
        for id in pet.skill_ids().into_iter().flatten() {
            if !seen.insert(id) {
                return Err(format!("Multiple active bindings for skill {id}").into());
            }
            let skill = config
                .skill(id)
                .ok_or_else(|| format!("Unbound skill {id}"))?;
            rows.push(json!({
                "petId": pet.id,
                "element": pet.element,
                "skillId": skill.id,
                "slot": format!("{:?}", skill.kind),
                "effect": format!("{:?}", skill.effect.kind),
                "target": format!("{:?}", skill.effect.target),
                "manaCost": skill.mana_cost,
                "rageCost": skill.rage_cost,
                "cooldownTurns": skill.cooldown_turns,
            }));
        }
    }
    if seen.len() != config.skills.len() {
        return Err("The catalog contains unbound skills".into());
    }
    let digest: String = config
        .digest()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    println!(
        "{}",
        json!({
            "contentDigest": digest,
            "activePets": config.pets.len(),
            "skillCount": rows.len(),
            "skills": rows,
        })
    );
    Ok(())
}
