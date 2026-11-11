use vl_game_core::{
    Canonical, Decision, Error, LogicalClock, Reducer, Ruleset, TurnRng, Value, canonical,
};
use vl_pet_arena::combat::{Action, Combat, Phase, State as CombatState};

// The wrapper pins account membership and terminal signaling without changing
// the verified combat reducer or allowing client-supplied outcomes or entropy.
pub struct Rules {
    pub player: String,
    pub pet: u8,
    pub stage: u8,
}
#[derive(Clone)]
pub struct State {
    pub player: String,
    pub combat: CombatState,
}
impl Canonical for State {
    fn canonical(&self) -> Value {
        Value::List(vec![
            Value::Text(self.player.clone()),
            self.combat.canonical(),
        ])
    }
}
pub fn content_hash() -> [u8; 32] {
    canonical::hash(
        "vl.pet-native.v1",
        &Value::List(vec![
            Value::Bytes(vl_pet_arena::combat::rules_hash().to_vec()),
            Value::Text(
                "single-player;server-pet-stage;terminal-win-loss;owner-view-v1;completion-v1"
                    .into(),
            ),
        ]),
    )
    .expect("bounded static adapter contract")
}
impl Rules {
    pub fn initial(&self) -> Result<State, Error> {
        Ok(State {
            player: self.player.clone(),
            combat: CombatState::new(self.pet, self.stage)?,
        })
    }
}
impl Reducer for Rules {
    type State = State;
    type Action = Action;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: "pet-arena-pve".into(),
            version: 1,
            content_hash: content_hash(),
            rng_version: 1,
        }
    }
    fn validate(&self, state: &State) -> Result<(), Error> {
        // Check all server-chosen allocation fields on every restore.
        if state.player != self.player
            || uuid::Uuid::parse_str(&state.player).is_err()
            || state.combat.pet() != self.pet
            || state.combat.stage() != self.stage
        {
            return Err(Error::InvalidState);
        }
        Combat.validate(&state.combat)
    }
    fn reduce(
        &self,
        state: &State,
        action: &Action,
        clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> Result<Decision<State>, Error> {
        self.validate(state)?;
        let decision = Combat.reduce(&state.combat, action, clock, rng)?;
        let terminal = matches!(decision.state.phase(), Phase::Won | Phase::Lost);
        Ok(Decision {
            state: State {
                player: state.player.clone(),
                combat: decision.state,
            },
            events: decision.events,
            projections: decision.projections,
            settlement: terminal.then_some(Value::Null),
        })
    }
}
