use super::domain::Rules;
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio_postgres::Client;
use uuid::Uuid;
use vl_game_core::Value;
use vl_gateway::{Fault, GameReply, Task, durable::GameCommands};
use vl_persistence::{Error, Host, Request, RewardStatus};
use vl_protocol::public;
use vl_security::durable::{DurableSession, DurableTrust};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Advance {
    epoch: i64,
}

pub struct Commands {
    pub host: Host<Rules>,
    pub match_id: Uuid,
    pub committed: AtomicU64,
    pub rejected: AtomicU64,
}
impl Commands {
    fn fault(&self, error: Error) -> Fault {
        self.rejected.fetch_add(1, Ordering::Relaxed);
        match error {
            Error::Collision => Fault::Rejected(public::ErrorCode::CommandIdCollision),
            Error::Conflict => Fault::Rejected(public::ErrorCode::StaleVersion),
            Error::Invalid => Fault::Rejected(public::ErrorCode::UnsupportedClient),
            Error::Unauthorized => Fault::Revoked,
            Error::Integrity | Error::Unavailable => Fault::Unavailable,
        }
    }
}
impl GameCommands for Commands {
    fn execute<'a>(
        &'a self,
        db: &'a mut Client,
        trust: &'a DurableTrust,
        session: &'a DurableSession,
        command_id: &'a [u8],
        intent: &'a public::GameIntent,
    ) -> Task<'a, GameReply> {
        Box::pin(async move {
            if intent.game_session_id.as_slice() != self.match_id.as_bytes()
                || intent.action_payload.len() > 128
            {
                return Err(self.fault(Error::Invalid));
            }
            let (receipt, committed) = match intent.kind.as_str() {
                "fixture.view.v1" if intent.action_payload.is_empty() => (
                    self.host
                        .projection(db, trust, session, self.match_id)
                        .await
                        .map_err(|e| self.fault(e))?,
                    false,
                ),
                "fixture.advance.v1" => {
                    let action: Advance = serde_json::from_slice(&intent.action_payload)
                        .map_err(|_| self.fault(Error::Invalid))?;
                    let request = Request {
                        match_id: self.match_id,
                        command_id: Uuid::from_slice(command_id)
                            .map_err(|_| self.fault(Error::Invalid))?,
                        epoch: action.epoch,
                        expected_version: i64::try_from(intent.expected_state_version)
                            .map_err(|_| self.fault(Error::Invalid))?,
                        action: Value::Null,
                    };
                    let receipt = self
                        .host
                        .execute(db, trust, session, request)
                        .await
                        .map_err(|e| self.fault(e))?;
                    self.committed.fetch_add(1, Ordering::Relaxed);
                    (receipt, true)
                }
                _ => return Err(self.fault(Error::Invalid)),
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
