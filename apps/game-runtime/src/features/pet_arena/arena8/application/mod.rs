//! Strict intent parsing for \`arena8.intent.v1\`.
//!
//! Intents carry an epoch and an action only. They cannot name a seed, damage,
//! target, outcome, reward, artifact or stat.

use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use aetheria_persistence::Error;
use aetheria_pet_arena::arena8::Action;
use serde::Deserialize;

pub const INTENT_KIND: &str = "arena8.intent.v1";
pub const VIEW_KIND: &str = "arena8.view.v1";
/// Reuses the existing Pet Arena proximity activity; this adapter adds no new
/// world activity and no new admission path.
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
    Skill {},
    Signature {},
    FireZone {},
    Ultimate {},
    Guard {},
}

impl NativeGame for Rules {
    fn interaction(&self, kind: &str) -> Option<&'static str> {
        (kind == INTENT_KIND).then_some(INTERACTION)
    }
    fn view_kind(&self) -> &'static str {
        VIEW_KIND
    }
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, Action), Error> {
        if kind != INTENT_KIND {
            return Err(Error::Invalid);
        }
        let intent: Intent = serde_json::from_slice(payload).map_err(|_| Error::Invalid)?;
        let action = match intent.action {
            IntentAction::Start {} => Action::Start,
            IntentAction::Swap { first, second } => Action::Swap { first, second },
            IntentAction::Skill {} => Action::Skill,
            IntentAction::Signature {} => Action::Signature,
            IntentAction::FireZone {} => Action::FireZone,
            IntentAction::Ultimate {} => Action::Ultimate,
            IntentAction::Guard {} => Action::Guard,
        };
        Ok((intent.epoch, action))
    }
}
