use super::domain::{Rules, State};
use serde::{Deserialize, Serialize};
use vl_game_core::Reducer;
use vl_persistence::{Completion, Error, Game};
use vl_pet_arena::combat::{Action, Phase, State as CombatState};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Snapshot {
    player: String,
    combat: Vec<u8>,
}
impl Game for Rules {
    fn completion(&self, state: &State) -> vl_persistence::Result<Completion> {
        self.validate(state).map_err(|_| Error::Integrity)?;
        match state.combat.phase() {
            Phase::Won => Ok(Completion::PetArena { won: true }),
            Phase::Lost => Ok(Completion::PetArena { won: false }),
            _ => Err(Error::Invalid),
        }
    }
    fn encode(&self, state: &State) -> vl_persistence::Result<Vec<u8>> {
        serde_json::to_vec(&Snapshot {
            player: state.player.clone(),
            combat: state.combat.encode().map_err(|_| Error::Invalid)?,
        })
        .map_err(|_| Error::Invalid)
    }
    fn decode(&self, bytes: &[u8]) -> vl_persistence::Result<State> {
        let raw: Snapshot = serde_json::from_slice(bytes).map_err(|_| Error::Integrity)?;
        let state = State {
            player: raw.player,
            combat: CombatState::decode(&raw.combat).map_err(|_| Error::Integrity)?,
        };
        self.validate(&state).map_err(|_| Error::Integrity)?;
        Ok(state)
    }
    fn member(&self, state: &State, account: &str) -> bool {
        state.player == account
    }
    fn authorize(&self, state: &State, account: &str, _: &Action) -> bool {
        self.member(state, account)
    }
    fn project(&self, state: &State, account: &str) -> vl_persistence::Result<Vec<u8>> {
        if !self.member(state, account) {
            return Err(Error::Unauthorized);
        }
        let combat = &state.combat;
        let statuses = |values: &[vl_pet_arena::status::Status]| {
            values.iter().map(|status|
            serde_json::json!({"kind": status.kind as u8, "potency": status.potency.raw(), "remaining": status.remaining_turns})
        ).collect::<Vec<_>>()
        };
        // Deliberately authored DTO; no checkpoint, seed, RNG cursor or account ID.
        serde_json::to_vec(&serde_json::json!({
            "phase":match combat.phase() { Phase::Ready => "ready", Phase::Playing => "playing", Phase::Won => "won", Phase::Lost => "lost" },
            "pet":combat.pet(), "stage":combat.stage(),
            "turn":combat.turn(), "board":combat.board().0.iter().map(|tile| *tile as u8).collect::<Vec<_>>(),
            "health":combat.health().raw(), "enemyHealth":combat.enemy_health().raw(),
            "cooldown":combat.cooldown(),
            "shield":combat.shield().raw(), "enemyShield":combat.enemy_shield().raw(),
            "playerStatuses":statuses(combat.player_status()), "enemyStatuses":statuses(combat.enemy_status()),
            "telegraph":combat.telegraph().map(|intent| serde_json::json!({"pattern":intent.pattern as u8,"cells":intent.cells,"resolvesTurn":intent.resolves_turn})),
        })).map_err(|_| Error::Invalid)
    }
}
