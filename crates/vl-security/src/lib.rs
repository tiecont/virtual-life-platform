//! Default-off trust primitives. No network service or durable mutation adapter.
use std::collections::BTreeMap;
use std::sync::Arc;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;

pub const ISSUER: &str = "vl-platform-v1";
pub const AUDIENCE: &str = "vl-native-runtime-v1";
pub const MAX_TICKET_BYTES: usize = 4096;
pub const MAX_TTL_SECONDS: u64 = 30;

#[derive(Debug, PartialEq, Eq)]
pub enum TrustError {
    InvalidTicket,
    ScopeMismatch,
    Expired,
    PolicyUnavailable,
    Revoked,
    Replay,
    Capacity,
}

// Deliberately not Debug/Serialize: signed credentials and identity are not logs.
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Claims {
    v: u32,
    iss: String,
    aud: String,
    sub: String,
    sid: String,
    jti: String,
    iat: u64,
    nbf: u64,
    exp: u64,
    world: String,
    boot: String,
    content: String,
    protocol: u32,
    scope: String,
    generation: String,
}

pub struct RuntimeScope {
    pub world: String,
    pub boot: String,
    pub content: String,
}

pub struct TicketVerifier {
    keys: BTreeMap<String, TrustedKey>,
    scope: RuntimeScope,
}

struct TrustedKey {
    jwt: DecodingKey,
    strict: VerifyingKey,
}

fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
}
fn generation(value: &str) -> Option<u64> {
    let parsed = value.parse::<u64>().ok()?;
    (parsed > 0 && parsed.to_string() == value).then_some(parsed)
}

fn world(value: &str) -> bool {
    let Some(id) = value.strip_prefix("native:") else {
        return false;
    };
    !id.is_empty()
        && id.len() <= 64
        && (id.as_bytes()[0].is_ascii_lowercase() || id.as_bytes()[0].is_ascii_digit())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
}

impl TicketVerifier {
    /// Keys come from trusted configuration; token-supplied URLs/JWKs are ignored.
    pub fn new(
        keys: BTreeMap<String, DecodingKey>,
        scope: RuntimeScope,
    ) -> Result<Self, TrustError> {
        if keys.is_empty()
            || keys.len() > 8
            || !uuid(&scope.boot)
            || !hex(&scope.content, 64)
            || !world(&scope.world)
        {
            return Err(TrustError::ScopeMismatch);
        }
        let keys = keys
            .into_iter()
            .map(|(id, jwt)| {
                if jwt.family() != jsonwebtoken::AlgorithmFamily::Ed {
                    return Err(TrustError::InvalidTicket);
                }
                let bytes: &[u8; 32] = jwt
                    .try_get_as_bytes()
                    .map_err(|_| TrustError::InvalidTicket)?
                    .try_into()
                    .map_err(|_| TrustError::ScopeMismatch)?;
                let strict =
                    VerifyingKey::from_bytes(bytes).map_err(|_| TrustError::InvalidTicket)?;
                if strict.is_weak() {
                    return Err(TrustError::InvalidTicket);
                }
                Ok((id, TrustedKey { jwt, strict }))
            })
            .collect::<Result<BTreeMap<_, _>, TrustError>>()?;
        Ok(Self { keys, scope })
    }

    fn verify(&self, ticket: &str, now: u64) -> Result<Claims, TrustError> {
        if ticket.len() > MAX_TICKET_BYTES || !ticket.is_ascii() {
            return Err(TrustError::InvalidTicket);
        }
        let header = decode_header(ticket).map_err(|_| TrustError::InvalidTicket)?;
        if header.alg != Algorithm::EdDSA
            || header.typ.as_deref() != Some("vl-runtime-ticket+jwt")
            || header.crit.is_some()
            || header.jku.is_some()
            || header.jwk.is_some()
            || header.x5u.is_some()
            || header.x5c.is_some()
            || header.enc.is_some()
            || header.zip.is_some()
        {
            return Err(TrustError::InvalidTicket);
        }
        let key = self
            .keys
            .get(header.kid.as_deref().ok_or(TrustError::InvalidTicket)?)
            .ok_or(TrustError::InvalidTicket)?;
        let (signed, signature) = ticket.rsplit_once('.').ok_or(TrustError::InvalidTicket)?;
        let signature = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| TrustError::InvalidTicket)?;
        let signature = Signature::from_slice(&signature).map_err(|_| TrustError::InvalidTicket)?;
        key.strict
            .verify_strict(signed.as_bytes(), &signature)
            .map_err(|_| TrustError::InvalidTicket)?;
        let mut validation = Validation::new(Algorithm::EdDSA);
        validation.set_issuer(&[ISSUER]);
        validation.set_audience(&[AUDIENCE]);
        validation.set_required_spec_claims(&["exp", "nbf", "sub", "iss", "aud"]);
        // The trusted caller supplies one transaction-bound clock, checked below.
        validation.validate_exp = false;
        validation.validate_nbf = false;
        validation.leeway = 0;
        let claims = decode::<Claims>(ticket, &key.jwt, &validation)
            .map_err(|_| TrustError::InvalidTicket)?
            .claims;
        if claims.v != 1
            || claims.iss != ISSUER
            || claims.aud != AUDIENCE
            || !uuid(&claims.sub)
            || !uuid(&claims.sid)
            || !hex(&claims.jti, 32)
            || generation(&claims.generation).is_none()
            || claims.nbf != claims.iat
            || claims.exp <= claims.iat
            || claims.exp - claims.iat > MAX_TTL_SECONDS
        {
            return Err(TrustError::InvalidTicket);
        }
        if now < claims.nbf || now >= claims.exp {
            return Err(TrustError::Expired);
        }
        if claims.world != self.scope.world
            || claims.boot != self.scope.boot
            || claims.content != self.scope.content
            || claims.protocol != 1
            || claims.scope != "world.connect game.command"
        {
            return Err(TrustError::ScopeMismatch);
        }
        Ok(claims)
    }
}

/// A trusted control-plane snapshot, never accepted from public wire claims.
pub struct PolicySnapshot {
    pub account: String,
    pub session: String,
    pub world: String,
    pub generation: u64,
    pub observed_at: u64,
    pub valid_until: u64,
    pub allowed: bool,
}

/// Single-owner bounded model only. New boot IDs prevent replay across restart.
/// Persistence/cross-process fencing and authenticated policy delivery are later gates.
pub struct TrustDomain {
    identity: Arc<()>,
    verifier: TicketVerifier,
    policies: BTreeMap<(String, String), PolicySnapshot>,
    nonces: BTreeMap<String, u64>,
    capacity: usize,
    last_now: u64,
}

pub struct VerifiedSession {
    domain: Arc<()>,
    claims: Claims,
}

impl TrustDomain {
    pub fn new(verifier: TicketVerifier, capacity: usize) -> Result<Self, TrustError> {
        if capacity == 0 || capacity > 100_000 {
            return Err(TrustError::Capacity);
        }
        Ok(Self {
            identity: Arc::new(()),
            verifier,
            policies: BTreeMap::new(),
            nonces: BTreeMap::new(),
            capacity,
            last_now: 0,
        })
    }

    fn clock(&mut self, now: u64) -> Result<(), TrustError> {
        if now < self.last_now {
            return Err(TrustError::PolicyUnavailable);
        }
        self.last_now = now;
        Ok(())
    }

    pub fn install_policy(&mut self, policy: PolicySnapshot, now: u64) -> Result<(), TrustError> {
        self.clock(now)?;
        if !uuid(&policy.account)
            || !uuid(&policy.session)
            || policy.world != self.verifier.scope.world
            || policy.generation == 0
            || policy.observed_at > now
            || policy.valid_until <= now
            || policy.valid_until.saturating_sub(policy.observed_at) > 5
        {
            return Err(TrustError::PolicyUnavailable);
        }
        let key = (policy.account.clone(), policy.session.clone());
        if let Some(old) = self.policies.get(&key) {
            if policy.generation < old.generation
                || policy.observed_at < old.observed_at
                || (policy.generation == old.generation && policy.allowed != old.allowed)
            {
                return Err(TrustError::Revoked);
            }
        } else if self.policies.len() >= self.capacity {
            return Err(TrustError::Capacity);
        }
        self.policies.insert(key, policy);
        Ok(())
    }

    fn policy(&self, claims: &Claims, now: u64) -> Result<(), TrustError> {
        let current = self
            .policies
            .get(&(claims.sub.clone(), claims.sid.clone()))
            .ok_or(TrustError::PolicyUnavailable)?;
        if now < current.observed_at || now >= current.valid_until {
            return Err(TrustError::PolicyUnavailable);
        }
        if !current.allowed || generation(&claims.generation) != Some(current.generation) {
            return Err(TrustError::Revoked);
        }
        Ok(())
    }

    pub fn admit(&mut self, ticket: &str, now: u64) -> Result<VerifiedSession, TrustError> {
        self.clock(now)?;
        let claims = self.verifier.verify(ticket, now)?;
        self.policy(&claims, now)?;
        self.nonces.retain(|_, expiry| *expiry > now);
        if self.nonces.contains_key(&claims.jti) {
            return Err(TrustError::Replay);
        }
        if self.nonces.len() >= self.capacity {
            return Err(TrustError::Capacity);
        }
        self.nonces.insert(claims.jti.clone(), claims.exp);
        Ok(VerifiedSession {
            claims,
            domain: Arc::clone(&self.identity),
        })
    }

    /// Run a synchronous in-memory effect only after a fresh check. Durable SQL
    /// must later recheck policy under its own transaction lock, not use this callback.
    ///
    /// ```compile_fail
    /// use vl_security::{TrustDomain, VerifiedSession};
    /// fn deferred(trust: &mut TrustDomain, session: &VerifiedSession) {
    ///     let _ = trust.with_authorized(session, 100, |_, _| async {});
    /// }
    /// ```
    pub fn with_authorized(
        &mut self,
        session: &VerifiedSession,
        now: u64,
        effect: impl FnOnce(&str, &str),
    ) -> Result<(), TrustError> {
        self.clock(now)?;
        if !Arc::ptr_eq(&session.domain, &self.identity) {
            return Err(TrustError::Replay);
        }
        let claims = &session.claims;
        if claims.boot != self.verifier.scope.boot
            || claims.world != self.verifier.scope.world
            || claims.content != self.verifier.scope.content
            || now < claims.nbf
            || now >= claims.exp
        {
            return Err(TrustError::Expired);
        }
        if self.nonces.get(&claims.jti) != Some(&claims.exp) {
            return Err(TrustError::Replay);
        }
        self.policy(claims, now)?;
        effect(&claims.sub, &claims.sid);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scope() -> RuntimeScope {
        RuntimeScope {
            world: "native:training".into(),
            boot: "11111111-1111-4111-8111-111111111111".into(),
            content: "ab".repeat(32),
        }
    }
    fn trust() -> TrustDomain {
        let public = ed25519_dalek::SigningKey::from_bytes(&[7; 32])
            .verifying_key()
            .to_bytes();
        let keys = BTreeMap::from([("key-a".into(), DecodingKey::from_ed_der(&public))]);
        TrustDomain::new(TicketVerifier::new(keys, scope()).unwrap(), 2).unwrap()
    }
    fn policy(generation: u64, allowed: bool) -> PolicySnapshot {
        PolicySnapshot {
            account: "22222222-2222-4222-8222-222222222222".into(),
            session: "33333333-3333-4333-8333-333333333333".into(),
            world: "native:training".into(),
            generation,
            observed_at: 100,
            valid_until: 105,
            allowed,
        }
    }
    fn session(trust: &TrustDomain) -> VerifiedSession {
        VerifiedSession {
            domain: Arc::clone(&trust.identity),
            claims: Claims {
                v: 1,
                iss: ISSUER.into(),
                aud: AUDIENCE.into(),
                sub: policy(1, true).account,
                sid: policy(1, true).session,
                jti: "ab".repeat(16),
                iat: 100,
                nbf: 100,
                exp: 130,
                world: "native:training".into(),
                boot: scope().boot,
                content: scope().content,
                protocol: 1,
                scope: "world.connect game.command".into(),
                generation: "1".into(),
            },
        }
    }
    #[test]
    fn malformed_config_and_oversized_tokens_fail_without_panicking() {
        for size in [0, 1, 31, 33] {
            let keys = BTreeMap::from([("a".into(), DecodingKey::from_ed_der(&vec![1; size]))]);
            assert!(matches!(
                TicketVerifier::new(keys, scope()),
                Err(TrustError::ScopeMismatch)
            ));
        }
        let mut trust = trust();
        assert!(matches!(
            trust.admit(&"x".repeat(MAX_TICKET_BYTES + 1), 100),
            Err(TrustError::InvalidTicket)
        ));
        assert!(matches!(
            trust.admit("nt1.android-ticket", 100),
            Err(TrustError::InvalidTicket)
        ));
        assert!(matches!(
            trust.admit("a.b.c", 100),
            Err(TrustError::InvalidTicket)
        ));
    }
    #[test]
    fn policy_is_scoped_monotonic_bounded_and_fresh() {
        let mut trust = trust();
        let mut wrong = policy(1, true);
        wrong.world = "native:other".into();
        assert_eq!(
            trust.install_policy(wrong, 100),
            Err(TrustError::PolicyUnavailable)
        );
        let mut stale = policy(1, true);
        stale.valid_until = 200;
        assert_eq!(
            trust.install_policy(stale, 100),
            Err(TrustError::PolicyUnavailable)
        );
        trust.install_policy(policy(2, false), 100).unwrap();
        assert_eq!(
            trust.install_policy(policy(1, true), 100),
            Err(TrustError::Revoked)
        );
        assert_eq!(
            trust.install_policy(policy(2, true), 100),
            Err(TrustError::Revoked)
        );
        assert_eq!(
            trust.install_policy(policy(3, true), 99),
            Err(TrustError::PolicyUnavailable)
        );
    }
    #[test]
    fn effects_recheck_revocation_and_expiry_at_boundary() {
        let mut trust = trust();
        let session = session(&trust);
        let mut writes = 0;
        trust
            .nonces
            .insert(session.claims.jti.clone(), session.claims.exp);
        assert_eq!(
            trust.with_authorized(&session, 100, |_, _| writes += 1),
            Err(TrustError::PolicyUnavailable)
        );
        trust.install_policy(policy(1, true), 100).unwrap();
        trust
            .with_authorized(&session, 100, |_, _| writes += 1)
            .unwrap();
        assert_eq!(
            trust.with_authorized(&session, 105, |_, _| writes += 1),
            Err(TrustError::PolicyUnavailable)
        );
        let mut revoked = policy(2, false);
        revoked.observed_at = 105;
        revoked.valid_until = 110;
        trust.install_policy(revoked, 105).unwrap();
        assert_eq!(
            trust.with_authorized(&session, 105, |_, _| writes += 1),
            Err(TrustError::Revoked)
        );
        assert_eq!(
            trust.with_authorized(&session, 130, |_, _| writes += 1),
            Err(TrustError::Expired)
        );
        assert_eq!(writes, 1);
    }
    #[test]
    fn unadmitted_session_cannot_execute_effect() {
        let mut trust = trust();
        trust.install_policy(policy(1, true), 100).unwrap();
        let mut writes = 0;
        assert_eq!(
            trust.with_authorized(&session(&trust), 100, |_, _| writes += 1),
            Err(TrustError::Replay)
        );
        assert_eq!(writes, 0);
    }
    #[test]
    fn rejects_weak_public_keys_and_cross_domain_sessions() {
        for weak in [[0; 32], {
            let mut identity = [0; 32];
            identity[0] = 1;
            identity
        }] {
            let keys = BTreeMap::from([("a".into(), DecodingKey::from_ed_der(&weak))]);
            assert!(TicketVerifier::new(keys, scope()).is_err());
        }
        let first = trust();
        let foreign = session(&first);
        let mut second = trust();
        second.install_policy(policy(1, true), 100).unwrap();
        second
            .nonces
            .insert(foreign.claims.jti.clone(), foreign.claims.exp);
        let mut writes = 0;
        assert_eq!(
            second.with_authorized(&foreign, 100, |_, _| writes += 1),
            Err(TrustError::Replay)
        );
        assert_eq!(writes, 0);
    }
}
