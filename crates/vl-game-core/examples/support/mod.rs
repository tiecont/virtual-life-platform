//! Synthetic arithmetic fixture; not Pet Arena, Lodge or production gameplay.
use vl_game_core::{
    Canonical, Decision, Error, Fixed, LogicalClock, ProjectionIntent, Reducer, Ruleset, TurnRng,
    Value,
};

pub struct Fixture;
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub total: Fixed,
    pub hidden_roll: u32,
}
impl Canonical for State {
    fn canonical(&self) -> Value {
        Value::List(vec![
            self.total.canonical(),
            Value::Uint(self.hidden_roll.into()),
        ])
    }
}
impl Reducer for Fixture {
    type State = State;
    type Action = Value;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: "fixture-only".into(),
            version: 1,
            content_hash: [3; 32],
            rng_version: 1,
        }
    }
    fn validate(&self, state: &State) -> Result<(), Error> {
        if state.total.raw() < 0 || state.total.raw() > 1_000_000 || state.hidden_roll >= 100 {
            return Err(Error::InvalidState);
        }
        Ok(())
    }
    fn reduce(
        &self,
        state: &State,
        action: &Value,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<State>, Error> {
        let hidden_roll = rng.below(100)?;
        let Value::Int(amount) = action else {
            return Err(Error::InvalidAction);
        };
        if !(1..=1000).contains(amount) {
            return Err(Error::InvalidAction);
        }
        let total = state.total.checked_add(Fixed::from_raw(*amount))?;
        self.validate(&State { total, hidden_roll })?;
        Ok(Decision {
            state: State { total, hidden_roll },
            events: vec![Value::Int(total.raw())],
            projections: vec![
                ProjectionIntent::PublicChanged,
                ProjectionIntent::ParticipantChanged(1),
            ],
            settlement: None,
        })
    }
}
