use serde::{Deserialize, Serialize};
use vl_game_core::{Canonical, Decision, LogicalClock, Reducer, Ruleset, TurnRng, Value};

pub const CONTENT: [u8; 32] = [0x53; 32];

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub player: String,
    pub turns: u8,
    pub private_roll: u32,
}
impl Canonical for State {
    fn canonical(&self) -> Value {
        Value::List(vec![
            Value::Text(self.player.clone()),
            Value::Uint(self.turns.into()),
            Value::Uint(self.private_roll.into()),
        ])
    }
}
pub struct Rules {
    pub player: String,
}
impl Reducer for Rules {
    type State = State;
    type Action = Value;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: "headless-counter".into(),
            version: 1,
            content_hash: CONTENT,
            rng_version: 1,
        }
    }
    fn validate(&self, state: &State) -> Result<(), vl_game_core::Error> {
        if state.player != self.player
            || uuid::Uuid::parse_str(&state.player).is_err()
            || state.turns > 3
            || state.private_roll >= 100
        {
            return Err(vl_game_core::Error::InvalidState);
        }
        Ok(())
    }
    fn reduce(
        &self,
        state: &State,
        action: &Value,
        _: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<State>, vl_game_core::Error> {
        if *action != Value::Null || state.turns >= 3 {
            return Err(vl_game_core::Error::InvalidAction);
        }
        let mut next = state.clone();
        next.turns += 1;
        next.private_roll = rng.below(100)?;
        Ok(Decision {
            events: vec![Value::Uint(next.turns.into())],
            projections: vec![],
            settlement: (next.turns == 3).then_some(Value::Null),
            state: next,
        })
    }
}
