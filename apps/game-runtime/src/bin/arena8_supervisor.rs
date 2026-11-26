//! Local-only Arena8 supervisor (Wave C2B).
//!
//! This is an explicitly isolated loopback match service. It owns the committed
//! bound reducer state and durable command receipts. Nest is the only caller:
//! every request requires the private internal token. It is not the native
//! admission/journal authority and is not a public API.

use aetheria_game_core::{Checkpoint, Command, LogicalClock, Reducer, SecretSeed, apply, begin};
use aetheria_pet_arena::arena8::binding::{Allocation, ArtifactSelection, MatchSnapshot, SkillId};
use aetheria_pet_arena::arena8::{Action, Arena8Bound, BoundState, CombatEvent, Phase};
use axum::{
    Json, Router,
    extract::{Path, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone)]
struct App {
    directory: Arc<PathBuf>,
    token: Arc<String>,
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
fn conflict(message: &str) -> ApiError {
    ApiError(StatusCode::CONFLICT, message.into())
}
fn unavailable(message: &str) -> ApiError {
    ApiError(StatusCode::SERVICE_UNAVAILABLE, message.into())
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactInput {
    definition_id: String,
    upgrade_level: u8,
}

#[derive(Clone, Deserialize, Serialize)]
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
struct AllocateEnvelope {
    allocation: AllocateInput,
    request_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandInput {
    account: String,
    match_id: String,
    command_id: String,
    expected_version: u64,
    action: ActionInput,
}

#[derive(Clone, Deserialize, Serialize)]
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
    fingerprint: String,
    view: Value,
    events: Vec<Value>,
    terminal: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct MatchRecord {
    match_id: String,
    account: String,
    version: u64,
    rng_cursor: u64,
    seed_commitment: [u8; 32],
    audit_hash: [u8; 32],
    seed_hex: String,
    state_hex: String,
    snapshot: MatchSnapshot,
    receipts: HashMap<String, Receipt>,
}

#[derive(Clone, Serialize, Deserialize)]
struct AllocationIndexEntry {
    match_id: String,
    fingerprint: String,
}
#[derive(Default, Serialize, Deserialize)]
struct AllocationIndex {
    requests: HashMap<String, AllocationIndexEntry>,
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

#[derive(Serialize)]
struct MatchView {
    #[serde(rename = "matchId")]
    match_id: String,
    version: u64,
    view: Value,
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
fn write_bytes(path: &FsPath, bytes: &[u8]) -> Result<()> {
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary).map_err(|_| unavailable("cannot write state"))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| unavailable("cannot persist state"))?;
    fs::rename(&temporary, path).map_err(|_| unavailable("cannot commit state"))?;
    Ok(())
}
fn write_record(directory: &FsPath, record: &MatchRecord) -> Result<()> {
    let path = path_for(directory, &record.match_id)?;
    let bytes = serde_json::to_vec(record).map_err(|_| unavailable("cannot encode match"))?;
    write_bytes(&path, &bytes)
}
fn read_record(directory: &FsPath, id: &str) -> Result<MatchRecord> {
    let path = path_for(directory, id)?;
    let bytes =
        fs::read(path).map_err(|_| ApiError(StatusCode::NOT_FOUND, "match not found".into()))?;
    serde_json::from_slice(&bytes).map_err(|_| unavailable("match state is invalid"))
}
fn index_path(directory: &FsPath) -> PathBuf {
    directory.join("allocations.json")
}
fn read_index(directory: &FsPath) -> Result<AllocationIndex> {
    match fs::read(index_path(directory)) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| unavailable("allocation index invalid"))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(AllocationIndex::default())
        }
        Err(_) => Err(unavailable("allocation index unavailable")),
    }
}
fn write_index(directory: &FsPath, index: &AllocationIndex) -> Result<()> {
    let bytes = serde_json::to_vec(index).map_err(|_| unavailable("cannot encode index"))?;
    write_bytes(&index_path(directory), &bytes)
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
fn can_cast(core: &aetheria_pet_arena::arena8::State, skill: SkillId) -> (bool, &'static str) {
    if core.phase() != Phase::Playing {
        return (false, "combat phase does not allow casting");
    }
    match skill {
        SkillId::Guard => (true, ""),
        SkillId::SharedSkill => {
            if core.cooldown() > 0 {
                (false, "cooldown")
            } else if core.mana() < 100 {
                (false, "mana")
            } else {
                (true, "")
            }
        }
        SkillId::Signature => {
            if core.cooldown() > 0 {
                (false, "cooldown")
            } else if core.mana() < 200 {
                (false, "mana")
            } else if core.rage() < 150 {
                (false, "rage")
            } else {
                (true, "")
            }
        }
        SkillId::FireZone => {
            if core.cooldown() > 0 {
                (false, "cooldown")
            } else if core.mana() < 200 {
                (false, "mana")
            } else if core.rage() < 150 {
                (false, "rage")
            } else {
                (true, "")
            }
        }
        SkillId::Ultimate => {
            if core.cooldown() > 0 {
                (false, "cooldown")
            } else if core.mana() < 300 {
                (false, "mana")
            } else if core.rage() < 200 {
                (false, "rage")
            } else {
                (true, "")
            }
        }
    }
}
fn view(record: &MatchRecord) -> Result<Value> {
    let state =
        BoundState::decode(&unhex(&record.state_hex)?).map_err(|_| unavailable("invalid state"))?;
    let snapshot = &record.snapshot;
    let core = state.core();
    let skills: Vec<Value> = snapshot
        .skills()
        .iter()
        .map(|skill| {
            let (castable, reason) = can_cast(core, *skill);
            json!({
                "id": skill,
                "unlocked": true,
                "skillLevel": 1,
                "maxSkillLevel": 10,
                "canCast": castable,
                "reason": if reason.is_empty() { Value::Null } else { Value::String(reason.into()) },
            })
        })
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
                },
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

async fn require_token(State(app): State<App>, request: Request, next: Next) -> Response {
    let supplied = request
        .headers()
        .get("x-arena8-token")
        .and_then(|value| value.to_str().ok());
    if supplied != Some(app.token.as_str()) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    next.run(request).await
}

async fn allocate(
    State(app): State<App>,
    Json(envelope): Json<AllocateEnvelope>,
) -> Result<Json<AllocateResponse>> {
    let _guard = app.lock.lock().await;
    Uuid::parse_str(&envelope.request_id).map_err(|_| bad("invalid request id"))?;
    let fingerprint =
        serde_json::to_string(&envelope.allocation).map_err(|_| bad("invalid allocation"))?;
    let mut index = read_index(&app.directory)?;
    if let Some(existing) = index.requests.get(&envelope.request_id) {
        if existing.fingerprint != fingerprint {
            return Err(conflict("allocation id reused with different content"));
        }
        let record = read_record(&app.directory, &existing.match_id)?;
        let projection = view(&record)?;
        return Ok(Json(AllocateResponse {
            match_id: record.match_id,
            version: record.version,
            view: projection,
            events: vec![],
        }));
    }
    let input = envelope.allocation;
    let allocation = Allocation {
        account: input.account.clone(),
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
        account: input.account,
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
    index.requests.insert(
        envelope.request_id,
        AllocationIndexEntry {
            match_id: record.match_id.clone(),
            fingerprint,
        },
    );
    write_index(&app.directory, &index)?;
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
    if record.account != input.account {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "match ownership denied".into(),
        ));
    }
    let fingerprint = serde_json::to_string(&(&input.expected_version, &input.action))
        .map_err(|_| bad("invalid command"))?;
    if let Some(receipt) = record.receipts.get(&input.command_id) {
        if receipt.fingerprint != fingerprint {
            return Err(conflict("command id reused with different content"));
        }
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
        return Err(conflict("stale version"));
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
    .map_err(|error| conflict(&format!("command rejected: {error:?}")))?;
    let mut events = Vec::with_capacity(transition.events.len());
    for (sequence, event) in transition.events.iter().enumerate() {
        let decoded = CombatEvent::from_canonical(event)
            .map_err(|_| unavailable("committed event could not be decoded"))?;
        events.push(json!({"sequence": sequence, "event": decoded}));
    }
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
        fingerprint,
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

async fn read(State(app): State<App>, Path(id): Path<String>) -> Result<Json<MatchView>> {
    let _guard = app.lock.lock().await;
    let record = read_record(&app.directory, &id)?;
    let projection = view(&record)?;
    let terminal = projection["terminal"].as_bool().unwrap_or(false);
    Ok(Json(MatchView {
        match_id: record.match_id,
        version: record.version,
        view: projection,
        terminal,
    }))
}

async fn owner(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>> {
    let _guard = app.lock.lock().await;
    let record = read_record(&app.directory, &id)?;
    Ok(Json(json!({
        "matchId": record.match_id,
        "account": record.account,
        "ownedPetId": record.snapshot.owned_pet_id(),
        "petId": record.snapshot.pet_id(),
    })))
}

#[tokio::main(worker_threads = 2)]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let directory = PathBuf::from(std::env::var("ARENA8_SUPERVISOR_DIR")?);
    let token = std::env::var("ARENA8_SUPERVISOR_TOKEN")?;
    if token.len() < 32 {
        return Err("Arena8 supervisor token must be at least 32 characters".into());
    }
    fs::create_dir_all(&directory)?;
    let bind = std::env::var("ARENA8_SUPERVISOR_BIND").unwrap_or_else(|_| "127.0.0.1:0".into());
    if !bind.starts_with("127.0.0.1:") && !bind.starts_with("[::1]:") {
        return Err("Arena8 supervisor must bind loopback".into());
    }
    let app = App {
        directory: Arc::new(directory),
        token: Arc::new(token),
        lock: Arc::new(Mutex::new(())),
    };
    let router = Router::new()
        .route("/allocate", post(allocate))
        .route("/command", post(command))
        .route("/matches/{matchId}", get(read))
        .route("/matches/{matchId}/owner", get(owner))
        .layer(middleware::from_fn_with_state(app.clone(), require_token))
        .with_state(app);
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    println!("ARENA8_SUPERVISOR_LISTEN {}", listener.local_addr()?);
    axum::serve(listener, router).await?;
    Ok(())
}
