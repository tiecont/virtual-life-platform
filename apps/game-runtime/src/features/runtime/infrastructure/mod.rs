use super::application::{Commands, NativeGame};
use crate::features::{
    pet_arena::arena8::domain as bound,
    pet_arena::coop as coordinated,
    pet_arena::domain as pet,
    synthetic::domain::{Rules, State},
};
use aetheria_gateway::{Options, durable::PgAdmission};
use aetheria_persistence::{Host, Keys, Owner, Scope};
use aetheria_pet_arena::arena8::binding::{self, Allocation, ArtifactSelection};
use aetheria_pet_arena::arena8::coop::{SEATS, SeatInput};
use aetheria_security::{
    RuntimeScope, TicketVerifier, durable::DurableTrust, transport::connect_runtime_postgres,
};
use aetheria_world::ZoneHandle;
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

/// Server-authored Arena8 allocation. A client never sends these fields.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Arena8Settings {
    pet_id: String,
    owned_pet_id: Uuid,
    level: u8,
    encounter_id: String,
    binding_version: u32,
    #[serde(default)]
    artifacts: Vec<Arena8Artifact>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Arena8Artifact {
    definition_id: String,
    upgrade_level: u8,
}

/// Server-authored cooperative seat allocation. Accounts, Pets and levels are
/// never read from an intent payload.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CoopSeat {
    account: Uuid,
    pet_id: String,
    level: u8,
    artifact_power_pm: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CoopSettings {
    seats: Vec<CoopSeat>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    #[serde(default)]
    movement: bool,
    schema_version: u32,
    ruleset: String,
    pet: Option<u8>,
    stage: Option<u8>,
    #[serde(default)]
    arena8: Option<Arena8Settings>,
    #[serde(default)]
    coop: Option<CoopSettings>,
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
struct Health<G: NativeGame> {
    commands: Arc<Commands<G>>,
    ruleset: String,
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
    /// `bundle` is the validated, published gameplay configuration supplied by
    /// the server-owned allocator. Only the cooperative ruleset consumes it.
    pub async fn start(
        file: &str,
        database: &str,
        bundle: Option<Vec<u8>>,
    ) -> Result<Self, &'static str> {
        let bytes = fs::read(file).map_err(|_| "Native configuration unavailable")?;
        if bytes.len() > 65_536 {
            return Err("Native configuration too large");
        }
        let settings: Settings =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid native configuration")?;
        if settings.schema_version != 1
            || settings.player.is_nil()
            || settings.match_id.is_nil()
            || settings.public_keys.is_empty()
            || settings.public_keys.len() > 8
        {
            return Err("Explicit native ruleset and scope required");
        }
        if settings.ruleset != coordinated::domain::RULESET_ID && settings.coop.is_some() {
            return Err("Cooperative allocation is not valid for this ruleset");
        }
        match settings.ruleset.as_str() {
            "headless-counter" if settings.pet.is_none() && settings.stage.is_none() => {
                let game = Rules {
                    player: settings.player.to_string(),
                };
                let initial = State {
                    player: settings.player.to_string(),
                    turns: 0,
                    private_roll: 0,
                };
                Self::compose(settings, database, game, initial).await
            }
            "pet-arena-pve" => {
                if settings.arena8.is_some() {
                    return Err("Arena8 allocation is not valid for pet-arena-pve");
                }
                let game = pet::Rules {
                    player: settings.player.to_string(),
                    pet: settings.pet.ok_or("Server-selected pet required")?,
                    stage: settings.stage.ok_or("Server-selected stage required")?,
                };
                let initial = game.initial().map_err(|_| "Invalid Pet Arena allocation")?;
                Self::compose(settings, database, game, initial).await
            }
            "arena8-pve" => {
                if settings.pet.is_some() || settings.stage.is_some() {
                    return Err("Arena8 requires an explicit snapshot allocation");
                }
                let (game, initial) = {
                    let allocation = settings
                        .arena8
                        .as_ref()
                        .ok_or("Server-selected Arena8 allocation required")?;
                    if allocation.binding_version != binding::BINDING_VERSION {
                        return Err("Unsupported Arena8 binding version");
                    }
                    let game = bound::Rules::allocate(Allocation {
                        account: settings.player.to_string(),
                        owned_pet_id: allocation.owned_pet_id.to_string(),
                        pet_id: allocation.pet_id.clone(),
                        level: allocation.level,
                        encounter_id: allocation.encounter_id.clone(),
                        artifacts: allocation
                            .artifacts
                            .iter()
                            .map(|artifact| ArtifactSelection {
                                definition_id: artifact.definition_id.clone(),
                                upgrade_level: artifact.upgrade_level,
                            })
                            .collect(),
                    })
                    .map_err(|_| "Invalid Arena8 allocation")?;
                    let initial = game.initial().map_err(|_| "Invalid Arena8 allocation")?;
                    (game, initial)
                };
                Self::compose(settings, database, game, initial).await
            }
            "arena8-coop-pve" => {
                if settings.pet.is_some() || settings.stage.is_some() || settings.arena8.is_some() {
                    return Err("Cooperative match requires an explicit four-seat allocation");
                }
                let allocation = settings
                    .coop
                    .as_ref()
                    .ok_or("Server-selected cooperative allocation required")?;
                let [first, second, third, fourth] = allocation.seats.as_slice() else {
                    return Err("Four cooperative seats required");
                };
                if allocation
                    .seats
                    .iter()
                    .any(|seat| seat.account.is_nil() || seat.pet_id.is_empty())
                {
                    return Err("Invalid cooperative allocation");
                }
                let seats: [SeatInput; SEATS] =
                    [first, second, third, fourth].map(|seat| SeatInput {
                        account: seat.account.to_string(),
                        pet_id: seat.pet_id.clone(),
                        level: seat.level,
                        artifact_power_pm: seat.artifact_power_pm,
                    });
                let bundle = bundle.ok_or("Published gameplay configuration required")?;
                let game = coordinated::domain::Rules::load(&bundle, seats)
                    .map_err(|_| "Invalid cooperative gameplay configuration")?;
                let initial = game
                    .initial()
                    .map_err(|_| "Invalid cooperative allocation")?;
                Self::compose(settings, database, game, initial).await
            }
            _ => Err("Unknown or incomplete native ruleset"),
        }
    }
    async fn compose<G: NativeGame>(
        settings: Settings,
        database: &str,
        game: G,
        initial: G::State,
    ) -> Result<Self, &'static str>
    where
        G::State: Send + Sync,
        G::Action: Send + Sync + 'static,
    {
        let content = game.ruleset().content_hash;
        let ruleset = settings.ruleset.clone();
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
            game,
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
                    content: content.iter().map(|byte| format!("{byte:02x}")).collect(),
                },
            )
            .map_err(|_| "Native ticket scope unavailable")?,
        );
        let (zone, actor) = aetheria_world::zone(32, 64).map_err(|_| "Native zone unavailable")?;
        let (actor, collision) = if settings.movement {
            let collision = aetheria_world::collision::Collision::aurora()
                .map_err(|_| "Native collision unavailable")?;
            let epoch = u64::from_le_bytes(Uuid::new_v4().as_bytes()[..8].try_into().unwrap()) >> 1;
            (
                actor
                    .with_collision(collision.clone())
                    .with_epoch(epoch.max(1))
                    .map_err(|_| "Native epoch unavailable")?,
                Some(collision),
            )
        } else {
            (actor, None)
        };
        let mut admission = PgAdmission::new(trust, config, ca, settings.role, zone.clone())
            .map_err(|_| "Native admission unavailable")?
            .with_games(commands.clone());
        if let Some(collision) = collision {
            admission = admission.with_movement(collision);
        }
        let gateway = aetheria_gateway::router(
            Options {
                enabled: true,
                origins: vec![settings.origin],
                content_hash: content,
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
                .create(&mut db, settings.match_id, initial)
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
            ruleset: ruleset.clone(),
            db: Mutex::new(db),
            zone_alive: alive,
            _driver: driver,
        });
        let router = Router::new()
            .route("/health/ready", get(ready::<G>))
            .route("/metrics", get(metrics::<G>))
            .with_state(health)
            .route("/health/live", get(move || { let ruleset = ruleset.clone(); async move { ([("content-type", "application/json")], serde_json::json!({"status":"live","service":"aetheria-game-runtime","gameplayEnabled":true,"ruleset":ruleset}).to_string()) } }))
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
async fn ready<G: NativeGame>(
    AxumState(health): AxumState<Arc<Health<G>>>,
) -> (StatusCode, [(&'static str, &'static str); 1], String)
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
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
            [("content-type", "application/json")],
            serde_json::json!({"status":"ready","gameplayEnabled":true,"ruleset":health.ruleset})
                .to_string(),
        ),
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            [("content-type", "application/json")],
            serde_json::json!({"status":"not_ready","gameplayEnabled":true}).to_string(),
        ),
    }
}
async fn metrics<G: NativeGame>(
    AxumState(health): AxumState<Arc<Health<G>>>,
) -> ([(&'static str, &'static str); 1], String) {
    let committed = health.commands.committed.load(Ordering::Relaxed);
    let rejected = health.commands.rejected.load(Ordering::Relaxed);
    (
        [("content-type", "text/plain; version=0.0.4")],
        format!(
            "# TYPE aetheria_native_command_receipts_total counter\naetheria_native_command_receipts_total {committed}\n# TYPE aetheria_native_command_rejections_total counter\naetheria_native_command_rejections_total {rejected}\n"
        ),
    )
}
