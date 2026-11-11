use vl_game_runtime::{Config, probe, router};

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let enabled = std::env::var("VL_GAMEPLAY_ENABLED").ok();
    let bind = std::env::var("VL_RUNTIME_BIND").ok();
    let config = Config::parse(
        bind.as_deref(),
        if enabled.as_deref() == Some("1") {
            Some("0")
        } else {
            enabled.as_deref()
        },
    )?;
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args == ["--ruleset-content-hash", "pet-arena-pve"] {
        let hash = vl_game_runtime::features::pet_arena::domain::content_hash();
        println!(
            "{}",
            hash.iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
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
        let file = std::env::var("VL_GAMEPLAY_CONFIG")
            .map_err(|_| "Native gameplay configuration required")?;
        let database = std::env::var("VL_GAME_DATABASE_URL")
            .map_err(|_| "Native game database configuration required")?;
        let runtime = vl_game_runtime::features::runtime::infrastructure::NativeRuntime::start(
            &file, &database,
        )
        .await?;
        let listener = tokio::net::TcpListener::bind(config.bind).await?;
        println!("LISTEN {}", listener.local_addr()?.port());
        println!("vl-game-runtime native gameplay listening");
        axum::serve(listener, runtime.router.clone())
            .with_graceful_shutdown(shutdown())
            .await?;
        runtime.stop().await;
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    println!("LISTEN {}", listener.local_addr()?.port());
    println!("vl-game-runtime foundation listening; gameplay disabled");
    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
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
