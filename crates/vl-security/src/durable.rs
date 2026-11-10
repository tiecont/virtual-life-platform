//! Default-off SQL admission boundary. The injected PostgreSQL connection must
//! authenticate a restricted runtime role over the deployment's trusted TLS path.
//! Test binaries use only the wrapper-owned local disposable database.
use std::{future::Future, pin::Pin, sync::Arc};

use tokio_postgres::{Client, Transaction};

use crate::{Claims, TicketVerifier, TrustError};

pub struct DurableTrust {
    identity: Arc<()>,
    verifier: TicketVerifier,
}

// No Debug/Serialize/Clone: session credentials are private to this process boot.
pub struct DurableSession {
    domain: Arc<()>,
    claims: Claims,
}

pub struct AuthorizedActor<'a> {
    pub account: &'a str,
    pub session: &'a str,
    pub world: &'a str,
    pub boot: &'a str,
}

pub type Effect<'a, T> = Pin<Box<dyn Future<Output = Result<T, TrustError>> + Send + 'a>>;

fn unavailable(_: tokio_postgres::Error) -> TrustError {
    TrustError::PolicyUnavailable
}

impl DurableTrust {
    pub fn new(verifier: TicketVerifier) -> Self {
        Self {
            identity: Arc::new(()),
            verifier,
        }
    }

    async fn begin(client: &mut Client) -> Result<Transaction<'_>, TrustError> {
        let tx = client.transaction().await.map_err(unavailable)?;
        tx.batch_execute("SET LOCAL statement_timeout='2000ms'; SET LOCAL lock_timeout='1000ms'")
            .await
            .map_err(unavailable)?;
        Ok(tx)
    }

    async fn now(tx: &Transaction<'_>) -> Result<u64, TrustError> {
        let at: i64 = tx
            .query_one(
                "SELECT floor(extract(epoch FROM clock_timestamp()))::bigint",
                &[],
            )
            .await
            .map_err(unavailable)?
            .get(0);
        u64::try_from(at).map_err(|_| TrustError::PolicyUnavailable)
    }

    async fn lock(tx: &Transaction<'_>, claims: &Claims) -> Result<(), TrustError> {
        let key = format!("account:{}", claims.sub);
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            &[&key],
        )
        .await
        .map_err(unavailable)?;
        tx.query_one(
            "SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))",
            &[],
        )
        .await
        .map_err(unavailable)?;
        Ok(())
    }

    async fn policy(tx: &Transaction<'_>, claims: &Claims) -> Result<(), TrustError> {
        // Identity/sanction writers take the same canonical account lock. The
        // allocator lock serializes registration/release with every mutation.
        let row = tx
            .query_opt(
                "SELECT 1 FROM platform_native_admissions a
                 JOIN platform_native_worlds w ON w.world_id=a.world_id
                 JOIN identity_accounts i ON i.id=a.account_id
                 JOIN identity_sessions s ON s.id=a.session_id AND s.account_id=a.account_id
                 WHERE a.account_id=$1::text::uuid AND a.session_id=$2::text::uuid
                 AND a.world_id=$3 AND a.generation=$4::text::bigint AND a.allowed
                 AND a.world_generation=w.generation AND a.valid_until>clock_timestamp()
                 AND w.enabled AND w.boot_id=$5::text::uuid AND w.content_hash=$6
                 AND w.lease_until>clock_timestamp() AND i.status='active'
                 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
                 AND NOT EXISTS(SELECT 1 FROM safety_sanctions b WHERE b.subject_id=a.account_id
                     AND b.revoked_at IS NULL AND b.effective_at<=clock_timestamp()
                     AND b.expires_at>clock_timestamp()
                     AND (b.kind='platform-ban' OR (b.kind='world-ban' AND b.world_slug=a.world_id)))",
                &[
                    &claims.sub,
                    &claims.sid,
                    &claims.world,
                    &claims.generation,
                    &claims.boot,
                    &claims.content,
                ],
            )
            .await
            .map_err(unavailable)?;
        if row.is_none() {
            return Err(TrustError::Revoked);
        }
        let now = Self::now(tx).await?;
        if now < claims.nbf || now >= claims.exp {
            return Err(TrustError::Expired);
        }
        Ok(())
    }

    pub async fn admit(
        &self,
        client: &mut Client,
        ticket: &str,
    ) -> Result<DurableSession, TrustError> {
        let tx = Self::begin(client).await?;
        let claims = self.verifier.verify(ticket, Self::now(&tx).await?)?;
        Self::lock(&tx, &claims).await?;
        Self::policy(&tx, &claims).await?;
        let inserted = tx
            .execute(
                "INSERT INTO platform_native_ticket_uses(nonce,account_id,session_id,boot_id,world_id,expires_at)
                 VALUES($1,$2::text::uuid,$3::text::uuid,$4::text::uuid,$5,to_timestamp($6::bigint::double precision))
                 ON CONFLICT(nonce) DO NOTHING",
                &[
                    &claims.jti,
                    &claims.sub,
                    &claims.sid,
                    &claims.boot,
                    &claims.world,
                    &i64::try_from(claims.exp).map_err(|_| TrustError::InvalidTicket)?,
                ],
            )
            .await
            .map_err(unavailable)?;
        if inserted != 1 {
            return Err(TrustError::Replay);
        }
        Self::policy(&tx, &claims).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(DurableSession {
            domain: Arc::clone(&self.identity),
            claims,
        })
    }

    /// Trusted storage adapters only: the callback must make native SQL changes
    /// on this borrowed transaction, with no external effects or detached work.
    /// Locks span both checks and commit. Authorization cannot escape as a raw
    /// client; a post-check failure rolls back every callback write.
    pub async fn command<T: Send>(
        &self,
        client: &mut Client,
        session: &DurableSession,
        effect: impl for<'a> FnOnce(&'a Transaction<'_>, AuthorizedActor<'a>) -> Effect<'a, T>,
    ) -> Result<T, TrustError> {
        if !Arc::ptr_eq(&self.identity, &session.domain) {
            return Err(TrustError::Replay);
        }
        let claims = &session.claims;
        let tx = Self::begin(client).await?;
        Self::lock(&tx, claims).await?;
        Self::policy(&tx, claims).await?;
        let used = tx
            .query_opt(
                "SELECT 1 FROM platform_native_ticket_uses WHERE nonce=$1
                 AND account_id=$2::text::uuid AND session_id=$3::text::uuid
                 AND boot_id=$4::text::uuid AND world_id=$5 AND expires_at>clock_timestamp()",
                &[
                    &claims.jti,
                    &claims.sub,
                    &claims.sid,
                    &claims.boot,
                    &claims.world,
                ],
            )
            .await
            .map_err(unavailable)?;
        if used.is_none() {
            return Err(TrustError::Replay);
        }
        let actor = AuthorizedActor {
            account: &claims.sub,
            session: &claims.sid,
            world: &claims.world,
            boot: &claims.boot,
        };
        let value = tokio::time::timeout(std::time::Duration::from_secs(2), effect(&tx, actor))
            .await
            .map_err(|_| TrustError::PolicyUnavailable)??;
        Self::policy(&tx, claims).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(value)
    }
}
