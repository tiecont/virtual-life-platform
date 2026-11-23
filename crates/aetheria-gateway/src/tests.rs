use super::*;
use axum::{body::Body, http::Request};
use futures_util::{SinkExt, StreamExt};
use std::{
    collections::BTreeSet,
    sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
};
use tokio::{net::TcpStream, sync::oneshot, task::JoinHandle};
use tokio_tungstenite::{
    WebSocketStream,
    tungstenite::{self, client::IntoClientRequest},
};
use tower::ServiceExt;

// Transport fixtures only: these are not JWT, PostgreSQL, TLS or browser proof.
#[derive(Default)]
struct Fixture {
    revoked: AtomicBool,
    admissions: AtomicUsize,
    snapshots: AtomicU64,
    used: Mutex<BTreeSet<String>>,
}
struct FixtureSession {
    fixture: Arc<Fixture>,
    principal: &'static str,
}
struct FixtureAdmission(Arc<Fixture>);
impl Admission for FixtureAdmission {
    fn admit<'a>(&'a self, ticket: &'a str) -> Task<'a, Box<dyn Session>> {
        Box::pin(async move {
            self.0.admissions.fetch_add(1, Ordering::SeqCst);
            if !matches!(ticket, "first" | "refresh" | "other-account")
                || !self.0.used.lock().unwrap().insert(ticket.into())
            {
                return Err(Fault::Unauthenticated);
            }
            Ok(Box::new(FixtureSession {
                fixture: Arc::clone(&self.0),
                principal: if ticket == "other-account" {
                    "other"
                } else {
                    "same"
                },
            }) as Box<dyn Session>)
        })
    }
}
impl Session for FixtureSession {
    fn principal(&self) -> &str {
        self.principal
    }
    fn authorize(&mut self) -> Task<'_, ()> {
        Box::pin(async {
            if self.fixture.revoked.load(Ordering::SeqCst) {
                Err(Fault::Revoked)
            } else {
                Ok(())
            }
        })
    }
    fn snapshot(&mut self) -> Task<'_, public::WorldSnapshot> {
        Box::pin(async {
            Ok(public::WorldSnapshot {
                authority_epoch: 1,
                tick: 9_007_199_254_740_993 + self.fixture.snapshots.fetch_add(1, Ordering::SeqCst),
                own_actor: Some(public::OwnActor {
                    x_mm: 123,
                    z_mm: -456,
                    last_input_sequence: 0,
                }),
            })
        })
    }
}
fn options() -> Options {
    Options {
        enabled: true,
        origins: vec!["https://gateway.test".into()],
        content_hash: [0x22; 32],
        runtime_boot_id: [0x33; 16],
        connections: 2,
    }
}
struct Server {
    address: String,
    fixture: Arc<Fixture>,
    stop: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl Server {
    async fn open() -> Self {
        let fixture = Arc::new(Fixture::default());
        let router = router(options(), Arc::new(FixtureAdmission(Arc::clone(&fixture)))).unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("ws://{}/rt/v1", listener.local_addr().unwrap());
        let (stop, stopped) = oneshot::channel();
        let task = tokio::spawn(async {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
                .unwrap();
        });
        Self {
            address,
            fixture,
            stop: Some(stop),
            task,
        }
    }
    async fn close(mut self) {
        self.stop.take().unwrap().send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(2), &mut self.task)
            .await
            .unwrap()
            .unwrap();
    }
    async fn client(&self) -> WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>> {
        tokio_tungstenite::connect_async(request(&self.address, "https://gateway.test"))
            .await
            .unwrap()
            .0
    }
}
fn request(url: &str, origin: &str) -> tungstenite::http::Request<()> {
    let mut request = url.into_client_request().unwrap();
    request
        .headers_mut()
        .insert("Origin", origin.parse().unwrap());
    request
        .headers_mut()
        .insert("Sec-WebSocket-Protocol", SUBPROTOCOL.parse().unwrap());
    request
}
fn frame(id: u8, sequence: u64, body: client_envelope::Body) -> Vec<u8> {
    public::ClientEnvelope {
        protocol_version: 1,
        command_id: vec![id; 16],
        sequence,
        body: Some(body),
    }
    .encode_to_vec()
}
fn hello(ticket: &str, id: u8, sequence: u64) -> Vec<u8> {
    frame(
        id,
        sequence,
        client_envelope::Body::Hello(public::Hello {
            ticket: ticket.into(),
            client_build: "transport-fixture-v1".into(),
            content_hash: vec![0x22; 32],
            platform_label: None,
        }),
    )
}
fn resync(id: u8, sequence: u64) -> Vec<u8> {
    frame(
        id,
        sequence,
        client_envelope::Body::Resync(public::Resync {
            last_seen_epoch: 999,
            last_seen_tick: u64::MAX,
        }),
    )
}
type Client = WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;
async fn exchange(client: &mut Client, bytes: Vec<u8>) -> Vec<u8> {
    client
        .send(tungstenite::Message::Binary(bytes.into()))
        .await
        .unwrap();
    match tokio::time::timeout(Duration::from_secs(2), client.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
    {
        tungstenite::Message::Binary(bytes) => bytes.to_vec(),
        _ => panic!("Expected binary reply"),
    }
}
async fn closed_without_data(client: &mut Client) {
    let message = tokio::time::timeout(Duration::from_secs(5), client.next())
        .await
        .unwrap();
    assert!(matches!(
        message,
        None | Some(Err(_)) | Some(Ok(tungstenite::Message::Close(_)))
    ));
}
fn rejected(bytes: &[u8], expected: public::ErrorCode) {
    let response = public::ServerEnvelope::decode(bytes).unwrap();
    let Some(server_envelope::Body::Rejection(rejection)) = response.body else {
        panic!("Expected rejection")
    };
    assert_eq!(rejection.code, expected as i32);
}

#[tokio::test]
async fn route_is_absent_by_default_and_enabled_origin_scope_is_explicit() {
    let fixture = Arc::new(Fixture::default());
    let response = router(
        Options::default(),
        Arc::new(FixtureAdmission(Arc::clone(&fixture))),
    )
    .unwrap()
    .oneshot(
        Request::builder()
            .uri("/rt/v1")
            .body(Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    for origin in [
        "http://gateway.test",
        "https://gateway.test/",
        "https://user@gateway.test",
        "https://gateway.test/path",
        "https://gateway.test?ticket=x",
    ] {
        let mut config = options();
        config.origins = vec![origin.into()];
        assert!(router(config, Arc::new(FixtureAdmission(Arc::clone(&fixture)))).is_err());
    }
    assert_eq!(fixture.admissions.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn real_tcp_resync_retries_collisions_and_sequence_cannot_commit_game_effects() {
    let server = Server::open().await;
    let mut client = server.client().await;
    let welcome = exchange(&mut client, hello("first", 1, 1)).await;
    let welcome = public::ServerEnvelope::decode(welcome.as_slice()).unwrap();
    assert_eq!(welcome.canonical_version, 9_007_199_254_740_993);
    let Some(server_envelope::Body::Hello(hello)) = welcome.body else {
        panic!("Expected hello")
    };
    assert_eq!(hello.runtime_boot_id, [0x33; 16]);
    let request = resync(2, 2);
    let answer = exchange(&mut client, request.clone()).await;
    assert_eq!(answer, exchange(&mut client, request).await);
    assert_eq!(server.fixture.snapshots.load(Ordering::SeqCst), 2);
    let value = public::ServerEnvelope::decode(answer.as_slice()).unwrap();
    let Some(server_envelope::Body::Snapshot(snapshot)) = value.body else {
        panic!("Expected snapshot")
    };
    assert_eq!(snapshot.authority_epoch, 1); // Forged client epoch/tick cannot restore state.
    assert_eq!(snapshot.own_actor.unwrap().x_mm, 123);
    rejected(
        &exchange(&mut client, resync(2, 3)).await,
        public::ErrorCode::CommandIdCollision,
    );
    rejected(
        &exchange(&mut client, resync(4, 4)).await,
        public::ErrorCode::StaleVersion,
    );
    let movement = frame(
        3,
        3,
        client_envelope::Body::MoveIntent(public::MoveIntent {
            input_sequence: 1,
            direction_x: 1000,
            direction_z: 0,
            ..Default::default()
        }),
    );
    rejected(
        &exchange(&mut client, movement).await,
        public::ErrorCode::TemporarilyUnavailable,
    );
    let game = frame(
        4,
        4,
        client_envelope::Body::GameIntent(public::GameIntent {
            game_session_id: vec![1; 16],
            expected_state_version: 1,
            kind: "fixture.play".into(),
            action_payload: vec![],
        }),
    );
    rejected(
        &exchange(&mut client, game).await,
        public::ErrorCode::TemporarilyUnavailable,
    );
    client.close(None).await.unwrap();
    drop(client);
    server.close().await;
}

#[tokio::test]
async fn cached_private_replies_are_reauthorized_and_replayed_nonce_cannot_join_again() {
    let server = Server::open().await;
    let mut client = server.client().await;
    exchange(&mut client, hello("first", 1, 1)).await;
    let cached = resync(2, 2);
    exchange(&mut client, cached.clone()).await;
    let mut replay = server.client().await;
    replay
        .send(tungstenite::Message::Binary(hello("first", 1, 1).into()))
        .await
        .unwrap();
    closed_without_data(&mut replay).await;
    server.fixture.revoked.store(true, Ordering::SeqCst);
    let _ = client
        .send(tungstenite::Message::Binary(cached.into()))
        .await;
    closed_without_data(&mut client).await;
    drop(client);
    drop(replay);
    server.close().await;
}

#[tokio::test]
async fn origin_query_header_and_oversize_fail_before_admission() {
    let server = Server::open().await;
    let mut cases = vec![
        request(&server.address, "https://evil.test"),
        request(
            &(server.address.clone() + "?ticket=secret"),
            "https://gateway.test",
        ),
    ];
    let mut auth = request(&server.address, "https://gateway.test");
    auth.headers_mut()
        .insert("Authorization", "Bearer secret".parse().unwrap());
    cases.push(auth);
    let mut protocol = request(&server.address, "https://gateway.test");
    protocol.headers_mut().remove("Sec-WebSocket-Protocol");
    cases.push(protocol);
    for request in cases {
        let Err(tungstenite::Error::Http(response)) =
            tokio_tungstenite::connect_async(request).await
        else {
            panic!("Expected denied HTTP handshake")
        };
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let mut client = server.client().await;
    client
        .send(tungstenite::Message::Binary(
            vec![0; MAX_FRAME_BYTES + 1].into(),
        ))
        .await
        .unwrap();
    closed_without_data(&mut client).await;
    assert_eq!(server.fixture.admissions.load(Ordering::SeqCst), 0);
    drop(client);
    server.close().await;
}

#[tokio::test]
async fn same_principal_may_rotate_ticket_but_connection_cannot_change_account() {
    let server = Server::open().await;
    let mut client = server.client().await;
    exchange(&mut client, hello("first", 1, 1)).await;
    exchange(&mut client, hello("refresh", 2, 2)).await;
    client
        .send(tungstenite::Message::Binary(
            hello("other-account", 3, 3).into(),
        ))
        .await
        .unwrap();
    closed_without_data(&mut client).await;
    assert_eq!(server.fixture.admissions.load(Ordering::SeqCst), 3);
    drop(client);
    server.close().await;
}

#[tokio::test]
async fn connection_capacity_is_reserved_before_authentication() {
    let server = Server::open().await;
    let mut first = server.client().await;
    let mut second = server.client().await;
    let Err(tungstenite::Error::Http(response)) =
        tokio_tungstenite::connect_async(request(&server.address, "https://gateway.test")).await
    else {
        panic!("Expected capacity denial")
    };
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(server.fixture.admissions.load(Ordering::SeqCst), 0);
    first.close(None).await.unwrap();
    second.close(None).await.unwrap();
    drop(first);
    drop(second);
    server.close().await;
}

#[test]
fn old_retries_never_expand_cache_or_wrap_sequence() {
    let mut cache = Replies::default();
    for sequence in 1u64..=100 {
        let request = public::ClientEnvelope {
            protocol_version: 1,
            command_id: sequence.to_le_bytes().repeat(2),
            sequence,
            body: None,
        };
        assert!(matches!(
            cache.lookup(&request.command_id, sequence, &[1; 32]),
            Lookup::Fresh
        ));
        cache.remember(&request, [1; 32], vec![sequence as u8]);
    }
    assert_eq!(cache.entries.len(), CACHE_LIMIT);
    assert!(matches!(
        cache.lookup(&1u64.to_le_bytes().repeat(2), 1, &[1; 32]),
        Lookup::Reject(public::ErrorCode::StaleVersion)
    ));
    cache.last = u64::MAX;
    assert!(matches!(
        cache.lookup(&[255; 16], 0, &[1; 32]),
        Lookup::Reject(public::ErrorCode::StaleVersion)
    ));
}

#[tokio::test]
async fn unauthenticated_idle_socket_is_closed_and_traffic_budget_is_bounded() {
    let server = Server::open().await;
    let mut idle = server.client().await;
    closed_without_data(&mut idle).await;
    let mut flood = server.client().await;
    exchange(&mut flood, hello("first", 1, 1)).await;
    // Sending repeated authenticated commands cannot expand the replay cache
    // or cause an unbounded number of policy/snapshot calls.
    let bytes = resync(2, 2);
    for _ in 0..100 {
        let _ = flood
            .send(tungstenite::Message::Binary(bytes.clone().into()))
            .await;
    }
    let mut received = 0;
    loop {
        match tokio::time::timeout(Duration::from_secs(2), flood.next())
            .await
            .unwrap()
        {
            Some(Ok(tungstenite::Message::Binary(_))) => received += 1,
            None | Some(Err(_)) | Some(Ok(tungstenite::Message::Close(_))) => break,
            _ => {}
        }
    }
    assert!(received <= 32);
    assert_eq!(server.fixture.snapshots.load(Ordering::SeqCst), 2);
    drop(idle);
    drop(flood);
    server.close().await;
}
