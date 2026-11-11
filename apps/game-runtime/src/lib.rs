pub mod features;
use axum::{Router, http::StatusCode, routing::get};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Debug, PartialEq, Eq)]
pub struct Config {
    pub bind: SocketAddr,
}

impl Config {
    pub fn parse(bind: Option<&str>, gameplay: Option<&str>) -> Result<Self, &'static str> {
        if !matches!(gameplay, None | Some("0")) {
            return Err("Gameplay activation is unavailable in the foundation runtime");
        }
        Ok(Self {
            bind: bind
                .unwrap_or("127.0.0.1:4400")
                .parse()
                .map_err(|_| "Invalid runtime bind address")?,
        })
    }
}

pub fn router() -> Router {
    Router::new()
        .route(
            "/health/live",
            get(|| async {
                (
                    [("content-type", "application/json")],
                    r#"{"status":"live","service":"vl-game-runtime","gameplayEnabled":false}"#,
                )
            }),
        )
        .route(
            "/health/ready",
            get(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    [("content-type", "application/json")],
                    r#"{"status":"not_ready","reason":"GAMEPLAY_NOT_IMPLEMENTED","gameplayEnabled":false}"#,
                )
            }),
        )
}

pub async fn probe(bind: SocketAddr) -> Result<(), &'static str> {
    let ip = match bind.ip() {
        IpAddr::V4(ip) if ip.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(ip) if ip.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        ip => ip,
    };
    let check = async {
        let mut stream = tokio::net::TcpStream::connect(SocketAddr::new(ip, bind.port())).await?;
        stream
            .write_all(b"GET /health/live HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await?;
        let mut response = Vec::new();
        stream.take(4096).read_to_end(&mut response).await?;
        Ok::<_, std::io::Error>(response.starts_with(b"HTTP/1.1 200 "))
    };
    match tokio::time::timeout(Duration::from_secs(2), check).await {
        Ok(Ok(true)) => Ok(()),
        _ => Err("Runtime liveness probe failed"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    #[test]
    fn default_is_loopback_and_gameplay_cannot_be_enabled() {
        assert_eq!(
            Config::parse(None, None).unwrap().bind.to_string(),
            "127.0.0.1:4400"
        );
        for value in ["1", "true", "", "false"] {
            assert!(Config::parse(None, Some(value)).is_err());
        }
        assert!(Config::parse(Some("not-an-address"), None).is_err());
    }

    #[tokio::test]
    async fn liveness_does_not_claim_readiness_or_expose_game_routes() {
        for (path, method, expected) in [
            ("/health/live", "GET", StatusCode::OK),
            ("/health/ready", "GET", StatusCode::SERVICE_UNAVAILABLE),
            ("/rt/v1", "GET", StatusCode::NOT_FOUND),
            ("/health/live", "POST", StatusCode::METHOD_NOT_ALLOWED),
        ] {
            let response = router()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .method(method)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if path.starts_with("/health/") && method == "GET" {
                let body = axum::body::to_bytes(response.into_body(), 4096)
                    .await
                    .unwrap();
                assert!(
                    std::str::from_utf8(&body)
                        .unwrap()
                        .contains(r#""gameplayEnabled":false"#)
                );
            }
        }
    }

    #[tokio::test]
    async fn real_tcp_probe_and_shutdown() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            axum::serve(listener, router())
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
                .unwrap();
        });
        probe(address).await.unwrap();
        stop.send(()).unwrap();
        server.await.unwrap();
        assert!(probe(address).await.is_err());
    }
}
