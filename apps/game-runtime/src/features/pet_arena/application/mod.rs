use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use serde::Deserialize;
use vl_persistence::Error;
use vl_pet_arena::combat::Action;

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
    Pass {},
}
impl NativeGame for Rules {
    fn view_kind(&self) -> &'static str {
        "pet.view.v1"
    }
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, Action), Error> {
        if kind != "pet.intent.v1" {
            return Err(Error::Invalid);
        }
        let intent: Intent = serde_json::from_slice(payload).map_err(|_| Error::Invalid)?;
        let action = match intent.action {
            IntentAction::Start {} => Action::Start,
            IntentAction::Swap { first, second } => Action::Swap { first, second },
            IntentAction::Skill {} => Action::Skill,
            IntentAction::Pass {} => Action::Pass,
        };
        Ok((intent.epoch, action))
    }
}
