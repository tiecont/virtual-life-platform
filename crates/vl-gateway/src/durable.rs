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
use vl_world::{ActorHandle, ZoneHandle, collision::Collision};

/// Trusted runtime adapter. Player input cannot construct this capability.
pub trait GameCommands: Send + Sync {
    fn interaction(&self, intent: &public::GameIntent) -> Option<&'static str>;
    fn execute<'a>(
        &'a self,
        client: &'a mut Client,
        trust: &'a DurableTrust,
        session: &'a DurableSession,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
        effect_allowed: bool,
    ) -> Task<'a, GameReply>;
}

struct OwnActor {
    id: u64,
    handle: ActorHandle,
    effects: Mutex<()>,
}
enum ActorReference {
    Retained(Arc<OwnActor>),
    Transient(Weak<OwnActor>),
}
impl ActorReference {
    fn upgrade(&self) -> Option<Arc<OwnActor>> {
        match self {
            Self::Retained(actor) => Some(actor.clone()),
            Self::Transient(actor) => actor.upgrade(),
        }
    }
}

/// One instance per trusted native zone. Credentials/keys stay in the host.
/// The registry is bounded by MAX_ACTORS. Movement retains actors for reconnect;
/// legacy admission keeps weak references and removes disconnected actors.
pub struct PgAdmission {
    trust: Arc<DurableTrust>,
    config: Config,
    ca_pem: Vec<u8>,
    role: String,
    zone: ZoneHandle,
    next_actor: AtomicU64,
    actors: Mutex<BTreeMap<String, ActorReference>>,
    games: Option<Arc<dyn GameCommands>>,
    collision: Option<Arc<Collision>>,
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
            collision: None,
        })
    }

    pub fn with_games(mut self, games: Arc<dyn GameCommands>) -> Self {
        self.games = Some(games);
        self
    }
    pub fn with_movement(mut self, collision: Collision) -> Self {
        self.collision = Some(Arc::new(collision));
        self
    }

    async fn own_actor(&self, account: &str) -> Result<Arc<OwnActor>, Fault> {
        // Only bounded per-zone membership work, never SQL or a game reducer,
        // occurs under this registry lock. State remains owned by the zone task.
        let mut actors = self.actors.lock().await;
        actors.retain(|_, actor| actor.upgrade().is_some());
        if let Some(actor) = actors.get(account).and_then(ActorReference::upgrade) {
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
            .join(
                id,
                match &self.collision {
                    Some(collision) => collision.spawn().map_err(|_| Fault::Unavailable)?,
                    None => Default::default(),
                },
            )
            .map_err(|_| Fault::Unavailable)?;
        let handle = tokio::time::timeout(Duration::from_millis(250), reply)
            .await
            .map_err(|_| Fault::Unavailable)?
            .map_err(|_| Fault::Unavailable)?
            .map_err(|_| Fault::Unavailable)?;
        let actor = Arc::new(OwnActor {
            id,
            handle,
            effects: Mutex::new(()),
        });
        actors.insert(
            account.into(),
            if self.collision.is_some() {
                ActorReference::Retained(actor.clone())
            } else {
                ActorReference::Transient(Arc::downgrade(&actor))
            },
        );
        Ok(actor)
    }
}

struct PgSession {
    collision: Option<Arc<Collision>>,
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
        // Legacy admission drops the final ActorHandle here. Movement admission
        // retains its bounded registry handle until the runtime stops.
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
                collision: self.collision.clone(),
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
    fn movement<'a>(
        &'a mut self,
        intent: &'a public::MoveIntent,
    ) -> Task<'a, public::WorldSnapshot> {
        Box::pin(async move {
            if self.collision.is_none() {
                return Err(Fault::Unavailable);
            }
            let zone = &self.zone;
            let actor = self.actor.clone();
            let _effect = actor.effects.lock().await;
            let actor = &actor;
            let outcome = self
                .trust
                .current_effect(&mut self.client, &self.session, |expires_at_ms| {
                    Box::pin(async move {
                        let mut request = zone
                            .move_actor(
                                &actor.handle,
                                vl_world::movement::MoveInput {
                                    sequence: intent.input_sequence,
                                    x: intent.direction_x,
                                    z: intent.direction_z,
                                    epoch: intent.authority_epoch,
                                    expected_tick: intent.expected_tick,
                                    sent_at_ms: intent.sent_at_unix_ms,
                                    expires_at_ms,
                                },
                            )
                            .map_err(|_| vl_security::TrustError::Capacity)?;
                        // On cancellation MovementRequest invalidates its gate before
                        // current_effect releases the shared Nest policy locks.
                        (&mut request.reply)
                            .await
                            .map_err(|_| vl_security::TrustError::PolicyUnavailable)
                    })
                })
                .await
                .map_err(|_| Fault::Revoked)?;
            outcome.map_err(|error| {
                Fault::Rejected(match error {
                    vl_world::Error::StaleEpoch => public::ErrorCode::StaleEpoch,
                    vl_world::Error::StaleInput => public::ErrorCode::StaleVersion,
                    vl_world::Error::Backpressure => public::ErrorCode::Backpressure,
                    _ => public::ErrorCode::TemporarilyUnavailable,
                })
            })?;
            self.snapshot().await
        })
    }
    fn game<'a>(
        &'a mut self,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
    ) -> Task<'a, GameReply> {
        Box::pin(async move {
            // Same-account sockets cannot move between the proximity snapshot
            // and durable commit. Acquire before any Nest policy/SQL locks.
            let actor = self.actor.clone();
            let _effect = actor.effects.lock().await;
            let interaction = self
                .games
                .as_ref()
                .ok_or(Fault::Unavailable)?
                .interaction(intent);
            let effect_allowed = match (self.collision.clone(), interaction) {
                (Some(collision), Some(id)) => {
                    let own = self.snapshot().await?.own_actor.ok_or(Fault::Unavailable)?;
                    collision.can_interact(
                        id,
                        vl_world::Position {
                            x: own.x_mm,
                            z: own.z_mm,
                        },
                    )
                }
                _ => true,
            };
            let games = self.games.as_ref().ok_or(Fault::Unavailable)?;
            games
                .execute(
                    &mut self.client,
                    &self.trust,
                    &self.session,
                    command_id,
                    intent,
                    effect_allowed,
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
                authority_epoch: if self.collision.is_some() {
                    snapshot.authority_epoch
                } else {
                    1
                },
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
