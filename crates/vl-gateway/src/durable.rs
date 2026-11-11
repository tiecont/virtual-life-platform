//! Explicit-CA, restricted-role admission and own-only live reads. No game DML.
use crate::{Admission, Fault, GameReply, Session, Task, public};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Weak,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{sync::Mutex, task::JoinHandle};
use tokio_postgres::{Client, Config};
use vl_security::{
    durable::{DurableSession, DurableTrust},
    transport::connect_runtime_postgres,
};
use vl_world::{ActorHandle, Position, ZoneHandle};

/// Trusted runtime adapter. Player input cannot construct this capability.
pub trait GameCommands: Send + Sync {
    fn execute<'a>(
        &'a self,
        client: &'a mut Client,
        trust: &'a DurableTrust,
        session: &'a DurableSession,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
    ) -> Task<'a, GameReply>;
}

struct OwnActor {
    id: u64,
    handle: ActorHandle,
}

/// One instance per trusted native zone. Credentials/keys stay in the host.
/// The registry contains weak references only and is bounded by MAX_ACTORS.
pub struct PgAdmission {
    trust: Arc<DurableTrust>,
    config: Config,
    ca_pem: Vec<u8>,
    role: String,
    zone: ZoneHandle,
    next_actor: AtomicU64,
    actors: Mutex<BTreeMap<String, Weak<OwnActor>>>,
    games: Option<Arc<dyn GameCommands>>,
}

impl PgAdmission {
    pub fn new(
        trust: DurableTrust,
        config: Config,
        ca_pem: Vec<u8>,
        role: String,
        zone: ZoneHandle,
    ) -> Result<Self, Fault> {
        if ca_pem.is_empty()
            || ca_pem.len() > 65536
            || config.get_user() != Some(&role)
            || role.is_empty()
            || role.len() > 63
            || !role.starts_with(|c: char| c.is_ascii_lowercase())
            || !role
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
        {
            return Err(Fault::Unavailable);
        }
        Ok(Self {
            trust: Arc::new(trust),
            config,
            ca_pem,
            role,
            zone,
            next_actor: AtomicU64::new(1),
            actors: Mutex::new(BTreeMap::new()),
            games: None,
        })
    }

    pub fn with_games(mut self, games: Arc<dyn GameCommands>) -> Self {
        self.games = Some(games);
        self
    }

    async fn own_actor(&self, account: &str) -> Result<Arc<OwnActor>, Fault> {
        // Only bounded per-zone membership work, never SQL or a game reducer,
        // occurs under this registry lock. State remains owned by the zone task.
        let mut actors = self.actors.lock().await;
        actors.retain(|_, actor| actor.strong_count() > 0);
        if let Some(actor) = actors.get(account).and_then(Weak::upgrade) {
            return Ok(actor);
        }
        if actors.len() >= vl_world::MAX_ACTORS {
            return Err(Fault::Unavailable);
        }
        let id = self
            .next_actor
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
            .map_err(|_| Fault::Unavailable)?;
        let reply = self
            .zone
            .join(id, Position::default())
            .map_err(|_| Fault::Unavailable)?;
        let handle = tokio::time::timeout(Duration::from_millis(250), reply)
            .await
            .map_err(|_| Fault::Unavailable)?
            .map_err(|_| Fault::Unavailable)?
            .map_err(|_| Fault::Unavailable)?;
        let actor = Arc::new(OwnActor { id, handle });
        actors.insert(account.into(), Arc::downgrade(&actor));
        Ok(actor)
    }
}

struct PgSession {
    trust: Arc<DurableTrust>,
    client: Client,
    connection: JoinHandle<Result<(), tokio_postgres::Error>>,
    session: DurableSession,
    account: String,
    zone: ZoneHandle,
    actor: Arc<OwnActor>,
    games: Option<Arc<dyn GameCommands>>,
}
impl Drop for PgSession {
    fn drop(&mut self) {
        self.connection.abort();
        // Dropping the final ActorHandle closes its movement sender. The zone
        // removes the actor at its next tick, including cancellation paths.
    }
}

impl Admission for PgAdmission {
    fn admit<'a>(&'a self, ticket: &'a str) -> Task<'a, Box<dyn Session>> {
        Box::pin(async move {
            let (mut client, connection) =
                connect_runtime_postgres(&self.config, &self.ca_pem, &self.role)
                    .await
                    .map_err(|_| Fault::Unavailable)?;
            // Guard even failures/cancellation before a PgSession is published.
            struct Driver(Option<JoinHandle<Result<(), tokio_postgres::Error>>>);
            impl Drop for Driver {
                fn drop(&mut self) {
                    if let Some(task) = &self.0 {
                        task.abort();
                    }
                }
            }
            let mut driver = Driver(Some(connection));
            let session = self
                .trust
                .admit(&mut client, ticket)
                .await
                .map_err(|_| Fault::Unauthenticated)?;
            let account = self
                .trust
                .command(&mut client, &session, |_tx, actor| {
                    Box::pin(async move { Ok(actor.account.to_owned()) })
                })
                .await
                .map_err(|_| Fault::Revoked)?;
            let actor = self.own_actor(&account).await?;
            let result = PgSession {
                trust: Arc::clone(&self.trust),
                client,
                connection: driver.0.take().unwrap(),
                session,
                account,
                zone: self.zone.clone(),
                actor,
                games: self.games.clone(),
            };
            Ok(Box::new(result) as Box<dyn Session>)
        })
    }
}
impl Session for PgSession {
    fn game<'a>(
        &'a mut self,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
    ) -> Task<'a, GameReply> {
        Box::pin(async move {
            let games = self.games.as_ref().ok_or(Fault::Unavailable)?;
            games
                .execute(
                    &mut self.client,
                    &self.trust,
                    &self.session,
                    command_id,
                    intent,
                )
                .await
        })
    }
    fn principal(&self) -> &str {
        &self.account
    }
    fn authorize(&mut self) -> Task<'_, ()> {
        Box::pin(async {
            self.trust
                .command(&mut self.client, &self.session, |_tx, _actor| {
                    Box::pin(async { Ok(()) })
                })
                .await
                .map_err(|_| Fault::Revoked)
        })
    }
    fn snapshot(&mut self) -> Task<'_, public::WorldSnapshot> {
        Box::pin(async {
            let reply = self
                .zone
                .snapshot(&self.actor.handle)
                .map_err(|_| Fault::Unavailable)?;
            let snapshot = tokio::time::timeout(Duration::from_millis(250), reply)
                .await
                .map_err(|_| Fault::Unavailable)?
                .map_err(|_| Fault::Unavailable)?
                .map_err(|_| Fault::Unavailable)?;
            // Never serialize geometric AOI candidates, counts or profiling data.
            let own = snapshot
                .visible
                .iter()
                .find(|entity| entity.id == self.actor.id)
                .ok_or(Fault::Unavailable)?;
            Ok(public::WorldSnapshot {
                authority_epoch: 1,
                tick: snapshot.tick,
                own_actor: Some(public::OwnActor {
                    x_mm: own.position.x,
                    z_mm: own.position.z,
                    last_input_sequence: own.last_input,
                }),
            })
        })
    }
}
