use std::sync::atomic::{AtomicU64, Ordering};
use tokio_postgres::Client;
use uuid::Uuid;
use vl_gateway::{Fault, GameReply, Task, durable::GameCommands};
use vl_persistence::Game;
use vl_persistence::{Error, Host, Request, RewardStatus};
use vl_protocol::public;
use vl_security::durable::{DurableSession, DurableTrust};

pub trait NativeGame: Game {
    fn interaction(&self, _kind: &str) -> Option<&'static str> {
        None
    }
    fn view_kind(&self) -> &'static str;
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, Self::Action), Error>;
}

pub struct Commands<G: NativeGame> {
    pub host: Host<G>,
    pub match_id: Uuid,
    pub committed: AtomicU64,
    pub rejected: AtomicU64,
}
impl<G: NativeGame> Commands<G> {
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
                    let request = Request {
                        match_id: self.match_id,
                        command_id: Uuid::from_slice(command_id)
                            .map_err(|_| self.fault(Error::Invalid))?,
                        epoch,
                        expected_version: i64::try_from(intent.expected_state_version)
                            .map_err(|_| self.fault(Error::Invalid))?,
                        action,
                    };
                    let receipt = self
                        .host
                        .execute_when(db, trust, session, request, effect_allowed)
                        .await
                        .map_err(|e| self.fault(e))?;
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
