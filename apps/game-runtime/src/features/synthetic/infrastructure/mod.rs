use super::domain::{Rules, State};
use aetheria_persistence::{Error, Game};

impl Game for Rules {
    fn encode(&self, state: &State) -> aetheria_persistence::Result<Vec<u8>> {
        serde_json::to_vec(state).map_err(|_| Error::Invalid)
    }
    fn decode(&self, bytes: &[u8]) -> aetheria_persistence::Result<State> {
        serde_json::from_slice(bytes).map_err(|_| Error::Integrity)
    }
    fn member(&self, state: &State, account: &str) -> bool {
        state.player == account
    }
    fn authorize(&self, state: &State, account: &str, _: &aetheria_game_core::Value) -> bool {
        self.member(state, account)
    }
    fn project(&self, state: &State, account: &str) -> aetheria_persistence::Result<Vec<u8>> {
        if !self.member(state, account) {
            return Err(Error::Unauthorized);
        }
        serde_json::to_vec(&serde_json::json!({"turns":state.turns,"ownRoll":state.private_roll}))
            .map_err(|_| Error::Invalid)
    }
}
