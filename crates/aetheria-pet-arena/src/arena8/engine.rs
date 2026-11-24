use aetheria_game_core::{
    Canonical, Checkpoint, Command, Error as CoreError, LogicalClock, Reducer, SecretSeed, Value,
    apply, begin, canonical, canonical::list,
};
use serde::{Deserialize, Serialize};

use super::combat::Arena8;
use super::events::CombatEvent;
use super::model::{Action, State};
use super::{MAX_ACCEPTED_COMMANDS, MAX_SUBMISSIONS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Arena8Error {
    Core(CoreError),
    DuplicateCommand,
    StaleCommand,
    CommandLimit,
    MatchComplete,
    InvalidCommandId,
}

impl From<CoreError> for Arena8Error {
    fn from(error: CoreError) -> Self {
        Self::Core(error)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ReplayEntry {
    pub index: u32,
    pub command_id: [u8; 16],
    pub action: Action,
    pub events: Vec<CombatEvent>,
    pub state_hash: [u8; 32],
    pub audit_hash: [u8; 32],
}

/// Immutable accepted-command replay. `digest` binds the ruleset, initial
/// state, every command, every typed event and every resulting state.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Replay {
    pub rules_hash: [u8; 32],
    pub initial_state_hash: [u8; 32],
    pub entries: Vec<ReplayEntry>,
    pub final_state_hash: [u8; 32],
}

impl Replay {
    pub fn digest(&self) -> [u8; 32] {
        let entries = list(self.entries.iter().map(|entry| {
            list([
                Value::Uint(entry.index.into()),
                Value::Bytes(entry.command_id.to_vec()),
                entry.action.canonical(),
                list(entry.events.iter().map(CombatEvent::canonical)),
                Value::Bytes(entry.state_hash.to_vec()),
                Value::Bytes(entry.audit_hash.to_vec()),
            ])
        }));
        canonical::hash(
            "aetheria.arena8.replay.v1",
            &list([
                Value::Bytes(self.rules_hash.to_vec()),
                Value::Bytes(self.initial_state_hash.to_vec()),
                entries,
                Value::Bytes(self.final_state_hash.to_vec()),
            ]),
        )
        .expect("bounded arena8 replay is hashable")
    }
}

/// Pure command engine around the new reducer. It owns the host seed, applies
/// the core version fence, rejects duplicate command ids, bounds submissions and
/// records an immutable replay. It performs no I/O and settles no rewards.
pub struct Arena8Engine {
    seed: SecretSeed,
    checkpoint: Checkpoint<State>,
    seen: Vec<[u8; 16]>,
    submissions: u16,
    accepted: u16,
    initial_state_hash: [u8; 32],
    entries: Vec<ReplayEntry>,
}

impl Arena8Engine {
    pub fn new(
        seed: SecretSeed,
        match_id: [u8; 16],
        pet: u8,
        encounter: u8,
        clock: LogicalClock,
    ) -> Result<Self, Arena8Error> {
        let state = State::new(pet, encounter)?;
        let checkpoint = begin(&Arena8, match_id, state, &seed, clock)?;
        let initial_state_hash = checkpoint.state.hash();
        Ok(Self {
            seed,
            checkpoint,
            seen: Vec::new(),
            submissions: 0,
            accepted: 0,
            initial_state_hash,
            entries: Vec::new(),
        })
    }

    /// Submits an intent. The caller supplies the command id and expected
    /// version only; seed, damage, enemy target and outcome stay engine-side.
    pub fn submit(
        &mut self,
        command_id: [u8; 16],
        expected_version: u64,
        action: Action,
        clock: LogicalClock,
    ) -> Result<Vec<CombatEvent>, Arena8Error> {
        if self.checkpoint.state.phase().terminal() {
            return Err(Arena8Error::MatchComplete);
        }
        if command_id == [0; 16] {
            return Err(Arena8Error::InvalidCommandId);
        }
        if self.submissions >= MAX_SUBMISSIONS {
            return Err(Arena8Error::CommandLimit);
        }
        self.submissions += 1;
        if self.seen.contains(&command_id) {
            return Err(Arena8Error::DuplicateCommand);
        }
        if self.accepted >= MAX_ACCEPTED_COMMANDS {
            return Err(Arena8Error::CommandLimit);
        }
        if expected_version != self.checkpoint.version {
            return Err(Arena8Error::StaleCommand);
        }
        let command = Command {
            id: command_id,
            match_id: self.checkpoint.match_id,
            expected_version,
            ruleset: Arena8.ruleset(),
            action,
        };
        let transition = apply(&Arena8, &self.checkpoint, &command, &self.seed, clock)?;
        let events = transition
            .events
            .iter()
            .map(CombatEvent::from_canonical)
            .collect::<Result<Vec<_>, CoreError>>()?;
        let state_hash = transition.next.state.hash();
        let index = u32::from(self.accepted);
        self.checkpoint = transition.next;
        self.seen.push(command_id);
        self.accepted += 1;
        self.entries.push(ReplayEntry {
            index,
            command_id,
            action,
            events: events.clone(),
            state_hash,
            audit_hash: self.checkpoint.audit_hash,
        });
        Ok(events)
    }

    pub const fn state(&self) -> &State {
        &self.checkpoint.state
    }

    pub const fn version(&self) -> u64 {
        self.checkpoint.version
    }

    pub const fn accepted_commands(&self) -> u16 {
        self.accepted
    }

    pub const fn submissions(&self) -> u16 {
        self.submissions
    }

    pub fn state_hash(&self) -> [u8; 32] {
        self.checkpoint.state.hash()
    }

    pub const fn initial_state_hash(&self) -> [u8; 32] {
        self.initial_state_hash
    }

    pub const fn audit_hash(&self) -> [u8; 32] {
        self.checkpoint.audit_hash
    }

    pub const fn rng_cursor(&self) -> u64 {
        self.checkpoint.rng_cursor
    }

    pub fn replay(&self) -> Replay {
        Replay {
            rules_hash: super::pinned_rules_hash(),
            initial_state_hash: self.initial_state_hash,
            entries: self.entries.clone(),
            final_state_hash: self.checkpoint.state.hash(),
        }
    }
}
