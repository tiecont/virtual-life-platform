use aetheria_game_core::{Value, canonical};
use aetheria_gateway::{Fault, GameReply, Task, durable::GameCommands};
use aetheria_persistence::Game;
use aetheria_persistence::{Error, Host, Request, RewardStatus};
use aetheria_protocol::public;
use aetheria_security::durable::{DurableSession, DurableTrust};
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio_postgres::Client;
use uuid::Uuid;

pub const PING_KIND: &str = "arena8-coop.ping.v1";

fn system_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// Deterministic system `command_id` derived solely from `(match_id, turn_index)`.
pub fn system_expire_command_id(match_id: Uuid, turn_index: u16) -> Uuid {
    let digest = canonical::hash(
        "aetheria.arena8-coop.expire-turn.v1",
        &canonical::list([
            Value::Bytes(match_id.as_bytes().to_vec()),
            Value::Uint(u64::from(turn_index)),
        ]),
    )
    .expect("bounded system command digest");
    let mut bytes: [u8; 16] = digest[..16].try_into().expect("16-byte prefix");
    if bytes == [0; 16] {
        bytes[0] = 1;
    }
    Uuid::from_bytes(bytes)
}

pub trait NativeGame: Game {
    fn interaction(&self, _kind: &str) -> Option<&'static str> {
        None
    }
    fn view_kind(&self) -> &'static str;
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, Self::Action), Error>;
    fn stamp_action(&self, action: Self::Action, _now_ms: u64) -> Self::Action {
        action
    }
    fn timed_turns(&self) -> bool {
        false
    }
    fn expired_turn(&self, _state: &Self::State, _now_ms: u64) -> Option<u16> {
        None
    }
    fn expire_turn_action(&self, _turn_index: u16, _now_ms: u64) -> Option<Self::Action> {
        None
    }
    fn supports_ping(&self) -> bool {
        false
    }
    fn clock(&self) -> Arc<dyn Fn() -> u64 + Send + Sync> {
        Arc::new(system_unix_ms)
    }
}

pub struct Commands<G: NativeGame> {
    pub host: Host<G>,
    pub match_id: Uuid,
    pub committed: AtomicU64,
    pub rejected: AtomicU64,
    pub clock: Arc<dyn Fn() -> u64 + Send + Sync>,
}
impl<G: NativeGame> Commands<G>
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
    pub fn new(host: Host<G>, match_id: Uuid) -> Self {
        let clock = host.game().clock();
        Self {
            host,
            match_id,
            committed: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
            clock,
        }
    }

    fn fault(&self, error: Error) -> Fault {
        self.rejected.fetch_add(1, Ordering::Relaxed);
        // Bounded categories only; never log payloads, actors or credentials.
        eprintln!("{{\"event\":\"native.command.rejected\",\"category\":\"{error:?}\"}}");
        match error {
            Error::Collision => Fault::Rejected(public::ErrorCode::CommandIdCollision),
            Error::Conflict => Fault::Rejected(public::ErrorCode::StaleVersion),
            Error::Invalid => Fault::Rejected(public::ErrorCode::UnsupportedClient),
            Error::EffectDenied => Fault::Rejected(public::ErrorCode::NotInProximity),
            Error::Unauthorized => Fault::Revoked,
            Error::Integrity | Error::Unavailable => Fault::Unavailable,
        }
    }

    async fn submit_expire(
        &self,
        db: &mut Client,
        epoch: i64,
        version: u64,
        turn_index: u16,
        now_ms: u64,
    ) -> Result<bool, Error> {
        let Some(action) = self.host.game().expire_turn_action(turn_index, now_ms) else {
            return Ok(false);
        };
        let command_id = system_expire_command_id(self.match_id, turn_index);
        let expected_version = i64::try_from(version).map_err(|_| Error::Invalid)?;
        match self
            .host
            .execute_system(
                db,
                Request {
                    match_id: self.match_id,
                    command_id,
                    epoch,
                    expected_version,
                    action,
                },
                Uuid::nil(),
            )
            .await
        {
            Ok(_) => {
                self.committed.fetch_add(1, Ordering::Relaxed);
                Ok(true)
            }
            Err(Error::Conflict) => Ok(false),
            Err(error) => Err(error),
        }
    }

    async fn expire_if_due(
        &self,
        db: &mut Client,
        expected_version: i64,
        now_ms: u64,
    ) -> Result<bool, Error> {
        let (epoch, version, status, state) = self.host.inspect_state(db, self.match_id).await?;
        if status != "ACTIVE" {
            return Ok(false);
        }
        if let Some(turn_index) = self.host.game().expired_turn(&state, now_ms) {
            let _ = self
                .submit_expire(db, epoch, version, turn_index, now_ms)
                .await;
            return Ok(true);
        }
        Ok(i64::try_from(version).ok() != Some(expected_version))
    }

    /// Periodic 100ms background check for timed-turn expiration.
    /// Returns `Ok(true)` while the match remains `ACTIVE`, `Ok(false)` once terminal.
    pub async fn tick_expiration(&self, db: &mut Client) -> Result<bool, Error>
    where
        G::State: Send + Sync,
        G::Action: Send + Sync + 'static,
    {
        if !self.host.game().timed_turns() {
            return Ok(false);
        }
        let (epoch, version, status, state) = self.host.inspect_state(db, self.match_id).await?;
        if status != "ACTIVE" {
            return Ok(false);
        }
        let now_ms = (self.clock)();
        if let Some(turn_index) = self.host.game().expired_turn(&state, now_ms) {
            let _ = self
                .submit_expire(db, epoch, version, turn_index, now_ms)
                .await?;
        }
        Ok(true)
    }
}
impl<G: NativeGame> GameCommands for Commands<G>
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
    fn interaction(&self, intent: &public::GameIntent) -> Option<&'static str> {
        self.host.game().interaction(&intent.kind)
    }
    fn execute<'a>(
        &'a self,
        db: &'a mut Client,
        trust: &'a DurableTrust,
        session: &'a DurableSession,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
        effect_allowed: bool,
    ) -> Task<'a, GameReply> {
        Box::pin(async move {
            if intent.game_session_id.as_slice() != self.match_id.as_bytes()
                || intent.action_payload.len() > 128
            {
                return Err(self.fault(Error::Invalid));
            }
            if intent.kind == PING_KIND
                && self.host.game().supports_ping()
                && (intent.action_payload.is_empty() || intent.action_payload == b"{}")
            {
                let bytes = serde_json::to_vec(&serde_json::json!({
                    "pong": true,
                    "serverUnixMs": (self.clock)(),
                }))
                .map_err(|_| self.fault(Error::Integrity))?;
                return Ok(GameReply {
                    version: 0,
                    committed: false,
                    projection: bytes,
                });
            }
            let (receipt, committed) = match intent.kind.as_str() {
                kind if kind == self.host.game().view_kind()
                    && intent.action_payload.is_empty() =>
                {
                    (
                        self.host
                            .projection(db, trust, session, self.match_id)
                            .await
                            .map_err(|e| self.fault(e))?,
                        false,
                    )
                }
                kind => {
                    let (epoch, action) = self
                        .host
                        .game()
                        .parse(kind, &intent.action_payload)
                        .map_err(|e| self.fault(e))?;
                    let now_ms = (self.clock)();
                    let action = self.host.game().stamp_action(action, now_ms);
                    let expected_version = i64::try_from(intent.expected_state_version)
                        .map_err(|_| self.fault(Error::Invalid))?;
                    let request = Request {
                        match_id: self.match_id,
                        command_id: Uuid::from_slice(command_id)
                            .map_err(|_| self.fault(Error::Invalid))?,
                        epoch,
                        expected_version,
                        action,
                    };
                    let receipt = match self
                        .host
                        .execute_when(db, trust, session, request, effect_allowed)
                        .await
                    {
                        Ok(receipt) => receipt,
                        Err(Error::Invalid) if self.host.game().timed_turns() => {
                            if self
                                .expire_if_due(db, expected_version, now_ms)
                                .await
                                .map_err(|e| self.fault(e))?
                            {
                                self.rejected.fetch_add(1, Ordering::Relaxed);
                                eprintln!(
                                    "{{\"event\":\"native.command.rejected\",\"category\":\"TURN_EXPIRED\"}}"
                                );
                                return Err(Fault::Rejected(public::ErrorCode::StaleVersion));
                            }
                            return Err(self.fault(Error::Invalid));
                        }
                        Err(error) => return Err(self.fault(error)),
                    };
                    self.committed.fetch_add(1, Ordering::Relaxed);
                    (receipt, true)
                }
            };
            let reward = receipt.reward.map(|r| match r {
                RewardStatus::Pending => "REWARD_PENDING",
                RewardStatus::Granted => "GRANTED",
                RewardStatus::Declined => "DECLINED",
            });
            let projection: serde_json::Value = serde_json::from_slice(&receipt.projection)
                .map_err(|_| self.fault(Error::Integrity))?;
            let bytes = serde_json::to_vec(
                &serde_json::json!({"state":projection,"epoch":receipt.epoch,"reward":reward}),
            )
            .map_err(|_| self.fault(Error::Integrity))?;
            Ok(GameReply {
                version: receipt.version as u64,
                committed,
                projection: bytes,
            })
        })
    }
}
