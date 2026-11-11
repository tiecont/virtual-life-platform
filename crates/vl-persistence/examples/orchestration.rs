//! Disposable real-PG harness only. This binary is not shipped or mounted.
use jsonwebtoken::DecodingKey;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Write},
};
use uuid::Uuid;
use vl_game_core::{Canonical, Decision, LogicalClock, Reducer, Ruleset, TurnRng, Value};
use vl_persistence::{Error, Game, Host, Keys, Owner, Request, RewardStatus, Scope};
use vl_security::{
    RuntimeScope, TicketVerifier,
    durable::{DurableSession, DurableTrust},
    transport::connect_runtime_postgres,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fixture {
    public_keys: BTreeMap<String, String>,
    world: String,
    boot: Uuid,
    ca_file: String,
    expected_role: String,
    active_key: String,
    storage_keys: BTreeMap<String, [u8; 32]>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    players: [String; 2],
    turn: usize,
    turns: u64,
    total: u64,
    hidden: [u32; 2],
}
impl Canonical for State {
    fn canonical(&self) -> Value {
        Value::List(vec![
            Value::List(self.players.iter().cloned().map(Value::Text).collect()),
            Value::Uint(self.turn as u64),
            Value::Uint(self.turns),
            Value::Uint(self.total),
            Value::List(
                self.hidden
                    .iter()
                    .map(|v| Value::Uint((*v).into()))
                    .collect(),
            ),
        ])
    }
}
struct FixtureGame;
impl Reducer for FixtureGame {
    type State = State;
    type Action = Value;
    fn ruleset(&self) -> Ruleset {
        Ruleset {
            id: "storage-fixture".into(),
            version: 1,
            content_hash: [0x17; 32],
            rng_version: 1,
        }
    }
    fn validate(&self, s: &State) -> std::result::Result<(), vl_game_core::Error> {
        if s.turn >= 2
            || s.turns > 3
            || s.total > 27
            || s.players[0] == s.players[1]
            || s.players.iter().any(|p| Uuid::parse_str(p).is_err())
        {
            return Err(vl_game_core::Error::InvalidState);
        }
        Ok(())
    }
    fn reduce(
        &self,
        s: &State,
        a: &Value,
        _clock: LogicalClock,
        rng: &mut TurnRng,
    ) -> std::result::Result<Decision<State>, vl_game_core::Error> {
        let Value::Int(amount) = a else {
            return Err(vl_game_core::Error::InvalidAction);
        };
        if !(1..=9).contains(amount) || s.turns >= 3 {
            return Err(vl_game_core::Error::InvalidAction);
        }
        let mut next = s.clone();
        next.total += *amount as u64;
        next.turns += 1;
        next.hidden[s.turn] = rng.below(100)?;
        next.turn = 1 - s.turn;
        Ok(Decision {
            events: vec![next.canonical()],
            projections: vec![],
            settlement: if next.turns == 3 {
                Some(Value::Null)
            } else {
                None
            },
            state: next,
        })
    }
}
impl Game for FixtureGame {
    fn encode(&self, s: &State) -> vl_persistence::Result<Vec<u8>> {
        serde_json::to_vec(s).map_err(|_| Error::Invalid)
    }
    fn decode(&self, b: &[u8]) -> vl_persistence::Result<State> {
        serde_json::from_slice(b).map_err(|_| Error::Integrity)
    }
    fn member(&self, s: &State, account: &str) -> bool {
        s.players.iter().any(|p| p == account)
    }
    fn authorize(&self, s: &State, account: &str, _action: &Value) -> bool {
        s.players[s.turn] == account
    }
    fn project(&self, s: &State, account: &str) -> vl_persistence::Result<Vec<u8>> {
        let index = s
            .players
            .iter()
            .position(|p| p == account)
            .ok_or(Error::Unauthorized)?;
        serde_json::to_vec(&serde_json::json!({"turn":s.players[s.turn],"turns":s.turns,"total":s.total,"ownCard":s.hidden[index]})).map_err(|_|Error::Invalid)
    }
    fn can_spectate(&self, _state: &State, _account: &str) -> bool {
        true // The fixture world admission is the only spectator access list.
    }
    fn project_public(&self, s: &State) -> vl_persistence::Result<Vec<u8>> {
        serde_json::to_vec(
            &serde_json::json!({"turn":s.players[s.turn],"turns":s.turns,"total":s.total}),
        )
        .map_err(|_| Error::Invalid)
    }
}
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
enum Input {
    Create {
        id: Uuid,
        players: [String; 2],
    },
    Admit {
        ticket: String,
        label: String,
    },
    Execute {
        id: Uuid,
        command: Uuid,
        epoch: i64,
        version: i64,
        action: i64,
        label: String,
    },
    Projection {
        id: Uuid,
        label: String,
    },
    OwnerProbe,
    Race {
        id: Uuid,
        label: String,
        version: i64,
        duplicate: bool,
    },
}
fn answer(result: vl_persistence::Result<vl_persistence::Receipt>) -> serde_json::Value {
    match result {
        Ok(r) => {
            let reward = r.reward.map(|status| match status {
                RewardStatus::Pending => "REWARD_PENDING",
                RewardStatus::Granted => "GRANTED",
                RewardStatus::Declined => "DECLINED",
            });
            serde_json::json!({"ok":true,"epoch":r.epoch,"version":r.version,"projection":serde_json::from_slice::<serde_json::Value>(&r.projection).unwrap(),"bytes":r.projection,"reward":reward})
        }
        Err(error) => serde_json::json!({"ok":false,"error":format!("{error:?}")}),
    }
}
#[tokio::main]
async fn main() {
    let f: Fixture =
        serde_json::from_slice(&fs::read(std::env::args().nth(1).unwrap()).unwrap()).unwrap();
    let config: tokio_postgres::Config =
        std::env::var("TEST_DATABASE_URL").unwrap().parse().unwrap();
    assert!(
        config
            .get_dbname()
            .unwrap()
            .starts_with("virtual_city_test")
    );
    assert!(config.get_hosts().iter().all(|h|matches!(h,tokio_postgres::config::Host::Tcp(n) if ["127.0.0.1","localhost","::1"].contains(&n.as_str()))));
    let ca = fs::read(&f.ca_file).unwrap();
    let scope = || Scope {
        world: f.world.clone(),
        boot: f.boot,
        engine: [0x27; 32],
    };
    let owner = Owner::acquire(&config, &ca, &f.expected_role, scope())
        .await
        .expect("Owner unavailable");
    let host = Host::new(
        FixtureGame,
        Keys::new(f.active_key, f.storage_keys).unwrap(),
        owner,
    )
    .unwrap();
    let trust = DurableTrust::new(
        TicketVerifier::new(
            f.public_keys
                .iter()
                .map(|(id, key)| (id.clone(), DecodingKey::from_ed_components(key).unwrap()))
                .collect(),
            RuntimeScope {
                world: f.world.clone(),
                boot: f.boot.to_string(),
                content: "17".repeat(32),
            },
        )
        .unwrap(),
    );
    let (mut db, driver) = connect_runtime_postgres(&config, &ca, &f.expected_role)
        .await
        .unwrap();
    let mut sessions: BTreeMap<String, DurableSession> = BTreeMap::new();
    println!("READY");
    io::stdout().flush().unwrap();
    loop {
        let mut line = String::new();
        if io::stdin().read_line(&mut line).unwrap() == 0 {
            break;
        }
        let input: Input = serde_json::from_str(&line).unwrap();
        let output = match input {
            Input::Create { id, players } => match host
                .create(
                    &mut db,
                    id,
                    State {
                        players,
                        turn: 0,
                        turns: 0,
                        total: 0,
                        hidden: [411001, 822002],
                    },
                )
                .await
            {
                Ok(()) => serde_json::json!({"ok":true}),
                Err(e) => serde_json::json!({"ok":false,"error":format!("{e:?}")}),
            },
            Input::Admit { ticket, label } => match trust.admit(&mut db, &ticket).await {
                Ok(session) => {
                    sessions.insert(label, session);
                    serde_json::json!({"ok":true})
                }
                Err(e) => serde_json::json!({"ok":false,"error":format!("{e:?}")}),
            },
            Input::Execute {
                id,
                command,
                epoch,
                version,
                action,
                label,
            } => answer(
                host.execute(
                    &mut db,
                    &trust,
                    &sessions[&label],
                    Request {
                        match_id: id,
                        command_id: command,
                        epoch,
                        expected_version: version,
                        action: Value::Int(action),
                    },
                )
                .await,
            ),
            Input::Projection { id, label } => answer(
                host.projection(&mut db, &trust, &sessions[&label], id)
                    .await,
            ),
            Input::OwnerProbe => {
                serde_json::json!({"ok":matches!(Owner::acquire(&config,&ca,&f.expected_role,scope()).await,Err(Error::Conflict))})
            }
            Input::Race {
                id,
                label,
                version,
                duplicate,
            } => {
                let (mut other, other_driver) =
                    connect_runtime_postgres(&config, &ca, &f.expected_role)
                        .await
                        .unwrap();
                let command = Uuid::new_v4();
                let first = Request {
                    match_id: id,
                    command_id: command,
                    epoch: 1,
                    expected_version: version,
                    action: Value::Int(1),
                };
                let second = Request {
                    match_id: id,
                    command_id: if duplicate { command } else { Uuid::new_v4() },
                    epoch: 1,
                    expected_version: version,
                    action: Value::Int(1),
                };
                let (a, b) = tokio::join!(
                    host.execute(&mut db, &trust, &sessions[&label], first),
                    host.execute(&mut other, &trust, &sessions[&label], second)
                );
                other_driver.abort();
                serde_json::json!({"results":[answer(a),answer(b)]})
            }
        };
        println!("{output}");
        io::stdout().flush().unwrap();
    }
    driver.abort();
}
