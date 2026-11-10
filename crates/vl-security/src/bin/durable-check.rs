//! Disposable PostgreSQL verification only; never a production command endpoint.
use std::{collections::BTreeMap, fs, io::Write};

use jsonwebtoken::DecodingKey;
use serde::Deserialize;
use tokio_postgres::Client;
use vl_security::transport::connect_runtime_postgres;
use vl_security::{RuntimeScope, TicketVerifier, TrustError, durable::DurableTrust};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fixture {
    public_keys: BTreeMap<String, String>,
    ticket: String,
    world: String,
    boot: String,
    content: String,
    match_id: String,
    command_id: String,
    mode: String,
    ca_file: String,
    expected_role: String,
}

fn domain(f: &Fixture) -> DurableTrust {
    let keys = f
        .public_keys
        .iter()
        .map(|(id, value)| (id.clone(), DecodingKey::from_ed_components(value).unwrap()))
        .collect();
    DurableTrust::new(
        TicketVerifier::new(
            keys,
            RuntimeScope {
                world: f.world.clone(),
                boot: f.boot.clone(),
                content: f.content.clone(),
            },
        )
        .unwrap(),
    )
}

async fn counts(db: &Client, match_id: &str) -> (i64, i64) {
    let row = db
        .query_one(
            "SELECT state_version,(SELECT count(*) FROM game_native_receipts WHERE match_id=m.id)
             FROM game_native_matches m WHERE id=$1::text::uuid",
            &[&match_id],
        )
        .await
        .unwrap();
    (row.get(0), row.get(1))
}

#[tokio::main]
async fn main() {
    let f: Fixture = serde_json::from_slice(
        &fs::read(std::env::args().nth(1).expect("Required private fixture"))
            .expect("Fixture unavailable"),
    )
    .expect("Malformed fixture");
    assert!(
        [
            "accept",
            "deny",
            "wait",
            "rollback",
            "foreign",
            "transport-deny"
        ]
        .contains(&f.mode.as_str())
    );
    let cfg: tokio_postgres::Config = std::env::var("TEST_DATABASE_URL")
        .expect("Disposable DB required")
        .parse()
        .expect("Invalid test configuration");
    assert!(
        cfg.get_dbname()
            .is_some_and(|n| n.starts_with("virtual_city_test"))
    );
    assert!(cfg.get_hosts().iter().all(|h| matches!(h, tokio_postgres::config::Host::Tcp(n) if ["127.0.0.1", "localhost", "::1"].contains(&n.as_str()))));
    let connected = connect_runtime_postgres(
        &cfg,
        &fs::read(&f.ca_file).expect("Test CA unavailable"),
        &f.expected_role,
    )
    .await;
    if f.mode == "transport-deny" {
        assert!(connected.is_err(), "Transport must reject this fixture");
        println!("PASS: rejected untrusted transport");
        return;
    }
    let (mut db, task) = connected.expect("Authenticated test DB unavailable");
    let before = counts(&db, &f.match_id).await;
    assert_eq!(before, (0, 0));
    let trust = domain(&f);
    let admitted = trust.admit(&mut db, &f.ticket).await;
    if f.mode == "deny" {
        assert!(admitted.is_err());
        assert_eq!(counts(&db, &f.match_id).await, before);
    } else {
        let session = admitted.expect("Expected real issuer grant");
        assert!(matches!(
            trust.admit(&mut db, &f.ticket).await,
            Err(TrustError::Replay)
        ));
        // A new trust object cannot reuse the in-process verified session even
        // when all public scope/key configuration is identical.
        if f.mode == "wait" {
            println!("ADMITTED");
            std::io::stdout().flush().unwrap();
            tokio::task::spawn_blocking(|| {
                let mut line = String::new();
                std::io::stdin().read_line(&mut line).unwrap();
                assert_eq!(line.trim(), "execute");
            })
            .await
            .unwrap();
        }
        let other = domain(&f);
        let selected = if f.mode == "foreign" { &other } else { &trust };
        let match_id = f.match_id.clone();
        let command = f.command_id.clone();
        let fail = f.mode == "rollback";
        let result = selected
            .command(&mut db, &session, |tx, actor| {
                Box::pin(async move {
                    let changed = tx
                        .execute(
                            "UPDATE game_native_matches SET state_version=1
                             WHERE id=$1::text::uuid AND world_id=$2 AND owner_boot_id=$3::text::uuid
                             AND state_version=0 AND status='ACTIVE'",
                            &[&match_id, &actor.world, &actor.boot],
                        )
                        .await
                        .map_err(|_| TrustError::PolicyUnavailable)?;
                    if changed != 1 {
                        return Err(TrustError::ScopeMismatch);
                    }
                    tx.execute(
                        "INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,
                         committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt)
                         VALUES($1::text::uuid,$2::text::uuid,$3::text::uuid,decode(repeat('ab',32),'hex'),
                         1,1,decode(repeat('cd',32),'hex'),'synthetic-fixture',decode(repeat('ef',12),'hex'),
                         decode(repeat('ab',16),'hex'),decode('ab','hex'))",
                        &[&match_id, &actor.account, &command],
                    )
                    .await
                    .map_err(|_| TrustError::PolicyUnavailable)?;
                    if fail {
                        return Err(TrustError::ScopeMismatch);
                    }
                    Ok(())
                })
            })
            .await;
        if f.mode == "accept" {
            assert!(result.is_ok());
            assert_eq!(counts(&db, &f.match_id).await, (1, 1));
        } else {
            assert!(result.is_err());
            assert_eq!(counts(&db, &f.match_id).await, before);
        }
    }
    drop(db);
    task.await.unwrap().unwrap();
    println!("PASS: durable authorization probe {}", f.mode);
}
