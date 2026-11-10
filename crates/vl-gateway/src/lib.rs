//! Bounded, opt-in binary transport. A trusted host supplies current admission.
//! No game reducer, wallet effect, AOI peer projection or production activation.
pub mod durable;
use std::{
    collections::{BTreeSet, VecDeque},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    Router,
    extract::{
        State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    http::{HeaderMap, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::get,
};
use prost::Message as _;
use sha2::{Digest, Sha256};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use vl_protocol::{
    MAX_FRAME_BYTES, PUBLIC_VERSION, decode_client,
    public::{self, client_envelope, server_envelope},
};

const IO_TIMEOUT: Duration = Duration::from_millis(750);
const HELLO_TIMEOUT: Duration = Duration::from_secs(4);
const CONNECTION_LIFETIME: Duration = Duration::from_secs(30);
const CACHE_LIMIT: usize = 32;
const SUBPROTOCOL: &str = "vl.native.v1";

pub type Task<'a, T> = Pin<Box<dyn Future<Output = Result<T, Fault>> + Send + 'a>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    Unauthenticated,
    Revoked,
    Unavailable,
}

/// Implemented by trusted server code, never constructed from decoded claims.
/// Admission must verify the configured scope and consume a durable one-use nonce.
pub trait Admission: Send + Sync {
    fn admit<'a>(&'a self, ticket: &'a str) -> Task<'a, Box<dyn Session>>;
}

/// The implementation owns its connection/authority capability. Every read,
/// including a cached reply, is guarded again. No public identity serialization.
pub trait Session: Send {
    fn principal(&self) -> &str;
    fn authorize(&mut self) -> Task<'_, ()>;
    fn snapshot(&mut self) -> Task<'_, public::WorldSnapshot>;
}

pub struct Options {
    pub enabled: bool,
    pub origins: Vec<String>,
    pub content_hash: [u8; 32],
    pub runtime_boot_id: [u8; 16],
    pub connections: usize,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            enabled: false,
            origins: Vec::new(),
            content_hash: [0; 32],
            runtime_boot_id: [0; 16],
            connections: 32,
        }
    }
}

struct Gateway {
    admission: Arc<dyn Admission>,
    options: Options,
    origins: BTreeSet<String>,
    slots: Arc<Semaphore>,
    handshakes: Mutex<Bucket>,
}

/// Mount only behind a trusted TLS terminator with a loopback upstream. This
/// factory does not bind a public listener or install the route in the runtime.
pub fn router(options: Options, admission: Arc<dyn Admission>) -> Result<Router, &'static str> {
    if !options.enabled {
        return Ok(Router::new());
    }
    if options.origins.is_empty()
        || options.origins.len() > 8
        || options.content_hash == [0; 32]
        || options.runtime_boot_id == [0; 16]
        || !(1..=64).contains(&options.connections)
    {
        return Err("Explicit gateway scope, origins and bounded capacity required");
    }
    for origin in &options.origins {
        let uri: Uri = origin.parse().map_err(|_| "Invalid gateway origin")?;
        if origin.len() > 256
            || origin.ends_with('/')
            || uri.scheme_str() != Some("https")
            || uri.authority().is_none_or(|a| a.as_str().contains('@'))
            || uri.path() != "/"
            || uri.query().is_some()
        {
            return Err("Gateway origin must be a canonical HTTPS origin");
        }
    }
    let slots = Arc::new(Semaphore::new(options.connections));
    let origins = options.origins.iter().cloned().collect();
    let state = Arc::new(Gateway {
        options,
        admission,
        slots,
        origins,
        handshakes: Mutex::new(Bucket::new(32, 32, Instant::now())),
    });
    Ok(Router::new()
        .route("/rt/v1", get(upgrade))
        .with_state(state))
}

async fn upgrade(
    State(state): State<Arc<Gateway>>,
    headers: HeaderMap,
    uri: Uri,
    ws: WebSocketUpgrade,
) -> Response {
    let origin = headers.get(header::ORIGIN).and_then(|h| h.to_str().ok());
    let protocol = headers
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|h| h.to_str().ok());
    if uri.query().is_some()
        || headers.contains_key(header::AUTHORIZATION)
        || headers.get_all(header::ORIGIN).iter().count() != 1
        || origin.is_none_or(|origin| !state.origins.contains(origin))
        || protocol.is_none_or(|p| !p.split(',').any(|v| v.trim() == SUBPROTOCOL))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let allowed = state
        .handshakes
        .lock()
        .is_ok_and(|mut b| b.take(Instant::now()));
    if !allowed {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let Ok(permit) = Arc::clone(&state.slots).try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    ws.protocols([SUBPROTOCOL])
        .read_buffer_size(8192)
        .write_buffer_size(0)
        .max_message_size(MAX_FRAME_BYTES)
        .max_frame_size(MAX_FRAME_BYTES)
        .max_write_buffer_size(MAX_FRAME_BYTES * 2)
        .on_upgrade(move |socket| connection(socket, state, permit))
}

struct Bucket {
    tokens: u32,
    capacity: u32,
    rate: u32,
    at: Instant,
}
impl Bucket {
    fn new(capacity: u32, rate: u32, at: Instant) -> Self {
        Self {
            tokens: capacity,
            capacity,
            rate,
            at,
        }
    }
    fn take(&mut self, now: Instant) -> bool {
        let elapsed = now.saturating_duration_since(self.at).as_nanos();
        let refill = (elapsed.saturating_mul(u128::from(self.rate)) / 1_000_000_000)
            .min(u128::from(self.capacity)) as u32;
        if refill > 0 {
            self.tokens = self.tokens.saturating_add(refill).min(self.capacity);
            self.at = now;
        }
        if self.tokens == 0 {
            return false;
        }
        self.tokens -= 1;
        true
    }
}

struct Cached {
    id: Vec<u8>,
    sequence: u64,
    fingerprint: [u8; 32],
    response: Vec<u8>,
}
#[derive(Default)]
struct Replies {
    last: u64,
    entries: VecDeque<Cached>,
}
enum Lookup {
    Fresh,
    Repeat(Vec<u8>),
    Reject(public::ErrorCode),
}
impl Replies {
    fn lookup(&self, id: &[u8], sequence: u64, fingerprint: &[u8; 32]) -> Lookup {
        if let Some(old) = self.entries.iter().find(|old| old.id == id) {
            return if old.sequence == sequence && &old.fingerprint == fingerprint {
                Lookup::Repeat(old.response.clone())
            } else {
                Lookup::Reject(public::ErrorCode::CommandIdCollision)
            };
        }
        if self.last.checked_add(1) != Some(sequence) {
            return Lookup::Reject(public::ErrorCode::StaleVersion);
        }
        Lookup::Fresh
    }
    fn remember(
        &mut self,
        frame: &public::ClientEnvelope,
        fingerprint: [u8; 32],
        response: Vec<u8>,
    ) {
        self.last = frame.sequence;
        if self.entries.len() == CACHE_LIMIT {
            self.entries.pop_front();
        }
        self.entries.push_back(Cached {
            id: frame.command_id.clone(),
            sequence: frame.sequence,
            fingerprint,
            response,
        });
    }
}

fn rejection(id: &[u8], version: u64, code: public::ErrorCode) -> Vec<u8> {
    public::ServerEnvelope {
        protocol_version: PUBLIC_VERSION,
        command_id: id.to_vec(),
        canonical_version: version,
        body: Some(server_envelope::Body::Rejection(public::Rejection {
            code: code as i32,
            retryable: matches!(
                code,
                public::ErrorCode::Backpressure | public::ErrorCode::TemporarilyUnavailable
            ),
            trace_id: Vec::new(),
        })),
    }
    .encode_to_vec()
}
fn valid_snapshot(snapshot: &public::WorldSnapshot) -> bool {
    snapshot.authority_epoch > 0
        && snapshot.own_actor.as_ref().is_some_and(|actor| {
            (-100_000..=100_000).contains(&actor.x_mm) && (-100_000..=100_000).contains(&actor.z_mm)
        })
}
async fn send(socket: &mut WebSocket, bytes: Vec<u8>) -> bool {
    bytes.len() <= MAX_FRAME_BYTES
        && matches!(
            tokio::time::timeout(IO_TIMEOUT, socket.send(Message::Binary(bytes.into()))).await,
            Ok(Ok(()))
        )
}
async fn authorize(session: &mut Box<dyn Session>) -> bool {
    matches!(
        tokio::time::timeout(IO_TIMEOUT, session.authorize()).await,
        Ok(Ok(()))
    )
}
async fn snapshot(session: &mut Box<dyn Session>) -> Option<public::WorldSnapshot> {
    let snapshot = tokio::time::timeout(IO_TIMEOUT, session.snapshot())
        .await
        .ok()?
        .ok()?;
    (valid_snapshot(&snapshot) && authorize(session).await).then_some(snapshot)
}

async fn connection(mut socket: WebSocket, state: Arc<Gateway>, _permit: OwnedSemaphorePermit) {
    let mut session: Option<Box<dyn Session>> = None;
    let mut replies = Replies::default();
    let mut version = 0;
    let mut budget = Bucket::new(32, 20, Instant::now());
    let started = tokio::time::Instant::now();
    let mut policy = tokio::time::interval(Duration::from_millis(500));
    policy.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        let message = tokio::select! {
            _ = tokio::time::sleep_until(started + CONNECTION_LIFETIME) => break,
            _ = tokio::time::sleep_until(started + HELLO_TIMEOUT), if session.is_none() => break,
            _ = policy.tick(), if session.is_some() => {
                if !authorize(session.as_mut().unwrap()).await { break; }
                continue;
            }
            message = socket.recv() => message,
        };
        if !budget.take(Instant::now()) {
            break;
        }
        let bytes = match message {
            Some(Ok(Message::Binary(bytes))) => bytes,
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
            _ => break,
        };
        let Ok(frame) = decode_client(&bytes) else {
            break;
        };
        if frame.command_id.iter().all(|byte| *byte == 0) {
            break;
        }
        let fingerprint: [u8; 32] = Sha256::digest(&bytes).into();
        let lookup = replies.lookup(&frame.command_id, frame.sequence, &fingerprint);
        let fresh_hello = matches!(lookup, Lookup::Fresh)
            && matches!(&frame.body, Some(client_envelope::Body::Hello(_)));
        if !fresh_hello && (session.is_none() || !authorize(session.as_mut().unwrap()).await) {
            break;
        }
        let response = match lookup {
            Lookup::Repeat(response) => {
                if !send(&mut socket, response).await {
                    break;
                }
                continue;
            }
            Lookup::Reject(code) => {
                if !send(&mut socket, rejection(&frame.command_id, version, code)).await {
                    break;
                }
                continue;
            }
            Lookup::Fresh => match &frame.body {
                Some(client_envelope::Body::Hello(hello)) => {
                    if hello.content_hash.as_slice() != state.options.content_hash {
                        break;
                    }
                    let admitted =
                        tokio::time::timeout(HELLO_TIMEOUT, state.admission.admit(&hello.ticket))
                            .await;
                    let Ok(Ok(mut admitted)) = admitted else {
                        break;
                    };
                    if admitted.principal().is_empty()
                        || admitted.principal().len() > 128
                        || session
                            .as_ref()
                            .is_some_and(|old| old.principal() != admitted.principal())
                        || !authorize(&mut admitted).await
                    {
                        break;
                    }
                    let Some(snapshot) = snapshot(&mut admitted).await else {
                        break;
                    };
                    version = snapshot.tick;
                    session = Some(admitted);
                    public::ServerEnvelope {
                        protocol_version: PUBLIC_VERSION,
                        command_id: frame.command_id.clone(),
                        canonical_version: version,
                        body: Some(server_envelope::Body::Hello(public::HelloAccepted {
                            content_hash: state.options.content_hash.to_vec(),
                            state_schema_version: 1,
                            snapshot: Some(snapshot),
                            runtime_boot_id: state.options.runtime_boot_id.to_vec(),
                        })),
                    }
                    .encode_to_vec()
                }
                Some(client_envelope::Body::Resync(_)) => {
                    let Some(snapshot) = snapshot(session.as_mut().unwrap()).await else {
                        break;
                    };
                    version = snapshot.tick;
                    public::ServerEnvelope {
                        protocol_version: PUBLIC_VERSION,
                        command_id: frame.command_id.clone(),
                        canonical_version: version,
                        body: Some(server_envelope::Body::Snapshot(snapshot)),
                    }
                    .encode_to_vec()
                }
                // These effects require their own verified command adapters.
                // A transport connection is never a committed movement/game ACK.
                _ => rejection(
                    &frame.command_id,
                    version,
                    public::ErrorCode::TemporarilyUnavailable,
                ),
            },
        };
        if !send(&mut socket, response.clone()).await {
            break;
        }
        replies.remember(&frame, fingerprint, response);
    }
    let _ = tokio::time::timeout(
        IO_TIMEOUT,
        socket.send(Message::Close(Some(CloseFrame {
            code: 1008,
            reason: "Session unavailable".into(),
        }))),
    )
    .await;
}

#[cfg(test)]
mod tests;
