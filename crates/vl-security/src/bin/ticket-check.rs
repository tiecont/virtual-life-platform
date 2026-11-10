use std::{collections::BTreeMap, fs};

use jsonwebtoken::DecodingKey;
use serde::Deserialize;
use vl_security::{PolicySnapshot, RuntimeScope, TicketVerifier, TrustDomain, TrustError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    now: u64,
    public_keys: BTreeMap<String, String>,
    ticket: String,
    rotation_ticket: String,
    negative_tokens: BTreeMap<String, String>,
    account: String,
    session: String,
    world: String,
    boot: String,
    content: String,
}

fn domain(f: &Fixture, keys: BTreeMap<String, String>) -> TrustDomain {
    let keys = keys
        .into_iter()
        .map(|(id, value)| (id, DecodingKey::from_ed_components(&value).unwrap()))
        .collect();
    let verifier = TicketVerifier::new(
        keys,
        RuntimeScope {
            world: f.world.clone(),
            boot: f.boot.clone(),
            content: f.content.clone(),
        },
    )
    .unwrap();
    TrustDomain::new(verifier, 10).unwrap()
}
fn policy(f: &Fixture, generation: u64, allowed: bool, now: u64) -> PolicySnapshot {
    PolicySnapshot {
        account: f.account.clone(),
        session: f.session.clone(),
        world: f.world.clone(),
        generation,
        observed_at: now,
        valid_until: now + 5,
        allowed,
    }
}
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("Required live Node issuer fixture path");
    let f: Fixture = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let mut trust = domain(&f, f.public_keys.clone());
    assert!(matches!(
        trust.admit(&f.ticket, f.now),
        Err(TrustError::PolicyUnavailable)
    ));
    trust
        .install_policy(policy(&f, 1, true, f.now), f.now)
        .unwrap();
    let session = trust.admit(&f.ticket, f.now).unwrap();
    let mut writes = 0;
    trust
        .with_authorized(&session, f.now, |account, sid| {
            assert_eq!(account, f.account);
            assert_eq!(sid, f.session);
            writes += 1;
        })
        .unwrap();
    assert!(matches!(
        trust.admit(&f.ticket, f.now),
        Err(TrustError::Replay)
    ));
    trust
        .install_policy(policy(&f, 2, false, f.now), f.now)
        .unwrap();
    assert!(matches!(
        trust.with_authorized(&session, f.now, |_, _| writes += 1),
        Err(TrustError::Revoked)
    ));
    assert!(matches!(
        trust.admit(&f.rotation_ticket, f.now),
        Err(TrustError::Revoked)
    ));
    assert_eq!(writes, 1);
    assert!(matches!(
        trust.install_policy(policy(&f, 1, true, f.now), f.now),
        Err(TrustError::Revoked)
    ));

    let mut expired = domain(&f, f.public_keys.clone());
    expired
        .install_policy(policy(&f, 1, true, f.now + 5), f.now + 5)
        .unwrap();
    assert!(matches!(
        expired.admit(&f.ticket, f.now + 5),
        Err(TrustError::Expired)
    ));
    let mut retired = f.public_keys.clone();
    retired.remove("key-a");
    let mut rotated = domain(&f, retired);
    rotated
        .install_policy(policy(&f, 1, true, f.now), f.now)
        .unwrap();
    assert!(matches!(
        rotated.admit(&f.ticket, f.now),
        Err(TrustError::InvalidTicket)
    ));
    assert!(rotated.admit(&f.rotation_ticket, f.now).is_ok());
    let mut forged = f.ticket.clone().into_bytes();
    let index = forged.iter().position(|b| *b == b'.').unwrap() + 10;
    forged[index] = if forged[index] == b'a' { b'b' } else { b'a' };
    let mut clean = domain(&f, f.public_keys.clone());
    clean
        .install_policy(policy(&f, 1, true, f.now), f.now)
        .unwrap();
    assert!(matches!(
        clean.admit(std::str::from_utf8(&forged).unwrap(), f.now),
        Err(TrustError::InvalidTicket)
    ));
    for (name, ticket) in &f.negative_tokens {
        assert!(
            clean.admit(ticket, f.now).is_err(),
            "Signed negative accepted: {name}"
        );
    }
    println!(
        "PASS: actual Node issuer -> Rust; signature, scope, replay, expiry, policy revocation/rollback and key retirement; in-memory authorized effects only"
    );
}
