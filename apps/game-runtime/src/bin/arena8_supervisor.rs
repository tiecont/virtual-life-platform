//! Local-only Arena8 supervisor.
//!
//! This binary is the bounded local match authority for Wave C2. It is bound to
//! loopback and is called only by the Nest allocator/proxy; it is never a public
//! client endpoint. It owns entropy and durable match state, and accepts only
//! the same bounded intents as the native arena8-pve adapter.

use aetheria_game_core::{Checkpoint, Command, LogicalClock, Reducer, SecretSeed, apply, begin};
use aetheria_pet_arena::arena8::binding::{Allocation, ArtifactSelection, MatchSnapshot};
use aetheria_pet_arena::arena8::{Action, Arena8Bound, BoundState, CombatEvent, Phase};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone)]
struct App {
    directory: Arc<PathBuf>,
    lock: Arc<Mutex<()>>,
}

#[derive(Debug)]
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1}))).into_response()
    }
}
type Result<T> = std::result::Result<T, ApiError>;

fn bad(message: &str) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, message.into())
}
fn unavailable(message: &str) -> ApiError {
    ApiError(StatusCode::SERVICE_UNAVAILABLE, message.into())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactInput {
    definition_id: String,
    upgrade_level: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AllocateInput {
    account: String,
    owned_pet_id: String,
    pet_id: String,
    level: u8,
    encounter_id: String,
    #[serde(default)]
    artifacts: Vec<ArtifactInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandInput {
    match_id: String,
    command_id: String,
    expected_version: u64,
    action: ActionInput,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum ActionInput {
    Start {},
    Swap { first: u8, second: u8 },
    Skill {},
    Signature {},
    FireZone {},
    Ultimate {},
    Guard {},
}
impl ActionInput {
    fn action(self) -> Action {
        match self {
            Self::Start {} => Action::Start,
            Self::Swap { first, second } => Action::Swap { first, second },
            Self::Skill {} => Action::Skill,
            Self::Signature {} => Action::Signature,
            Self::FireZone {} => Action::FireZone,
            Self::Ultimate {} => Action::Ultimate,
            Self::Guard {} => Action::Guard,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Receipt {
    version: u64,
    receipt_id: String,
    view: Value,
    events: Vec<Value>,
    terminal: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct MatchRecord {
    match_id: String,
    version: u64,
    rng_cursor: u64,
    seed_commitment: [u8; 32],
    audit_hash: [u8; 32],
    seed_hex: String,
    state_hex: String,
    snapshot: MatchSnapshot,
    receipts: HashMap<String, Receipt>,
}

#[derive(Serialize)]
struct AllocateResponse {
    #[serde(rename = "matchId")]
    match_id: String,
    version: u64,
    view: Value,
    events: Vec<Value>,
}

#[derive(Serialize)]
struct CommandResponse {
    #[serde(rename = "matchId")]
    match_id: String,
    version: u64,
    #[serde(rename = "receiptId")]
    receipt_id: String,
    view: Value,
    events: Vec<Value>,
    terminal: bool,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
fn unhex(value: &str) -> Result<Vec<u8>> {
    if !value.len().is_multiple_of(2) || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(bad("invalid hex"));
    }
    (0..value.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&value[i..i + 2], 16).map_err(|_| bad("invalid hex")))
        .collect()
}
fn path_for(directory: &FsPath, id: &str) -> Result<PathBuf> {
    let parsed = Uuid::parse_str(id).map_err(|_| bad("invalid match id"))?;
    Ok(directory.join(format!("{parsed}.json")))
}
fn write_record(directory: &FsPath, record: &MatchRecord) -> Result<()> {
    let path = path_for(directory, &record.match_id)?;
    let temporary = path.with_extension("tmp");
    let bytes = serde_json::to_vec(record).map_err(|_| unavailable("cannot encode match"))?;
    fs::write(&temporary, bytes).map_err(|_| unavailable("cannot persist match"))?;
    fs::rename(&temporary, &path).map_err(|_| unavailable("cannot commit match"))?;
    Ok(())
}
fn read_record(directory: &FsPath, id: &str) -> Result<MatchRecord> {
    let path = path_for(directory, id)?;
    let bytes =
        fs::read(path).map_err(|_| ApiError(StatusCode::NOT_FOUND, "match not found".into()))?;
    serde_json::from_slice(&bytes).map_err(|_| unavailable("match state is invalid"))
}

fn seed_bytes() -> [u8; 32] {
    let first = Uuid::new_v4().into_bytes();
    let second = Uuid::new_v4().into_bytes();
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0)
        .to_le_bytes();
    let mut out = [0u8; 32];
    for (index, byte) in out.iter_mut().enumerate() {
        *byte = first[index % 16] ^ second[(index + 7) % 16] ^ elapsed[index % 16];
    }
    out
}

fn phase(value: Phase) -> &'static str {
    match value {
        Phase::Ready => "ready",
        Phase::Playing => "playing",
        Phase::Won => "won",
        Phase::Lost => "lost",
    }
}
fn stats(value: aetheria_pet_arena::arena8::binding::CombatStats) -> Value {
    json!({"health": value.health, "attack": value.attack, "defense": value.defense})
}
fn modifier(active: bool, value: u16, effect: &str) -> Value {
    json!({"value": value, "active": active, "effect": effect})
}
fn view(record: &MatchRecord) -> Result<Value> {
    let state =
        BoundState::decode(&unhex(&record.state_hex)?).map_err(|_| unavailable("invalid state"))?;
    let snapshot = &record.snapshot;
    let core = state.core();
    let skills: Vec<Value> = snapshot
        .skills()
        .iter()
        .map(|skill| json!({"id": skill, "level": 1, "maxLevel": 10, "available": true, "reason": null}))
        .collect();
    let artifacts: Vec<Value> = snapshot
        .artifacts()
        .iter()
        .map(|artifact| {
            json!({
                "slot": artifact.slot,
                "definitionId": artifact.definition_id,
                "rank": artifact.rank,
                "upgradeLevel": artifact.upgrade_level,
                "modifiers": {
                    "hp": artifact.modifiers.hp,
                    "attack": artifact.modifiers.attack,
                    "defense": artifact.modifiers.defense,
                    "speed": artifact.modifiers.speed,
                }
            })
        })
        .collect();
    let encounter = snapshot.encounter();
    Ok(json!({
        "schemaVersion": 1,
        "matchId": record.match_id,
        "version": record.version,
        "ruleset": {
            "id": "aetheria-pet-arena-arena8-pve",
            "version": 2,
            "bindingId": snapshot.binding_id(),
            "bindingVersion": snapshot.binding_version(),
            "contentHash": hex(&snapshot.binding_digest()),
            "snapshotDigest": hex(&snapshot.digest()),
        },
        "pet": {
            "id": snapshot.pet_id(),
            "ownedPetId": snapshot.owned_pet_id(),
            "family": snapshot.family(),
            "level": snapshot.level(),
            "element": snapshot.element(),
        },
        "stats": {
            "base": stats(snapshot.base()),
            "grown": stats(snapshot.grown()),
            "effective": stats(snapshot.effective()),
        },
        "artifacts": artifacts,
        "modifiers": {
            "hp": modifier(true, snapshot.modifiers().hp, "active"),
            "attack": modifier(true, snapshot.modifiers().attack, "active"),
            "defense": modifier(true, snapshot.modifiers().defense, "active"),
            "speed": modifier(false, snapshot.modifiers().speed, "inactive"),
        },
        "skills": skills,
        "encounter": {
            "index": encounter.index,
            "id": encounter.id,
            "revision": encounter.revision,
            "boss": encounter.boss,
            "element": encounter.element,
        },
        "phase": phase(core.phase()),
        "turn": core.turn(),
        "board": core.board().cells().iter().map(|element| *element as u8).collect::<Vec<_>>(),
        "health": core.health(),
        "enemyHealth": core.enemy_health(),
        "enemyShield": core.enemy_shield(),
        "mana": core.mana(),
        "rage": core.rage(),
        "cooldown": core.cooldown(),
        "fireZoneTurns": core.fire_zone_turns(),
        "telegraph": core.intent(),
        "terminal": core.phase().terminal(),
    }))
}

async fn allocate(
    State(app): State<App>,
    Json(input): Json<AllocateInput>,
) -> Result<Json<AllocateResponse>> {
    let _guard = app.lock.lock().await;
    let allocation = Allocation {
        account: input.account,
        owned_pet_id: input.owned_pet_id,
        pet_id: input.pet_id,
        level: input.level,
        encounter_id: input.encounter_id,
        artifacts: input
            .artifacts
            .into_iter()
            .map(|artifact| ArtifactSelection {
                definition_id: artifact.definition_id,
                upgrade_level: artifact.upgrade_level,
            })
            .collect(),
    };
    let snapshot = allocation.bind().map_err(|_| bad("invalid allocation"))?;
    let match_id = Uuid::new_v4();
    let seed_bytes = seed_bytes();
    let seed = SecretSeed::from_host_entropy(seed_bytes);
    let state = BoundState::allocate(snapshot.clone()).map_err(|_| bad("invalid initial state"))?;
    let checkpoint = begin(
        &Arena8Bound,
        match_id.into_bytes(),
        state,
        &seed,
        LogicalClock {
            server_tick: 0,
            logical_time_ms: 0,
        },
    )
    .map_err(|_| bad("cannot begin match"))?;
    let record = MatchRecord {
        match_id: match_id.to_string(),
        version: checkpoint.version,
        rng_cursor: checkpoint.rng_cursor,
        seed_commitment: checkpoint.seed_commitment,
        audit_hash: checkpoint.audit_hash,
        seed_hex: hex(&seed_bytes),
        state_hex: hex(&checkpoint
            .state
            .encode()
            .map_err(|_| bad("cannot encode state"))?),
        snapshot,
        receipts: HashMap::new(),
    };
    let projection = view(&record)?;
    write_record(&app.directory, &record)?;
    Ok(Json(AllocateResponse {
        match_id: record.match_id,
        version: record.version,
        view: projection,
        events: vec![],
    }))
}

async fn command(
    State(app): State<App>,
    Json(input): Json<CommandInput>,
) -> Result<Json<CommandResponse>> {
    let _guard = app.lock.lock().await;
    let mut record = read_record(&app.directory, &input.match_id)?;
    if let Some(receipt) = record.receipts.get(&input.command_id) {
        return Ok(Json(CommandResponse {
            match_id: record.match_id,
            version: receipt.version,
            receipt_id: receipt.receipt_id.clone(),
            view: receipt.view.clone(),
            events: receipt.events.clone(),
            terminal: receipt.terminal,
        }));
    }
    if record.version != input.expected_version {
        return Err(ApiError(StatusCode::CONFLICT, "stale version".into()));
    }
    let match_id = Uuid::parse_str(&record.match_id).map_err(|_| bad("invalid match id"))?;
    let command_id = Uuid::parse_str(&input.command_id).map_err(|_| bad("invalid command id"))?;
    let seed = SecretSeed::from_host_entropy(
        <[u8; 32]>::try_from(unhex(&record.seed_hex)?).map_err(|_| bad("invalid seed record"))?,
    );
    let state =
        BoundState::decode(&unhex(&record.state_hex)?).map_err(|_| unavailable("invalid state"))?;
    let version = record.version;
    let checkpoint = Checkpoint {
        match_id: match_id.into_bytes(),
        ruleset: Arena8Bound.ruleset(),
        version,
        clock: LogicalClock {
            server_tick: version,
            logical_time_ms: version * 1000,
        },
        rng_cursor: record.rng_cursor,
        seed_commitment: record.seed_commitment,
        audit_hash: record.audit_hash,
        state,
    };
    let transition = apply(
        &Arena8Bound,
        &checkpoint,
        &Command {
            id: command_id.into_bytes(),
            match_id: match_id.into_bytes(),
            expected_version: version,
            ruleset: Arena8Bound.ruleset(),
            action: input.action.action(),
        },
        &seed,
        LogicalClock {
            server_tick: version + 1,
            logical_time_ms: (version + 1) * 1000,
        },
    )
    .map_err(|error| ApiError(StatusCode::CONFLICT, format!("command rejected: {error:?}")))?;
    let events: Vec<Value> = transition
        .events
        .iter()
        .map(|event| {
            serde_json::to_value(
                CombatEvent::from_canonical(event).unwrap_or(CombatEvent::TurnEnded { turn: 0 }),
            )
            .unwrap_or(Value::Null)
        })
        .collect();
    record.version = transition.next.version;
    record.rng_cursor = transition.next.rng_cursor;
    record.audit_hash = transition.next.audit_hash;
    record.state_hex = hex(&transition
        .next
        .state
        .encode()
        .map_err(|_| unavailable("cannot encode state"))?);
    let projection = view(&record)?;
    let terminal = projection["terminal"].as_bool().unwrap_or(false);
    let receipt = Receipt {
        version: record.version,
        receipt_id: command_id.to_string(),
        view: projection.clone(),
        events: events.clone(),
        terminal,
    };
    record.receipts.insert(input.command_id, receipt);
    write_record(&app.directory, &record)?;
    Ok(Json(CommandResponse {
        match_id: record.match_id,
        version: record.version,
        receipt_id: command_id.to_string(),
        view: projection,
        events,
        terminal,
    }))
}

async fn read(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>> {
    let _guard = app.lock.lock().await;
    let record = read_record(&app.directory, &id)?;
    Ok(Json(view(&record)?))
}

#[tokio::main(worker_threads = 2)]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let directory = PathBuf::from(std::env::var("ARENA8_SUPERVISOR_DIR")?);
    fs::create_dir_all(&directory)?;
    let bind = std::env::var("ARENA8_SUPERVISOR_BIND").unwrap_or_else(|_| "127.0.0.1:0".into());
    if !bind.starts_with("127.0.0.1:") && !bind.starts_with("[::1]:") {
        return Err("Arena8 supervisor must bind loopback".into());
    }
    let app = App {
        directory: Arc::new(directory),
        lock: Arc::new(Mutex::new(())),
    };
    let router = Router::new()
        .route("/allocate", post(allocate))
        .route("/command", post(command))
        .route("/matches/{matchId}", get(read))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    println!("ARENA8_SUPERVISOR_LISTEN {}", listener.local_addr()?);
    axum::serve(listener, router).await?;
    Ok(())
}
