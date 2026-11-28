use aetheria_game_runtime::{Config, probe, router};
use aetheria_pet_arena::arena8::coop::simulation::{
    COMPARISON_MAX_BOSSES, COMPARISON_MAX_SEEDS, POLICIES, Policy, SimulationSeat, simulate_party,
    simulate_solo,
};
use aetheria_pet_arena::arena8::coop::{CoopConfig, CoopRules};

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let enabled = std::env::var("AETHERIA_GAMEPLAY_ENABLED").ok();
    let bind = std::env::var("AETHERIA_RUNTIME_BIND").ok();
    let config = Config::parse(
        bind.as_deref(),
        if enabled.as_deref() == Some("1") {
            Some("0")
        } else {
            enabled.as_deref()
        },
    )?;
    let mut args: Vec<_> = std::env::args().skip(1).collect();
    // Authoritative bundle validation for Admin publication. The Nest control
    // plane never re-implements the schema or the digest: it asks the engine.
    if let [flag, path] = args.as_slice()
        && flag == "--check-gameplay-config"
    {
        let bytes = std::fs::read(path)?;
        // For validation, use the first boss in the config
        let config = CoopConfig::parse(&bytes)?;
        let boss_id = config
            .bosses()
            .first()
            .map(|b| b.id.clone())
            .unwrap_or_default();
        let rules = CoopRules::load(&bytes, boss_id)
            .map_err(|_| "Invalid cooperative gameplay configuration")?;
        let digest = rules.digest();
        let ruleset = rules.ruleset();
        let hex = |bytes: &[u8]| {
            bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        };
        let mut receipt = serde_json::json!({
            "engineCapability": config.engine_capability,
            "digest": hex(&digest),
            "contentHash": hex(&ruleset.content_hash),
        });
        if rules.functional_board() {
            receipt["rulesetVersion"] = ruleset.version.into();
        }
        let solo_encounter = if config.shared_jewel_rng() {
            config.bosses().first().map(|boss| &boss.id)
        } else {
            config.bosses().iter().find_map(|boss| {
                boss.solo
                    .as_ref()
                    .map(|_| &boss.id)
                    .or_else(|| boss.regular.as_ref().map(|r| &r.id))
            })
        };
        if let Some(encounter_id) = solo_encounter {
            let solo = CoopRules::load_solo(&bytes, encounter_id.clone())?.ruleset();
            receipt["soloContentHash"] = hex(&solo.content_hash).into();
            receipt["soloRulesetVersion"] = solo.version.into();
        }
        println!("{receipt}");
        return Ok(());
    }
    if let [flag, ruleset] = args.as_slice()
        && flag == "--ruleset-content-hash"
    {
        let hash = match ruleset.as_str() {
            "pet-arena-pve" => aetheria_game_runtime::features::pet_arena::domain::content_hash(),
            "arena8-pve" => {
                aetheria_game_runtime::features::pet_arena::arena8::domain::content_hash()
            }
            _ => return Err("Unknown native ruleset".into()),
        };
        println!(
            "{}",
            hash.iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
        return Ok(());
    }
    let mut party: Option<[SimulationSeat; 4]> = None;
    if args
        .first()
        .is_some_and(|flag| matches!(flag.as_str(), "--simulate-coop" | "--compare-coop"))
        && args.len() >= 4
        && args[args.len() - 2] == "--party"
    {
        let path = args.pop().unwrap();
        args.pop();
        party = Some(serde_json::from_slice(&std::fs::read(path)?)?);
    }
    if let [flag, path, policy, seeds, boss @ ..] = args.as_slice()
        && flag == "--simulate-coop"
        && boss.len() <= 1
    {
        let policy = Policy::parse(policy).ok_or("Unknown cooperative simulation policy")?;
        let seeds = simulation_seeds(seeds)?;
        let bytes = std::fs::read(path)?;
        let boss_id = if let Some(boss_id) = boss.first() {
            boss_id.clone()
        } else {
            let config = CoopConfig::parse(&bytes)?;
            config
                .bosses()
                .first()
                .ok_or("No cooperative encounter")?
                .id
                .clone()
        };
        let rules = simulation_rules(&bytes, boss_id)?;
        let report = simulate_party(&rules, policy, seeds, party.as_ref())
            .map_err(|error| error.message())?;
        println!("{}", serde_json::to_string(&report)?);
        return Ok(());
    }
    if let [flag, path, seeds, bosses @ ..] = args.as_slice()
        && flag == "--compare-coop"
    {
        let seeds = simulation_seeds(seeds)?;
        if seeds == 0 || seeds > COMPARISON_MAX_SEEDS {
            return Err("Cooperative comparison seed count is outside the bound".into());
        }
        if bosses.is_empty()
            || bosses.len() > COMPARISON_MAX_BOSSES
            || (bosses.len() == 2 && bosses[0] == bosses[1])
        {
            return Err("Cooperative comparison requires one or two distinct encounters".into());
        }
        let bytes = std::fs::read(path)?;
        let mut reports = Vec::with_capacity(bosses.len() * POLICIES.len());
        for boss in bosses {
            let rules = simulation_rules(&bytes, boss.clone())?;
            for policy in POLICIES {
                reports.push(
                    simulate_party(&rules, policy, seeds, party.as_ref())
                        .map_err(|error| error.message())?,
                );
            }
        }
        println!("{}", serde_json::to_string(&reports)?);
        return Ok(());
    }
    if let [flag, path, pet_id, level, seeds, bosses @ ..] = args.as_slice()
        && flag == "--compare-solo"
    {
        let seeds = simulation_seeds(seeds)?;
        let level = level.parse::<u8>()?;
        if seeds == 0 || seeds > COMPARISON_MAX_SEEDS || !(1..=60).contains(&level) {
            return Err("Solo comparison inputs are outside their bounds".into());
        }
        if bosses.is_empty()
            || bosses.len() > COMPARISON_MAX_BOSSES
            || (bosses.len() == 2 && bosses[0] == bosses[1])
        {
            return Err("Solo comparison requires one or two distinct encounters".into());
        }
        let bytes = std::fs::read(path)?;
        let seat = SimulationSeat {
            pet_id: pet_id.clone(),
            level,
            artifacts: vec![],
            skill_levels: vec![],
        };
        let mut reports = Vec::new();
        for boss in bosses {
            let rules = CoopRules::load_solo(&bytes, boss.clone())?;
            for policy in POLICIES {
                reports.push(
                    simulate_solo(&rules, policy, seeds, &seat).map_err(|err| err.message())?,
                );
            }
        }
        println!("{}", serde_json::to_string(&reports)?);
        return Ok(());
    }
    if args == ["--healthcheck"] {
        probe(config.bind).await?;
        return Ok(());
    }
    if !args.is_empty() {
        return Err("Unknown runtime argument".into());
    }
    if enabled.as_deref() == Some("1") {
        if !config.bind.ip().is_loopback() {
            return Err("Native gateway requires loopback upstream behind trusted TLS".into());
        }
        let file = std::env::var("AETHERIA_GAMEPLAY_CONFIG")
            .map_err(|_| "Native gameplay configuration required")?;
        let database = std::env::var("AETHERIA_GAME_DATABASE_URL")
            .map_err(|_| "Native game database configuration required")?;
        let bundle = std::env::var("AETHERIA_GAMEPLAY_BUNDLE")
            .ok()
            .map(std::fs::read)
            .transpose()?;
        let runtime =
            aetheria_game_runtime::features::runtime::infrastructure::NativeRuntime::start(
                &file, &database, bundle,
            )
            .await?;
        let listener = tokio::net::TcpListener::bind(config.bind).await?;
        println!("LISTEN {}", listener.local_addr()?.port());
        println!("aetheria-game-runtime native gameplay listening");
        axum::serve(listener, runtime.router.clone())
            .with_graceful_shutdown(shutdown())
            .await?;
        runtime.stop().await;
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    println!("LISTEN {}", listener.local_addr()?.port());
    println!("aetheria-game-runtime foundation listening; gameplay disabled");
    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

fn simulation_seeds(value: &str) -> Result<u32, &'static str> {
    value
        .parse()
        .map_err(|_| "Invalid cooperative simulation seed count")
}

fn simulation_rules(bytes: &[u8], boss_id: String) -> Result<CoopRules, &'static str> {
    CoopRules::load(bytes, boss_id)
        .map_err(|_| "Invalid cooperative gameplay configuration or encounter")
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Unable to register termination signal");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
