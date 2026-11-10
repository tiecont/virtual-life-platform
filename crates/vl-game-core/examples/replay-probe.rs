mod support;
use support::{Fixture, State};
use vl_game_core::{Command, Fixed, LogicalClock, Reducer, SecretSeed, Value, apply, begin};

fn main() -> Result<(), vl_game_core::Error> {
    let rules = Fixture;
    let seed = SecretSeed::from_host_entropy([7; 32]);
    let mut state = begin(
        &rules,
        [1; 16],
        State {
            total: Fixed::from_raw(0),
            hidden_roll: 0,
        },
        &seed,
        LogicalClock {
            server_tick: 0,
            logical_time_ms: 1000,
        },
    )?;
    for (index, amount) in [1, 7, 1000, 38, 19].into_iter().enumerate() {
        let command = Command {
            id: [index as u8 + 1; 16],
            match_id: [1; 16],
            expected_version: index as u64,
            ruleset: rules.ruleset(),
            action: Value::Int(amount),
        };
        let transition = apply(
            &rules,
            &state,
            &command,
            &seed,
            LogicalClock {
                server_tick: index as u64 + 1,
                logical_time_ms: 1001 + index as u64,
            },
        )?;
        for byte in transition.next.audit_hash {
            print!("{byte:02x}");
        }
        println!();
        state = transition.next;
    }
    Ok(())
}
