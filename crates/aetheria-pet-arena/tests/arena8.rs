use aetheria_game_core::{
    Command, Error as CoreError, LogicalClock, Reducer, SecretSeed, apply, begin,
};
use aetheria_pet_arena::arena8::{
    Ability, Action, Arena8, Arena8Engine, Arena8Error, CELLS, CombatEvent, ENCOUNTERS,
    EnemyIntentKind, ICARUS, MAX_SUBMISSIONS, MAX_TURNS, Phase, SIGNATURE_MANA, SIGNATURE_RAGE,
    SKILL_MANA, State, ULTIMATE_MANA, ULTIMATE_RAGE,
};

const MATCH: [u8; 16] = [42; 16];

fn clock(version: u64) -> LogicalClock {
    LogicalClock {
        server_tick: version + 1,
        logical_time_ms: (version + 1) * 1000,
    }
}

fn seed(byte: u8) -> SecretSeed {
    SecretSeed::from_host_entropy([byte; 32])
}

struct Driver {
    engine: Arena8Engine,
    next_id: u8,
    accepted: Vec<([u8; 16], u64, Action)>,
}

impl Driver {
    fn new(pet: u8, encounter: u8, seed_byte: u8) -> Self {
        Self {
            engine: Arena8Engine::new(seed(seed_byte), MATCH, pet, encounter, clock(0)).unwrap(),
            next_id: 1,
            accepted: Vec::new(),
        }
    }

    fn submit(&mut self, action: Action) -> Result<Vec<CombatEvent>, Arena8Error> {
        let id = [self.next_id; 16];
        self.next_id = self.next_id.saturating_add(1);
        let version = self.engine.version();
        let events = self.engine.submit(id, version, action, clock(version))?;
        self.accepted.push((id, version, action));
        Ok(events)
    }

    fn start(&mut self) -> Vec<CombatEvent> {
        self.submit(Action::Start).unwrap()
    }

    fn state(&self) -> &State {
        self.engine.state()
    }
}

fn choose_attack(state: &State) -> Action {
    if state.cooldown() == 0 {
        if state.mana() >= ULTIMATE_MANA && state.rage() >= ULTIMATE_RAGE {
            return Action::Ultimate;
        }
        if state.mana() >= SIGNATURE_MANA && state.rage() >= SIGNATURE_RAGE {
            return if usize::from(state.pet()) == ICARUS {
                Action::FireZone
            } else {
                Action::Signature
            };
        }
        if state.mana() >= SKILL_MANA {
            return Action::Skill;
        }
    }
    let legal = state
        .board()
        .legal_move()
        .expect("a settled board always has a legal move");
    Action::Swap {
        first: legal.first,
        second: legal.second,
    }
}

fn finish_with<F: Fn(&State) -> Action>(mut driver: Driver, choose: F) -> Driver {
    if driver.state().phase() == Phase::Ready {
        driver.start();
    }
    let mut guard = 0;
    while driver.state().phase() == Phase::Playing {
        guard += 1;
        assert!(guard <= u32::from(MAX_TURNS) + 1, "turn cap not enforced");
        let action = choose(driver.state());
        driver.submit(action).unwrap();
        assert_eq!(driver.state().board().cells().len(), CELLS);
        assert!(!driver.state().board().has_matches());
        assert!(driver.state().board().legal_move().is_some());
    }
    driver
}

#[test]
fn seeded_initialization_is_settled_playable_and_reproducible() {
    let mut first = Driver::new(ICARUS as u8, 0, 7);
    let events = first.start();
    assert!(
        events
            .iter()
            .any(|event| matches!(event, CombatEvent::BoardInitialized { .. }))
    );
    assert!(events.iter().any(|event| matches!(
        event,
        CombatEvent::EnemyIntentAnnounced { intent } if intent.resolves_turn == 1
    )));
    assert_eq!(first.state().board().cells().len(), 64);
    assert!(!first.state().board().has_matches());
    assert!(first.state().board().legal_move().is_some());
    assert_eq!(first.state().turn(), 0);
    assert_eq!(first.state().phase(), Phase::Playing);
    let mut second = Driver::new(ICARUS as u8, 0, 7);
    second.start();
    assert_eq!(first.state().hash(), second.state().hash());
    assert_eq!(
        first.engine.replay().digest(),
        second.engine.replay().digest()
    );
    let mut different = Driver::new(ICARUS as u8, 0, 8);
    different.start();
    assert_ne!(first.state().hash(), different.state().hash());
}

#[test]
fn icarus_fire_zone_ticks_exactly_the_two_following_turns() {
    let mut driver = Driver::new(ICARUS as u8, 1, 43);
    driver.start();
    let mut cast_turn = None;
    let mut ticks = 0;
    let mut guard = 0;
    while driver.state().phase() == Phase::Playing && guard < 12 {
        guard += 1;
        let cast = cast_turn.is_none()
            && driver.state().cooldown() == 0
            && driver.state().mana() >= SIGNATURE_MANA
            && driver.state().rage() >= SIGNATURE_RAGE;
        let action = if cast {
            Action::FireZone
        } else {
            let legal = driver.state().board().legal_move().unwrap();
            Action::Swap {
                first: legal.first,
                second: legal.second,
            }
        };
        let events = driver.submit(action).unwrap();
        let ticked = events
            .iter()
            .filter(|event| matches!(event, CombatEvent::FireZoneTicked { .. }))
            .count();
        if cast {
            cast_turn = Some(driver.state().turn());
            assert_eq!(ticked, 0, "the cast turn must not tick");
        } else if let Some(cast) = cast_turn {
            let offset = u32::from(driver.state().turn() - cast);
            if offset <= 2 {
                assert_eq!(ticked, 1, "turn {offset} after the cast must tick");
                ticks += 1;
            } else {
                assert_eq!(ticked, 0, "the zone lasts exactly two turns");
            }
        }
        if cast_turn.is_some_and(|cast| driver.state().turn() > cast + 2) {
            break;
        }
    }
    assert!(
        cast_turn.is_some(),
        "the fight ended before FIRE_ZONE was cast"
    );
    assert_eq!(ticks, 2);
}

#[test]
fn signature_and_ultimate_are_reachable_without_injected_resources() {
    let driver = finish_with(Driver::new(4, 1, 37), |state| {
        if state.cooldown() == 0 && state.mana() >= SIGNATURE_MANA && state.rage() >= SIGNATURE_RAGE
        {
            return Action::Signature;
        }
        let legal = state.board().legal_move().unwrap();
        Action::Swap {
            first: legal.first,
            second: legal.second,
        }
    });
    let mut abilities = Vec::new();
    for entry in &driver.engine.replay().entries {
        for event in &entry.events {
            if let CombatEvent::AbilityUsed { ability, .. } = event {
                abilities.push(*ability);
            }
        }
    }
    assert!(abilities.contains(&Ability::Signature), "{abilities:?}");

    let driver = finish_with(Driver::new(4, 1, 41), |state| {
        if state.cooldown() == 0 && state.mana() >= ULTIMATE_MANA && state.rage() >= ULTIMATE_RAGE {
            return Action::Ultimate;
        }
        let legal = state.board().legal_move().unwrap();
        Action::Swap {
            first: legal.first,
            second: legal.second,
        }
    });
    let mut abilities = Vec::new();
    for entry in &driver.engine.replay().entries {
        for event in &entry.events {
            if let CombatEvent::AbilityUsed { ability, .. } = event {
                abilities.push(*ability);
            }
        }
    }
    assert!(abilities.contains(&Ability::Ultimate), "{abilities:?}");
}

#[test]
fn regular_encounter_can_be_won_with_bounded_turns_and_typed_events() {
    let driver = finish_with(Driver::new(ICARUS as u8, 0, 11), choose_attack);
    assert_eq!(driver.state().phase(), Phase::Won);
    assert_eq!(driver.state().enemy_health(), 0);
    assert!(driver.state().health() > 0);
    assert!(driver.state().turn() <= MAX_TURNS);
    assert_eq!(
        driver.accepted.len(),
        usize::from(driver.state().turn()) + 1
    );
    let replay = driver.engine.replay();
    assert_eq!(replay.entries.len(), driver.accepted.len());
    for entry in &replay.entries {
        for event in &entry.events {
            let json = serde_json::to_string(event).unwrap();
            let decoded: CombatEvent = serde_json::from_str(&json).unwrap();
            assert_eq!(&decoded, event);
        }
    }
    let json = serde_json::to_string(&replay).unwrap();
    let decoded: aetheria_pet_arena::arena8::Replay = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.digest(), replay.digest());
}

#[test]
fn boss_encounters_are_distinct_and_use_the_heavy_schedule() {
    assert!(ENCOUNTERS[1].boss);
    assert!(!ENCOUNTERS[0].boss);
    let mut driver = Driver::new(ICARUS as u8, 1, 13);
    driver.start();
    let mut saw_heavy = false;
    let mut saw_enraged = false;
    let mut guard = 0;
    while driver.state().phase() == Phase::Playing {
        guard += 1;
        assert!(guard <= u32::from(MAX_TURNS) + 1);
        for event in driver.submit(choose_attack(driver.state())).unwrap() {
            match event {
                CombatEvent::EnemyIntentAnnounced { intent }
                    if intent.kind == EnemyIntentKind::Heavy =>
                {
                    saw_heavy = true;
                }
                CombatEvent::EnemyAttack { enraged, .. } if enraged => saw_enraged = true,
                _ => {}
            }
        }
    }
    assert!(saw_heavy);
    assert!(driver.state().phase().terminal());
    assert_eq!(saw_enraged, driver.state().turn() > 1);
}

#[test]
fn turn_cap_is_a_loss_and_terminal_commands_are_rejected() {
    let mut driver = Driver::new(4, 0, 17);
    driver.start();
    let mut guard = 0;
    while driver.state().phase() == Phase::Playing {
        guard += 1;
        assert!(guard <= u32::from(MAX_TURNS) + 1);
        driver.submit(Action::Guard).unwrap();
    }
    assert_eq!(driver.state().phase(), Phase::Lost);
    assert_eq!(driver.state().turn(), MAX_TURNS);
    assert!(driver.state().health() > 0);
    assert!(driver.state().enemy_health() > 0);
    assert_eq!(
        driver.submit(Action::Guard),
        Err(Arena8Error::MatchComplete)
    );
}

#[test]
fn hp_zero_loss_is_reported_before_the_turn_cap() {
    let driver = finish_with(Driver::new(2, 11, 19), |state| {
        let legal = state.board().legal_move().unwrap();
        Action::Swap {
            first: legal.first,
            second: legal.second,
        }
    });
    assert_eq!(driver.state().phase(), Phase::Lost);
    assert_eq!(driver.state().health(), 0);
    assert!(driver.state().turn() < MAX_TURNS);
}

#[test]
fn duplicate_stale_zero_and_invalid_commands_do_not_change_committed_state() {
    let mut driver = Driver::new(0, 0, 23);
    driver.start();
    let before = driver.state().hash();
    let duplicate = driver.engine.submit([1; 16], 1, Action::Guard, clock(1));
    assert_eq!(duplicate, Err(Arena8Error::DuplicateCommand));
    let stale = driver.engine.submit([90; 16], 0, Action::Guard, clock(1));
    assert_eq!(stale, Err(Arena8Error::StaleCommand));
    let zero = driver.engine.submit([0; 16], 1, Action::Guard, clock(1));
    assert_eq!(zero, Err(Arena8Error::InvalidCommandId));
    let invalid = driver.engine.submit(
        [91; 16],
        1,
        Action::Swap {
            first: 64,
            second: 0,
        },
        clock(1),
    );
    assert_eq!(invalid, Err(Arena8Error::Core(CoreError::InvalidAction)));
    assert_eq!(driver.state().hash(), before);
    assert_eq!(driver.engine.version(), 1);
    let mut attempts = 0;
    loop {
        attempts += 1;
        assert!(attempts < 300);
        let mut id = [0xAA; 16];
        id[0] = 1;
        id[1] = attempts as u8;
        if driver.engine.submit(id, 0, Action::Guard, clock(1)) == Err(Arena8Error::CommandLimit) {
            break;
        }
    }
    assert!(attempts > 0);
    assert!(driver.engine.submissions() >= MAX_SUBMISSIONS);
}

#[test]
fn replay_is_immutable_serializable_and_reproduces_the_full_match() {
    let mut original = Driver::new(ICARUS as u8, 0, 29);
    original.start();
    let early = original.engine.replay();
    let early_digest = early.digest();
    let early_state = original.engine.state_hash();
    let mut guard = 0;
    while original.state().phase() == Phase::Playing {
        guard += 1;
        assert!(guard <= u32::from(MAX_TURNS) + 1);
        original.submit(choose_attack(original.state())).unwrap();
    }
    assert_eq!(early.digest(), early_digest);
    assert_eq!(early.final_state_hash, early_state);
    let final_replay = original.engine.replay();
    let mut replayed = Driver::new(ICARUS as u8, 0, 29);
    for (id, version, action) in &original.accepted {
        replayed
            .engine
            .submit(*id, *version, *action, clock(*version))
            .unwrap();
    }
    assert_eq!(replayed.state().hash(), original.state().hash());
    assert_eq!(replayed.engine.replay().digest(), final_replay.digest());
    let json = serde_json::to_string(&final_replay).unwrap();
    let decoded: aetheria_pet_arena::arena8::Replay = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.digest(), final_replay.digest());
    let mut different = Driver::new(ICARUS as u8, 0, 30);
    different.start();
    assert_ne!(different.engine.replay().digest(), final_replay.digest());
}

#[test]
fn reducer_settlement_is_always_none_and_actions_carry_no_client_results() {
    let seed = seed(31);
    let checkpoint = begin(&Arena8, MATCH, State::new(0, 0).unwrap(), &seed, clock(0)).unwrap();
    let command = Command {
        id: [51; 16],
        match_id: MATCH,
        expected_version: 0,
        ruleset: Arena8.ruleset(),
        action: Action::Start,
    };
    let transition = apply(&Arena8, &checkpoint, &command, &seed, clock(1)).unwrap();
    assert!(transition.settlement.is_none());
    let decoded: Vec<CombatEvent> = transition
        .events
        .iter()
        .map(CombatEvent::from_canonical)
        .collect::<Result<_, _>>()
        .unwrap();
    assert!(
        decoded
            .iter()
            .any(|event| matches!(event, CombatEvent::BoardInitialized { .. }))
    );
    for action in [
        Action::Start,
        Action::Swap {
            first: 2,
            second: 10,
        },
        Action::Skill,
        Action::Signature,
        Action::FireZone,
        Action::Ultimate,
        Action::Guard,
    ] {
        let json = serde_json::to_value(action).unwrap();
        let rendered = json.to_string();
        for forbidden in ["seed", "damage", "outcome", "reward", "rng"] {
            assert!(!rendered.contains(forbidden), "{rendered}");
        }
    }
    let swap = serde_json::to_value(Action::Swap {
        first: 2,
        second: 10,
    })
    .unwrap();
    assert_eq!(swap["swap"]["first"], 2);
    assert_eq!(swap["swap"]["second"], 10);
}

#[test]
fn six_campaign_regular_encounters_resolve_and_replay() {
    let maps = [
        "cinder-terraces",
        "tideglass-lagoon",
        "stormcoil-fields",
        "lantern-necropolis",
        "ochre-labyrinth",
        "dawn-prism-sanctum",
    ];
    for map in maps {
        let id = format!("{map}-regular");
        let encounter = ENCOUNTERS
            .iter()
            .position(|entry| entry.id == id && !entry.boss)
            .unwrap_or_else(|| panic!("missing {id}"));
        let play = || {
            finish_with(
                Driver::new(ICARUS as u8, encounter as u8, 11),
                choose_attack,
            )
        };
        let first = play();
        assert!(first.state().phase().terminal(), "{id}");
        assert_eq!(
            first.engine.replay().digest(),
            play().engine.replay().digest(),
            "{id}"
        );
        println!(
            "{id}: {:?} after {} turns",
            first.state().phase(),
            first.state().turn()
        );
    }
}
