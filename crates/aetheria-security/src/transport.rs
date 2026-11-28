//! Explicit-CA PostgreSQL transport for a separately provisioned runtime role.
//! This helper does not provision credentials, grant privileges or activate routes.
use native_tls::{Certificate, Protocol, TlsConnector};
use postgres_native_tls::MakeTlsConnector;
use tokio::task::JoinHandle;
use tokio_postgres::{Client, Config, Error, config::ChannelBinding, config::SslMode};

use crate::TrustError;

pub type RuntimeConnection = (Client, JoinHandle<Result<(), Error>>);

pub async fn connect_runtime_postgres(
    config: &Config,
    ca_pem: &[u8],
    expected_role: &str,
) -> Result<RuntimeConnection, TrustError> {
    if ca_pem.is_empty()
        || ca_pem.len() > 65536
        || expected_role.is_empty()
        || expected_role.len() > 63
        || !expected_role.starts_with(|c: char| c.is_ascii_lowercase())
        || !expected_role
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
        || config.get_user() != Some(expected_role)
    {
        return Err(TrustError::PolicyUnavailable);
    }
    let tls = TlsConnector::builder()
        .disable_built_in_roots(true)
        .min_protocol_version(Some(Protocol::Tlsv12))
        .add_root_certificate(
            Certificate::from_pem(ca_pem).map_err(|_| TrustError::PolicyUnavailable)?,
        )
        .build()
        .map_err(|_| TrustError::PolicyUnavailable)?;
    let mut required = config.clone();
    required
        .ssl_mode(SslMode::Require)
        .channel_binding(ChannelBinding::Require)
        .connect_timeout(std::time::Duration::from_secs(3));
    let (client, connection) = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        required.connect(MakeTlsConnector::new(tls)),
    )
    .await
    .map_err(|_| TrustError::PolicyUnavailable)?
    .map_err(|_| TrustError::PolicyUnavailable)?;
    let task = tokio::spawn(connection);
    let valid = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        client.query_opt(
            "SELECT 1 FROM pg_roles r JOIN pg_stat_ssl s ON s.pid=pg_backend_pid()
             WHERE r.rolname=$1 AND r.rolname=current_user AND current_user=session_user
             AND s.ssl AND s.version IN ('TLSv1.2','TLSv1.3')
             AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit
                      OR r.rolreplication OR r.rolbypassrls)
             AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
             AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid)
             AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
             AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba=r.oid)",
            &[&expected_role],
        ),
    )
    .await;
    if !matches!(valid, Ok(Ok(Some(_)))) {
        task.abort();
        return Err(TrustError::PolicyUnavailable);
    }
    Ok((client, task))
}
