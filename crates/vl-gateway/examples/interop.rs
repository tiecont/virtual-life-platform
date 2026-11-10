//! Loopback-only disposable integration host. Not a production entrypoint.
use jsonwebtoken::DecodingKey;
use serde::Deserialize;
use std::{collections::BTreeMap, fs, sync::Arc};
use vl_gateway::{Options, durable::PgAdmission, router};
use vl_security::{RuntimeScope, TicketVerifier, durable::DurableTrust};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fixture {
    public_keys: BTreeMap<String, String>,
    world: String,
    boot: String,
    content: String,
    ca_file: String,
    expected_role: String,
    origin: String,
}
fn hex<const N: usize>(s: &str) -> [u8; N] {
    assert_eq!(s.len(), N * 2);
    std::array::from_fn(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap())
}
#[tokio::main]
async fn main() {
    let fixture: Fixture =
        serde_json::from_slice(&fs::read(std::env::args().nth(1).unwrap()).unwrap()).unwrap();
    let cfg: tokio_postgres::Config = std::env::var("TEST_DATABASE_URL").unwrap().parse().unwrap();
    assert!(
        cfg.get_dbname()
            .is_some_and(|n| n.starts_with("virtual_city_test"))
    );
    assert!(
        cfg.get_hosts()
            .iter()
            .all(|h| matches!(h, tokio_postgres::config::Host::Tcp(n) if n == "127.0.0.1"))
    );
    let (zone, actor) = vl_world::zone(16, 32).unwrap();
    let task = tokio::spawn(actor.run());
    let trust = DurableTrust::new(
        TicketVerifier::new(
            fixture
                .public_keys
                .into_iter()
                .map(|(k, v)| (k, DecodingKey::from_ed_components(&v).unwrap()))
                .collect(),
            RuntimeScope {
                world: fixture.world,
                boot: fixture.boot.clone(),
                content: fixture.content.clone(),
            },
        )
        .unwrap(),
    );
    let admission = PgAdmission::new(
        trust,
        cfg,
        fs::read(fixture.ca_file).unwrap(),
        fixture.expected_role,
        zone.clone(),
    )
    .unwrap();
    let router = router(
        Options {
            enabled: true,
            origins: vec![fixture.origin],
            content_hash: hex(&fixture.content),
            runtime_boot_id: hex(&fixture.boot.replace('-', "")),
            connections: 4,
        },
        Arc::new(admission),
    )
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    println!("LISTEN {}", listener.local_addr().unwrap().port());
    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.unwrap();
        })
        .await
        .unwrap();
    let _ = zone.stop().unwrap().await;
    task.await.unwrap().unwrap();
}
