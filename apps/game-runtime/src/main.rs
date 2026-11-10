use vl_game_runtime::{Config, probe, router};

#[tokio::main(worker_threads = 2)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::parse(
        std::env::var("VL_RUNTIME_BIND").ok().as_deref(),
        std::env::var("VL_GAMEPLAY_ENABLED").ok().as_deref(),
    )?;
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args == ["--healthcheck"] {
        probe(config.bind).await?;
        return Ok(());
    }
    if !args.is_empty() {
        return Err("Unknown runtime argument".into());
    }
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
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
