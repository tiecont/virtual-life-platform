use super::domain::Rules;
use crate::features::runtime::application::NativeGame;
use serde::Deserialize;
use vl_game_core::Value;
use vl_persistence::Error;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Advance {
    epoch: i64,
}
impl NativeGame for Rules {
    fn view_kind(&self) -> &'static str {
        "fixture.view.v1"
    }
    fn parse(&self, kind: &str, payload: &[u8]) -> Result<(i64, Value), Error> {
        if kind != "fixture.advance.v1" {
            return Err(Error::Invalid);
        }
        let action: Advance = serde_json::from_slice(payload).map_err(|_| Error::Invalid)?;
        Ok((action.epoch, Value::Null))
    }
}
