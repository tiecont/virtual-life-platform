use super::application::{INTENT_KIND, VIEW_KIND};
use super::domain::{Rules, State, content_hash};
use crate::features::runtime::application::NativeGame;
use aetheria_game_core::{
    Command, Error as CoreError, LogicalClock, Reducer, SecretSeed, apply, begin,
};
use aetheria_persistence::{Completion, Game};
use aetheria_pet_arena::arena8::binding::{
    self, Allocation, ArtifactSelection, ArtifactStat, StatEffect,
};
use aetheria_pet_arena::arena8::{
    Action, CombatEvent, Phase, SIGNATURE_MANA, SIGNATURE_RAGE, SKILL_MANA, ULTIMATE_MANA,
    ULTIMATE_RAGE,
};

const ACCOUNT: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNED: &str = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATCH: [u8; 16] = [9; 16];

fn clock(version: u64) -> LogicalClock {
    LogicalClock {
        server_tick: version + 1,
        logical_time_ms: (version + 1) * 1000,
    }
}

fn rules(pet: &str, level: u8, encounter: &str, artifacts: &[(&str, u8)]) -> Rules {
    Rules::allocate(Allocation {
        account: ACCOUNT.into(),
        owned_pet_id: OWNED.into(),
        pet_id: pet.into(),
        level,
        encounter_id: encounter.into(),
        artifacts: artifacts
            .iter()
            .map(|(definition_id, upgrade_level)| ArtifactSelection {
                definition_id: (*definition_id).into(),
                upgrade_level: *upgrade_level,
            })
            .collect(),
    })
    .unwrap()
}

fn choose(state: &aetheria_pet_arena::arena8::State, skills: &[binding::SkillId]) -> Action {
    if state.phase() == Phase::Ready {
        return Action::Start;
    }
    if state.cooldown() == 0 {
        if skills.contains(&binding::SkillId::Ultimate)
            && state.mana() >= ULTIMATE_MANA
            && state.rage() >= ULTIMATE_RAGE
        {
            return Action::Ultimate;
        }
        if skills.contains(&binding::SkillId::Signature)
            && state.mana() >= SIGNATURE_MANA
            && state.rage() >= SIGNATURE_RAGE
        {
            return Action::Signature;
        }
        if skills.contains(&binding::SkillId::SharedSkill) && state.mana() >= SKILL_MANA {
            return Action::Skill;
        }
    }
    let legal = state.board().legal_move().expect("settled board");
    Action::Swap {
        first: legal.first,
        second: legal.second,
    }
}

struct Run {
    state_hashes: Vec<[u8; 32]>,
    events: Vec<Vec<CombatEvent>>,
    settlements: usize,
    terminal: Phase,
    final_state: State,
}

fn drive(rules: &Rules, seed_byte: u8) -> Run {
    let seed = SecretSeed::from_host_entropy([seed_byte; 32]);
    let skills = rules.snapshot().skills().to_vec();
    let mut checkpoint = begin(rules, MATCH, rules.initial().unwrap(), &seed, clock(0)).unwrap();
    let mut state_hashes = Vec::new();
    let mut events = Vec::new();
    let mut settlements = 0;
    loop {
        let phase = checkpoint.state.bound.core().phase();
        if phase.terminal() {
            break;
        }
        let version = checkpoint.version;
        let transition = apply(
            rules,
            &checkpoint,
            &Command {
                id: [u8::try_from(version + 1).unwrap(); 16],
                match_id: MATCH,
                expected_version: version,
                ruleset: rules.ruleset(),
                action: choose(checkpoint.state.bound.core(), &skills),
            },
            &seed,
            clock(version + 1),
        )
        .unwrap();
        let terminal_next = transition.next.state.bound.core().phase().terminal();
        assert_eq!(transition.settlement.is_some(), terminal_next);
        if terminal_next {
            settlements += 1;
        }
        state_hashes.push(transition.next.state.bound.hash());
        events.push(
            transition
                .events
                .iter()
                .map(|value| CombatEvent::from_canonical(value).unwrap())
                .collect(),
        );
        checkpoint = transition.next;
    }
    Run {
        state_hashes,
        events,
        settlements,
        terminal: checkpoint.state.bound.core().phase(),
        final_state: checkpoint.state,
    }
}

#[test]
fn intents_carry_only_an_epoch_and_an_action() {
    let rules = rules("fire-coalwhisk", 20, "cinder-terraces-regular", &[]);
    assert_eq!(rules.interaction(INTENT_KIND), Some("pet-arena"));
    assert_eq!(rules.interaction(VIEW_KIND), None);
    assert_eq!(rules.view_kind(), VIEW_KIND);
    assert_eq!(
        rules
            .parse(INTENT_KIND, br#"{"epoch":1,"action":{"kind":"start"}}"#)
            .unwrap()
            .0,
        1
    );
    for payload in [
        br#"{"epoch":1,"action":{"kind":"swap","first":2,"second":10}}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"skill"}}"#,
        br#"{"epoch":1,"action":{"kind":"signature"}}"#,
        br#"{"epoch":1,"action":{"kind":"fireZone"}}"#,
        br#"{"epoch":1,"action":{"kind":"ultimate"}}"#,
        br#"{"epoch":1,"action":{"kind":"guard"}}"#,
    ] {
        assert!(rules.parse(INTENT_KIND, payload).is_ok(), "valid intent");
    }
    for payload in [
        br#"{"epoch":1,"action":{"kind":"start","reward":9000}}"#.as_slice(),
        br#"{"epoch":1,"action":{"kind":"start","seed":"deadbeef"}}"#,
        br#"{"epoch":1,"action":{"kind":"start","damage":9999}}"#,
        br#"{"epoch":1,"action":{"kind":"swap","first":2,"second":10,"target":0}}"#,
        br#"{"epoch":1,"action":{"kind":"swap","first":256,"second":10}}"#,
        br#"{"epoch":1,"action":{"kind":"reward"}}"#,
        br#"{"action":{"kind":"start"}}"#,
        br#"{"epoch":1,"action":{"kind":"start"},"loadout":[]}"#,
    ] {
        assert!(rules.parse(INTENT_KIND, payload).is_err(), "forged intent");
    }
    assert!(
        rules
            .parse("pet.intent.v1", br#"{"epoch":1,"action":{"kind":"start"}}"#)
            .is_err()
    );
}

#[test]
fn projection_is_authored_and_excludes_secrets_and_the_account() {
    let rules = rules(
        "fire-coalwhisk",
        20,
        "cinder-terraces-regular",
        &[("core-emberglass", 1), ("rune-whisperknot", 5)],
    );
    let state = rules.initial().unwrap();
    assert!(!rules.member(&state, "intruder"));
    assert!(!rules.can_spectate(&state, "intruder"));
    assert!(rules.project(&state, "intruder").is_err());
    let bytes = rules.project(&state, ACCOUNT).unwrap();
    let projection: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let text = String::from_utf8(bytes).unwrap();
    assert!(!text.contains(ACCOUNT));
    assert!(!text.contains("seed"));
    assert_eq!(projection["schemaVersion"], 1);
    assert_eq!(projection["pet"]["id"], "fire-coalwhisk");
    assert_eq!(projection["pet"]["level"], 20);
    assert_eq!(projection["pet"]["ownedPetId"], OWNED);
    assert_eq!(projection["ruleset"]["id"], "arena8-pve");
    assert_eq!(projection["ruleset"]["version"], 1);
    assert_eq!(
        projection["ruleset"]["contentHash"],
        content_hash()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    assert_eq!(projection["ruleset"]["bindingVersion"], 1);
    assert_eq!(
        projection["stats"]["effective"]["health"],
        u64::from(blob(&state).effective().health)
    );
    assert_eq!(projection["board"].as_array().unwrap().len(), 64);
    assert_eq!(projection["phase"], "ready");
    assert!(projection["telegraph"].is_null());
    assert_eq!(projection["artifacts"].as_array().unwrap().len(), 2);
    assert_eq!(projection["modifiers"]["speed"]["active"], false);
    assert_eq!(projection["modifiers"]["speed"]["effect"], "inactive");
    assert_eq!(projection["modifiers"]["attack"]["active"], true);
    assert_eq!(
        binding::stat_semantics(ArtifactStat::Speed).effect,
        StatEffect::Inactive
    );
    // Lv20 in this ruleset version unlocks only the reserved power-skill
    // milestone; Signature (Lv40) and Ultimate (Lv60) stay locked.
    assert_eq!(
        projection["skills"],
        serde_json::json!(["shared-skill", "guard"])
    );
}

fn blob(state: &State) -> &binding::MatchSnapshot {
    state.bound.snapshot()
}

#[test]
fn full_matches_settle_once_and_replay_identically() {
    let rules = rules("pet-v3-fire-icarus", 20, "cinder-terraces-boss", &[]);
    let first = drive(&rules, 7);
    let second = drive(&rules, 7);
    assert_eq!(first.state_hashes, second.state_hashes);
    assert_eq!(first.events, second.events);
    assert_eq!(first.settlements, 1);
    assert_eq!(first.terminal, second.terminal);
    let completion = rules.completion(&first.final_state).unwrap();
    assert!(matches!(
        completion,
        Completion::PetArena { won } if won == (first.terminal == Phase::Won)
    ));
    let other_seed = drive(&rules, 8);
    assert_ne!(first.state_hashes, other_seed.state_hashes);
}

#[test]
fn a_later_loadout_cannot_rewrite_an_allocated_match() {
    let allocated = rules("fire-coalwhisk", 20, "cinder-terraces-regular", &[]);
    let state = allocated.initial().unwrap();
    let encoded = allocated.encode(&state).unwrap();
    assert_eq!(
        allocated.decode(&encoded).unwrap().bound.hash(),
        state.bound.hash()
    );

    let geared = rules(
        "fire-coalwhisk",
        20,
        "cinder-terraces-regular",
        &[("core-emberglass", 1)],
    );
    assert!(geared.snapshot().digest() != allocated.snapshot().digest());
    assert!(geared.decode(&encoded).is_err());

    let foreign = Rules::allocate(Allocation {
        account: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".into(),
        ..Allocation {
            account: ACCOUNT.into(),
            owned_pet_id: OWNED.into(),
            pet_id: "fire-coalwhisk".into(),
            level: 20,
            encounter_id: "cinder-terraces-regular".into(),
            artifacts: vec![],
        }
    })
    .unwrap();
    assert!(foreign.decode(&encoded).is_err());
}

#[test]
fn stale_and_duplicate_command_paths_fail_closed() {
    let rules = rules("water-dewskip", 20, "tideglass-lagoon-regular", &[]);
    let seed = SecretSeed::from_host_entropy([11; 32]);
    let checkpoint = begin(&rules, MATCH, rules.initial().unwrap(), &seed, clock(0)).unwrap();
    let started = Command {
        id: [1; 16],
        match_id: MATCH,
        expected_version: 0,
        ruleset: rules.ruleset(),
        action: Action::Start,
    };
    let command = started;
    // Stale expected version.
    let stale = apply(
        &rules,
        &checkpoint,
        &Command {
            id: [2; 16],
            match_id: MATCH,
            expected_version: 1,
            ruleset: rules.ruleset(),
            action: Action::Start,
        },
        &seed,
        clock(1),
    );
    assert!(matches!(stale, Err(CoreError::VersionConflict)));
    // Lost-ACK retry of the same command recomputes an identical transition.
    let first = apply(&rules, &checkpoint, &command, &seed, clock(1)).unwrap();
    let retry = apply(&rules, &checkpoint, &command, &seed, clock(1)).unwrap();
    assert_eq!(first.next.audit_hash, retry.next.audit_hash);
    assert_eq!(first.next.state.bound.hash(), retry.next.state.bound.hash());
    assert_eq!(first.audit_record, retry.audit_record);
    // A committed version can no longer be replayed as the next command.
    let after = apply(
        &rules,
        &first.next,
        &Command {
            id: [1; 16],
            match_id: MATCH,
            expected_version: 0,
            ruleset: rules.ruleset(),
            action: Action::Start,
        },
        &seed,
        clock(1),
    );
    assert!(matches!(after, Err(CoreError::VersionConflict)));
    // Duplicate command-id collision itself is enforced by the durable Host
    // receipt table (PostgreSQL); that path is not exercised by this unit test.
}

#[test]
fn adapter_digest_is_distinct_from_the_frozen_v1_adapter() {
    assert_eq!(content_hash(), content_hash());
    assert_ne!(
        content_hash(),
        crate::features::pet_arena::domain::content_hash()
    );
    let rules = rules("ground-clodkin", 1, "ochre-labyrinth-regular", &[]);
    let ruleset = rules.ruleset();
    assert_eq!(ruleset.id, "arena8-pve");
    assert_eq!(ruleset.version, 1);
    assert_eq!(ruleset.content_hash, content_hash());
    assert_eq!(ruleset.rng_version, 1);
    assert_ne!(ruleset.id.as_str(), "pet-arena-pve");
}
