use crate::features::synthetic::{
    application::Commands,
    domain::{CONTENT, Rules, State},
};
use axum::{Router, extract::State as AxumState, http::StatusCode, routing::get};
use jsonwebtoken::DecodingKey;
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    fs,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::{sync::Mutex, task::JoinHandle};
use tokio_postgres::{Client, Config};
use uuid::Uuid;
use vl_gateway::{Options, durable::PgAdmission};
use vl_persistence::{Host, Keys, Owner, Scope};
use vl_security::{
    RuntimeScope, TicketVerifier, durable::DurableTrust, transport::connect_runtime_postgres,
};
use vl_world::ZoneHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    schema_version: u32,
    ruleset: String,
    world: String,
    boot: Uuid,
    match_id: Uuid,
    player: Uuid,
    public_keys: BTreeMap<String, String>,
    ca_file: String,
    role: String,
    origin: String,
    active_storage_key: String,
    storage_keys: BTreeMap<String, [u8; 32]>,
    engine_hash: [u8; 32],
}
struct Driver(JoinHandle<Result<(), tokio_postgres::Error>>);
impl Drop for Driver {
    fn drop(&mut self) {
        self.0.abort();
    }
}
struct Health {
    commands: Arc<Commands>,
    db: Mutex<Client>,
    zone_alive: Arc<AtomicBool>,
    _driver: Driver,
}
pub struct NativeRuntime {
    pub router: Router,
    zone: ZoneHandle,
    task: JoinHandle<()>,
}
impl NativeRuntime {
    pub async fn start(file: &str, database: &str) -> Result<Self, &'static str> {
        let bytes = fs::read(file).map_err(|_| "Native configuration unavailable")?;
        if bytes.len() > 65_536 {
            return Err("Native configuration too large");
        }
        let settings: Settings =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid native configuration")?;
        if settings.schema_version != 1
            || settings.ruleset != "headless-counter"
            || settings.player.is_nil()
            || settings.match_id.is_nil()
            || settings.public_keys.is_empty()
            || settings.public_keys.len() > 8
        {
            return Err("Explicit synthetic ruleset and scope required");
        }
        let config: Config = database
            .parse()
            .map_err(|_| "Invalid native database configuration")?;
        let ca = fs::read(settings.ca_file).map_err(|_| "Native PostgreSQL CA unavailable")?;
        let owner = Owner::acquire(
            &config,
            &ca,
            &settings.role,
            Scope {
                world: settings.world.clone(),
                boot: settings.boot,
                engine: settings.engine_hash,
            },
        )
        .await
        .map_err(|_| "Native ownership unavailable")?;
        let host = Host::new(
            Rules {
                player: settings.player.to_string(),
            },
            Keys::new(settings.active_storage_key, settings.storage_keys)
                .map_err(|_| "Native storage keys unavailable")?,
            owner,
        )
        .map_err(|_| "Native game host unavailable")?;
        let (mut db, driver) = connect_runtime_postgres(&config, &ca, &settings.role)
            .await
            .map_err(|_| "Native database unavailable")?;
        let driver = Driver(driver);
        let commands = Arc::new(Commands {
            host,
            match_id: settings.match_id,
            committed: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
        });
        let trust = DurableTrust::new(
            TicketVerifier::new(
                settings
                    .public_keys
                    .iter()
                    .map(|(id, key)| {
                        DecodingKey::from_ed_components(key).map(|key| (id.clone(), key))
                    })
                    .collect::<Result<BTreeMap<_, _>, _>>()
                    .map_err(|_| "Native ticket keys unavailable")?,
                RuntimeScope {
                    world: settings.world,
                    boot: settings.boot.to_string(),
                    content: "53".repeat(32),
                },
            )
            .map_err(|_| "Native ticket scope unavailable")?,
        );
        let (zone, actor) = vl_world::zone(32, 64).map_err(|_| "Native zone unavailable")?;
        let admission = PgAdmission::new(trust, config, ca, settings.role, zone.clone())
            .map_err(|_| "Native admission unavailable")?
            .with_games(commands.clone());
        let gateway = vl_gateway::router(
            Options {
                enabled: true,
                origins: vec![settings.origin],
                content_hash: CONTENT,
                runtime_boot_id: *settings.boot.as_bytes(),
                connections: 32,
            },
            Arc::new(admission),
        )?;
        let exists = db
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM game_native_matches WHERE id=$1::text::uuid)",
                &[&settings.match_id.to_string()],
            )
            .await
            .map_err(|_| "Native schema unavailable")?
            .get::<_, bool>(0);
        if exists {
            commands
                .host
                .resume(&mut db, settings.match_id)
                .await
                .map_err(|_| "Native checkpoint unavailable or incompatible")?;
        } else {
            commands
                .host
                .create(
                    &mut db,
                    settings.match_id,
                    State {
                        player: settings.player.to_string(),
                        turns: 0,
                        private_roll: 0,
                    },
                )
                .await
                .map_err(|_| "Native match allocation unavailable")?;
        }
        let alive = Arc::new(AtomicBool::new(true));
        let zone_alive = alive.clone();
        let task = tokio::spawn(async move {
            let _ = actor.run().await;
            zone_alive.store(false, Ordering::Release);
        });
        let health = Arc::new(Health {
            commands,
            db: Mutex::new(db),
            zone_alive: alive,
            _driver: driver,
        });
        let router = Router::new()
            .route("/health/ready", get(ready))
            .route("/metrics", get(metrics))
            .with_state(health)
            .route("/health/live", get(|| async {([( "content-type", "application/json")], r#"{"status":"live","service":"vl-game-runtime","gameplayEnabled":true,"ruleset":"headless-counter"}"#)}))
            .merge(gateway);
        Ok(Self { router, zone, task })
    }
    pub async fn stop(mut self) {
        if let Ok(reply) = self.zone.stop() {
            let _ = reply.await;
        }
        let _ = (&mut self.task).await;
    }
}
impl Drop for NativeRuntime {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn ready(AxumState(health): AxumState<Arc<Health>>) -> (StatusCode, &'static str) {
    let check = async {
        if !health.zone_alive.load(Ordering::Acquire) {
            return false;
        }
        let mut db = health.db.lock().await;
        health
            .commands
            .host
            .resume(&mut db, health.commands.match_id)
            .await
            .is_ok()
    };
    match tokio::time::timeout(std::time::Duration::from_millis(750), check).await {
        Ok(true) => (
            StatusCode::OK,
            r#"{"status":"ready","gameplayEnabled":true,"ruleset":"headless-counter"}"#,
        ),
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            r#"{"status":"not_ready","gameplayEnabled":true}"#,
        ),
    }
}
async fn metrics(
    AxumState(health): AxumState<Arc<Health>>,
) -> ([(&'static str, &'static str); 1], String) {
    let committed = health.commands.committed.load(Ordering::Relaxed);
    let rejected = health.commands.rejected.load(Ordering::Relaxed);
    (
        [("content-type", "text/plain; version=0.0.4")],
        format!(
            "# TYPE vl_native_command_receipts_total counter\nvl_native_command_receipts_total {committed}\n# TYPE vl_native_command_rejections_total counter\nvl_native_command_rejections_total {rejected}\n"
        ),
    )
}
