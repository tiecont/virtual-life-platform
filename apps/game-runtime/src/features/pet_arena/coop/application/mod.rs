//! Strict intent parsing for `arena8-coop.intent.v1`.
//!
//! Intents carry an epoch and one legal cooperative action. They cannot name a
//! seat, actor, target, seed, damage, reward or configuration value.
use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use aetheria_persistence::Error;
use aetheria_pet_arena::arena8::coop::{CoopAction, CoopCommand, CoopPhase, CoopState};
use serde::Deserialize;
use std::sync::Arc;

pub const INTENT_KIND: &str = "arena8-coop.intent.v1";
pub const VIEW_KIND: &str = "arena8-coop.view.v1";
pub const INTERACTION: &str = "pet-arena";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Intent {
    epoch: i64,
    action: IntentAction,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum IntentAction {
    Start {},
    Swap { first: u8, second: u8 },
    Guard {},
    Skill {},
    Signature {},
    Ultimate {},
    FireZone {},
    EndTurn {},
}

impl NativeGame for Rules {
    fn interaction(&self, kind: &str) -> Option<&'static str> {
        (kind == INTENT_KIND).then_some(INTERACTION)
    }
    fn view_kind(&self) -> &'static str {
        VIEW_KIND
    }
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, CoopCommand), Error> {
        if kind != INTENT_KIND {
            return Err(Error::Invalid);
        }
        let intent: Intent = serde_json::from_slice(payload).map_err(|_| Error::Invalid)?;
        let action = match intent.action {
            IntentAction::Start {} => CoopAction::Start,
            IntentAction::Swap { first, second } => CoopAction::Swap { first, second },
            IntentAction::Guard {} => CoopAction::Guard,
            IntentAction::Skill {} => CoopAction::Skill,
            IntentAction::Signature {} => CoopAction::Signature,
            IntentAction::Ultimate {} => CoopAction::Ultimate,
            IntentAction::FireZone {} => CoopAction::FireZone,
            IntentAction::EndTurn {} => CoopAction::EndTurn,
        };
        Ok((intent.epoch, CoopCommand::new(action)))
    }
    fn timed_turns(&self) -> bool {
        self.engine().is_v3()
    }
    fn expired_turn(&self, state: &CoopState, now_ms: u64) -> Option<u16> {
        (self.engine().is_v3()
            && state.phase == CoopPhase::Playing
            && state
                .turn_deadline_ms
                .is_some_and(|deadline| now_ms >= deadline))
        .then_some(state.turn_index)
    }
    fn expire_turn_action(&self, turn_index: u16) -> Option<CoopCommand> {
        self.engine()
            .is_v3()
            .then(|| CoopCommand::new(CoopAction::ExpireTurn { turn_index }))
    }
    fn supports_ping(&self) -> bool {
        true
    }
    fn clock(&self) -> Arc<dyn Fn() -> u64 + Send + Sync> {
        Rules::clock(self)
    }
}
