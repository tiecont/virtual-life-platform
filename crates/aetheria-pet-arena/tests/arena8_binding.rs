use aetheria_game_core::{Command, LogicalClock, Reducer, SecretSeed, apply, begin};
use aetheria_pet_arena::arena8::binding::{
    self, ACTIVE_IDENTITY_COUNT, Allocation, ArtifactModifiers, ArtifactSelection, ArtifactStat,
    BINDING_DIGEST, BINDING_ID, BINDING_VERSION, BindingError, CANDIDATE_IDENTITY_COUNT,
    IDENTITIES, MAX_LEVEL, MIN_LEVEL, MatchSnapshot, PetIdentity, Readiness, RosterState, SkillId,
    StatEffect,
};
use aetheria_pet_arena::arena8::{
    Action, Arena8Bound, BoundState, CombatEvent, Phase, SIGNATURE_MANA, SIGNATURE_RAGE,
    SKILL_MANA, ULTIMATE_MANA, ULTIMATE_RAGE,
};

const ACCOUNT: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNED: &str = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATCH: [u8; 16] = [7; 16];

fn clock(version: u64) -> LogicalClock {
    LogicalClock {
        server_tick: version + 1,
        logical_time_ms: (version + 1) * 1000,
    }
}

fn allocation(pet: &str, level: u8, encounter: &str, artifacts: &[(&str, u8)]) -> Allocation {
    Allocation {
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
    }
}

fn snapshot(pet: &str, level: u8, encounter: &str, artifacts: &[(&str, u8)]) -> MatchSnapshot {
    allocation(pet, level, encounter, artifacts).bind().unwrap()
}

struct Outcome {
    phase: Phase,
    turn: u8,
    hash: [u8; 32],
    damage: Vec<u32>,
}

fn choose(state: &aetheria_pet_arena::arena8::State, skills: &[SkillId]) -> Action {
    if state.phase() == Phase::Ready {
        return Action::Start;
    }
    if state.cooldown() == 0 {
        if skills.contains(&SkillId::Ultimate)
            && state.mana() >= ULTIMATE_MANA
            && state.rage() >= ULTIMATE_RAGE
        {
            return Action::Ultimate;
        }
        if skills.contains(&SkillId::Signature)
            && state.mana() >= SIGNATURE_MANA
            && state.rage() >= SIGNATURE_RAGE
        {
            return Action::Signature;
        }
        if skills.contains(&SkillId::SharedSkill) && state.mana() >= SKILL_MANA {
            return Action::Skill;
        }
    }
    let legal = state.board().legal_move().expect("settled board");
    Action::Swap {
        first: legal.first,
        second: legal.second,
    }
}

fn play(snapshot: MatchSnapshot, seed_byte: u8) -> Outcome {
    let seed = SecretSeed::from_host_entropy([seed_byte; 32]);
    let rules = Arena8Bound;
    let skills = snapshot.skills().to_vec();
    let mut checkpoint = begin(
        &rules,
        MATCH,
        BoundState::allocate(snapshot).unwrap(),
        &seed,
        clock(0),
    )
    .unwrap();
    let mut damage = Vec::new();
    loop {
        if checkpoint.state.core().phase().terminal() {
            break;
        }
        let action = choose(checkpoint.state.core(), &skills);
        let version = checkpoint.version;
        let transition = apply(
            &rules,
            &checkpoint,
            &Command {
                id: [u8::try_from(version + 1).unwrap(); 16],
                match_id: MATCH,
                expected_version: version,
                ruleset: rules.ruleset(),
                action,
            },
            &seed,
            clock(version + 1),
        )
        .unwrap();
        for value in &transition.events {
            match CombatEvent::from_canonical(value).unwrap() {
                CombatEvent::TilesCleared { damage: d, .. }
                | CombatEvent::AbilityUsed { damage: d, .. }
                | CombatEvent::FireZoneTicked { damage: d, .. } => damage.push(d),
                _ => {}
            }
        }
        checkpoint = transition.next;
    }
    Outcome {
        phase: checkpoint.state.core().phase(),
        turn: checkpoint.state.core().turn(),
        hash: checkpoint.state.hash(),
        damage,
    }
}

#[derive(serde::Deserialize)]
struct Roster {
    pets: Vec<RosterPet>,
}

#[derive(serde::Deserialize)]
struct RosterPet {
    id: String,
    name: String,
    family: String,
    element: String,
    #[serde(rename = "rosterState")]
    roster_state: String,
    #[serde(rename = "sourceCategory")]
    source_category: String,
}

fn roster() -> Roster {
    serde_json::from_str(include_str!(
        "../../../specs/pet-arena/wave-a-canonical-roster-v1.json"
    ))
    .unwrap()
}

fn element_name(element: aetheria_pet_arena::arena8::Element) -> &'static str {
    match element {
        aetheria_pet_arena::arena8::Element::Fire => "fire",
        aetheria_pet_arena::arena8::Element::Water => "water",
        aetheria_pet_arena::arena8::Element::Electric => "electric",
        aetheria_pet_arena::arena8::Element::Ghost => "ghost",
        aetheria_pet_arena::arena8::Element::Ground => "ground",
        aetheria_pet_arena::arena8::Element::Light => "light",
    }
}

#[test]
fn binding_matches_all_61_canonical_roster_identities_in_order() {
    let roster = roster();
    assert_eq!(roster.pets.len(), 61);
    assert_eq!(IDENTITIES.len(), 61);
    for (identity, expected) in IDENTITIES.iter().zip(roster.pets.iter()) {
        assert_eq!(identity.id, expected.id);
        assert_eq!(identity.name, expected.name);
        assert_eq!(identity.family, expected.family);
        assert_eq!(element_name(identity.element), expected.element);
        assert_eq!(
            identity.roster_state == RosterState::Active,
            expected.roster_state == "ACTIVE"
        );
        if expected.roster_state == "CANDIDATE" {
            assert_eq!(expected.source_category, "s_offrate_candidate");
        }
    }
    assert_eq!(binding::active_identities().count(), ACTIVE_IDENTITY_COUNT);
    assert_eq!(
        binding::candidate_identities().count(),
        CANDIDATE_IDENTITY_COUNT
    );
    assert_eq!(ACTIVE_IDENTITY_COUNT, 55);
    assert_eq!(CANDIDATE_IDENTITY_COUNT, 6);
}

#[test]
fn every_active_identity_binds_and_every_candidate_stays_gated() {
    let encounter = aetheria_pet_arena::arena8::ENCOUNTERS[0].id;
    for identity in binding::active_identities() {
        assert!(identity.profile.is_some(), "{} has no profile", identity.id);
        assert!(identity.readiness.bindable());
        for level in [MIN_LEVEL, 30, MAX_LEVEL] {
            let snapshot = allocation(identity.id, level, encounter, &[])
                .bind()
                .unwrap_or_else(|error| panic!("{} L{level} failed: {error:?}", identity.id));
            assert_eq!(snapshot.pet_id(), identity.id);
            assert_eq!(snapshot.effective(), snapshot.grown());
            assert!(snapshot.effective().health >= snapshot.base().health);
            assert!(snapshot.effective().attack >= snapshot.base().attack);
            assert!(snapshot.effective().defense >= snapshot.base().defense);
        }
    }
    for identity in binding::candidate_identities() {
        assert!(identity.profile.is_none());
        assert!(matches!(
            identity.readiness,
            Readiness::GatedCandidate { .. }
        ));
        match allocation(identity.id, MAX_LEVEL, encounter, &[]).bind() {
            Err(BindingError::Gated { action }) => {
                assert!(action.contains("OD-1"));
                assert!(action.contains("BLOCKED_OWNER_BANNER_DECISION"));
            }
            other => panic!("{} must stay gated, got {other:?}", identity.id),
        }
    }
    assert!(matches!(
        allocation("pet-s-ground-jadewarden", MAX_LEVEL, encounter, &[]).bind(),
        Err(BindingError::UnknownIdentity)
    ));
    assert!(binding::identity("pet-s-ground-jadewarden").is_none());
}

#[test]
fn playable_verification_slice_is_three_starters_icarus_one_dragon_one_bird() {
    let mut playable: Vec<&str> = binding::playable_identities()
        .map(|identity| identity.id)
        .collect();
    playable.sort_unstable();
    assert_eq!(
        playable,
        vec![
            "bird-fire-cinderquill",
            "dragon-fire-ignivar",
            "fire-coalwhisk",
            "ground-clodkin",
            "pet-v3-fire-icarus",
            "water-dewskip",
        ]
    );
    // Everything else active stays bindable but outside the verified slice.
    assert_eq!(
        binding::active_identities()
            .filter(|identity| identity.readiness == Readiness::Bound)
            .count(),
        49
    );
}

#[test]
fn distinct_identities_never_share_an_identical_base_statline() {
    let mut seen = std::collections::BTreeSet::new();
    for identity in binding::active_identities() {
        let profile = identity.profile.unwrap();
        assert!(
            seen.insert((
                profile.base.health,
                profile.base.attack,
                profile.base.defense
            )),
            "{} reuses another identity's base statline",
            identity.id
        );
    }
    assert_eq!(seen.len(), 55);
}

#[test]
fn growth_curves_are_shared_bounded_and_strictly_increasing() {
    let curves: std::collections::BTreeSet<&str> = binding::active_identities()
        .map(|identity| identity.profile.unwrap().growth.id)
        .collect();
    assert!(curves.len() <= binding::GROWTH_CURVES.len());
    assert_eq!(curves.len(), 5);
    for identity in binding::active_identities() {
        let profile = identity.profile.unwrap();
        let level_1 = profile.grown(MIN_LEVEL).unwrap();
        let level_60 = profile.grown(MAX_LEVEL).unwrap();
        assert_eq!(level_1, profile.base);
        assert!(level_60.health > level_1.health);
        assert!(level_60.attack > level_1.attack);
        assert!(level_60.defense > level_1.defense);
        assert!(level_60.health <= binding::MAX_COMBAT_HEALTH);
        assert!(level_60.attack <= binding::MAX_COMBAT_ATTACK);
        assert!(level_60.defense <= binding::MAX_COMBAT_DEFENSE);
        assert!(profile.grown(0).is_err());
        assert!(profile.grown(61).is_err());
    }
}

#[test]
fn an_identity_without_an_authored_profile_keeps_an_actionable_state() {
    let synthetic = PetIdentity {
        id: "fixture-pending-profile",
        name: "Fixture",
        family: "core",
        element: aetheria_pet_arena::arena8::Element::Fire,
        roster_state: RosterState::Active,
        readiness: Readiness::PendingProfile {
            action: "AUTHOR_A_PROFILE: no default statline is substituted",
        },
        profile: None,
    };
    assert_eq!(
        binding::bind_identity(&synthetic),
        Err(BindingError::PendingProfile {
            action: "AUTHOR_A_PROFILE: no default statline is substituted"
        })
    );
    let gated = PetIdentity {
        readiness: Readiness::GatedCandidate { action: "OD-1" },
        ..synthetic
    };
    assert_eq!(
        binding::bind_identity(&gated),
        Err(BindingError::Gated { action: "OD-1" })
    );
}

#[test]
fn artifact_semantics_apply_hp_attack_defense_and_explicitly_disable_speed() {
    assert_eq!(
        binding::stat_semantics(ArtifactStat::Hp).effect,
        StatEffect::Health
    );
    assert_eq!(
        binding::stat_semantics(ArtifactStat::Attack).effect,
        StatEffect::Attack
    );
    assert_eq!(
        binding::stat_semantics(ArtifactStat::Defense).effect,
        StatEffect::Defense
    );
    assert_eq!(
        binding::stat_semantics(ArtifactStat::Speed).effect,
        StatEffect::Inactive
    );
    assert!(
        binding::stat_semantics(ArtifactStat::Speed)
            .reason
            .contains("INACTIVE")
    );

    let plain = snapshot("fire-coalwhisk", 20, "cinder-terraces-regular", &[]);
    let geared = snapshot(
        "fire-coalwhisk",
        20,
        "cinder-terraces-regular",
        &[
            ("core-emberglass", 1),
            ("aegis-bastionplate", 5),
            ("rune-whisperknot", 5),
        ],
    );
    assert_eq!(plain.modifiers(), ArtifactModifiers::ZERO);
    assert_eq!(
        geared.modifiers(),
        ArtifactModifiers {
            hp: 20,
            attack: 12,
            defense: 9,
            speed: 7
        }
    );
    // speed is present and bounded but contributes nothing.
    assert_eq!(geared.grown().health + 20, geared.effective().health);
    assert_eq!(geared.grown().attack + 12, geared.effective().attack);
    assert_eq!(geared.grown().defense + 9, geared.effective().defense);
    assert!(geared.effective().health > plain.effective().health);
    assert!(geared.effective().attack > plain.effective().attack);
    assert!(geared.effective().defense > plain.effective().defense);
    // Artifact rank gates use pet level only, never presentation class.
    assert_eq!(
        allocation(
            "fire-coalwhisk",
            19,
            "cinder-terraces-regular",
            &[("aegis-bastionplate", 1)]
        )
        .bind(),
        Err(BindingError::ArtifactLevelRequirement)
    );
    assert!(
        allocation(
            "fire-coalwhisk",
            60,
            "cinder-terraces-regular",
            &[
                ("core-prismheart", 5),
                ("aegis-bastionplate", 5),
                ("rune-temporal-seal", 5)
            ]
        )
        .bind()
        .is_ok()
    );
    assert_eq!(
        allocation(
            "fire-coalwhisk",
            20,
            "cinder-terraces-regular",
            &[("core-amberlattice", 1), ("core-emberglass", 1)]
        )
        .bind(),
        Err(BindingError::DuplicateArtifactSlot)
    );
    assert_eq!(
        allocation(
            "fire-coalwhisk",
            20,
            "cinder-terraces-regular",
            &[("core-emberglass", 6)]
        )
        .bind(),
        Err(BindingError::InvalidArtifactLevel)
    );
    assert_eq!(
        allocation(
            "fire-coalwhisk",
            20,
            "cinder-terraces-regular",
            &[("core-imaginary", 1)]
        )
        .bind(),
        Err(BindingError::InvalidArtifactDefinition)
    );
}

#[test]
fn equipping_an_artifact_changes_authoritative_stats_and_the_match_outcome() {
    let geared = snapshot(
        "fire-coalwhisk",
        20,
        "cinder-terraces-boss",
        &[
            ("core-emberglass", 1),
            ("aegis-bastionplate", 5),
            ("rune-whisperknot", 5),
        ],
    );
    let plain = snapshot("fire-coalwhisk", 20, "cinder-terraces-boss", &[]);
    assert_ne!(plain.effective(), geared.effective());
    assert_ne!(plain.digest(), geared.digest());
    let before = play(plain.clone(), 7);
    let after = play(geared.clone(), 7);
    assert_ne!(before.damage, after.damage);
    assert_ne!(before.hash, after.hash);
    assert_eq!(before.phase, Phase::Lost);
    assert_eq!(after.phase, Phase::Won);
    assert_eq!((before.turn, after.turn), (10, 10));
}

#[test]
fn an_allocated_match_is_immutable_while_a_new_match_uses_the_new_loadout() {
    let plain = snapshot("fire-coalwhisk", 20, "cinder-terraces-regular", &[]);
    let state = BoundState::allocate(plain.clone()).unwrap();
    let digest = plain.digest();
    let state_hash = state.hash();

    let geared = snapshot(
        "fire-coalwhisk",
        20,
        "cinder-terraces-regular",
        &[("core-emberglass", 1), ("rune-whisperknot", 5)],
    );
    let geared_state = BoundState::allocate(geared.clone()).unwrap();
    assert_ne!(geared.digest(), digest);
    assert_ne!(geared_state.hash(), state_hash);
    assert_eq!(state.snapshot(), &plain);
    assert_eq!(state.hash(), state_hash);
    assert_eq!(state.core().health(), plain.effective().health);
    assert_ne!(geared_state.core().health(), state.core().health());
    assert_ne!(
        geared_state.snapshot().effective().attack,
        state.snapshot().effective().attack
    );
    Arena8Bound.validate(&state).unwrap();
    assert_ne!(
        state.snapshot().effective(),
        geared_state.snapshot().effective()
    );

    // A rewritten snapshot is refused rather than silently applied.
    let mut json = serde_json::to_value(&plain).unwrap();
    json["effective"]["attack"] = serde_json::json!(999);
    let tampered: MatchSnapshot = serde_json::from_value(json).unwrap();
    assert_eq!(tampered.validate(), Err(BindingError::InvalidSnapshot));
    assert!(BoundState::allocate(tampered).is_err());

    // A rewritten durable payload is refused on decode.
    let mut payload: serde_json::Value = serde_json::from_slice(&state.encode().unwrap()).unwrap();
    payload["snapshot"]["effective"]["health"] = serde_json::json!(1);
    assert!(BoundState::decode(&serde_json::to_vec(&payload).unwrap()).is_err());
    let decoded = BoundState::decode(&state.encode().unwrap()).unwrap();
    assert_eq!(decoded.hash(), state_hash);
    assert_eq!(decoded.snapshot(), &plain);
}

#[test]
fn binding_content_is_versioned_bounded_and_pinned() {
    binding::validate_binding().unwrap();
    assert_eq!(binding::digest().unwrap(), BINDING_DIGEST);
    assert_eq!(binding::digest_hex().unwrap().len(), 64);
    assert_eq!(BINDING_ID, "aetheria-pet-arena-arena8-binding");
    assert_eq!(BINDING_VERSION, 1);
    assert_eq!(binding::computed_digest(), BINDING_DIGEST);
    assert_eq!(binding::ROSTER_VERSION, "wave-a-v1");
    assert!(binding::ARTIFACT_DEFINITIONS.len() >= 7);
    assert_eq!(binding::BOUND_RULESET_ID, "aetheria-pet-arena-arena8-pve");
    let rules = Arena8Bound.ruleset();
    assert_eq!(rules.id, "aetheria-pet-arena-arena8-pve");
    assert_eq!(rules.version, 1);
    assert_eq!(rules.content_hash, BINDING_DIGEST);
}

#[test]
fn progression_gates_derive_skills_from_pet_level() {
    assert_eq!(SkillId::SharedSkill.unlock_level(), 1);
    assert_eq!(SkillId::Guard.unlock_level(), 1);
    assert_eq!(SkillId::Signature.unlock_level(), 40);
    assert_eq!(SkillId::FireZone.unlock_level(), 40);
    assert_eq!(SkillId::Ultimate.unlock_level(), 60);

    let level_1 = snapshot("fire-coalwhisk", 1, "cinder-terraces-regular", &[]);
    assert_eq!(
        level_1.skills(),
        &[SkillId::SharedSkill, SkillId::Guard],
        "Lv1 keeps only the basic skill and guard"
    );
    assert!(aetheria_pet_arena::arena8::action_allowed(
        level_1.skills(),
        &Action::Skill
    ));
    assert!(!aetheria_pet_arena::arena8::action_allowed(
        level_1.skills(),
        &Action::Signature
    ));
    assert!(!aetheria_pet_arena::arena8::action_allowed(
        level_1.skills(),
        &Action::Ultimate
    ));

    // Lv20 only unlocks the reserved power-skill milestone, so the ability set
    // is still the Lv1 set in this ruleset version.
    let level_20 = snapshot("fire-coalwhisk", 20, "cinder-terraces-regular", &[]);
    assert_eq!(level_20.skills(), level_1.skills());

    let level_40 = snapshot("fire-coalwhisk", 40, "cinder-terraces-regular", &[]);
    assert_eq!(
        level_40.skills(),
        &[SkillId::SharedSkill, SkillId::Signature, SkillId::Guard]
    );
    assert!(aetheria_pet_arena::arena8::action_allowed(
        level_40.skills(),
        &Action::Signature
    ));
    assert!(!aetheria_pet_arena::arena8::action_allowed(
        level_40.skills(),
        &Action::Ultimate
    ));

    let level_60 = snapshot("fire-coalwhisk", 60, "cinder-terraces-regular", &[]);
    assert_eq!(
        level_60.skills(),
        &[
            SkillId::SharedSkill,
            SkillId::Signature,
            SkillId::Ultimate,
            SkillId::Guard,
        ]
    );
    assert!(aetheria_pet_arena::arena8::action_allowed(
        level_60.skills(),
        &Action::Ultimate
    ));

    // Icarus's FIRE_ZONE is a signature-tier ability, so it follows the Lv40 gate.
    let icarus_20 = snapshot("pet-v3-fire-icarus", 20, "cinder-terraces-boss", &[]);
    assert!(!icarus_20.skills().contains(&SkillId::FireZone));
    let icarus_40 = snapshot("pet-v3-fire-icarus", 40, "cinder-terraces-boss", &[]);
    assert!(icarus_40.skills().contains(&SkillId::FireZone));

    // Swaps and Start never require an unlocked ability.
    assert!(aetheria_pet_arena::arena8::action_allowed(
        level_1.skills(),
        &Action::Start
    ));
    assert!(aetheria_pet_arena::arena8::action_allowed(
        level_1.skills(),
        &Action::Swap {
            first: 0,
            second: 1
        }
    ));
}

#[test]
fn a_level_locked_signature_is_refused_by_the_authoritative_reducer() {
    let snapshot = snapshot("fire-coalwhisk", 1, "cinder-terraces-regular", &[]);
    let seed = SecretSeed::from_host_entropy([3; 32]);
    let rules = Arena8Bound;
    let mut checkpoint = begin(
        &rules,
        MATCH,
        BoundState::allocate(snapshot).unwrap(),
        &seed,
        clock(0),
    )
    .unwrap();
    let version = checkpoint.version;
    let started = apply(
        &rules,
        &checkpoint,
        &Command {
            id: [1; 16],
            match_id: MATCH,
            expected_version: version,
            ruleset: rules.ruleset(),
            action: Action::Start,
        },
        &seed,
        clock(version + 1),
    )
    .unwrap();
    checkpoint = started.next;

    // Bank Mana/Rage only through legal swaps. The Signature gate must not be
    // confused with a resource shortfall, so wait until both costs are met.
    let mut affordable = false;
    while checkpoint.state.core().phase() == Phase::Playing {
        let core = checkpoint.state.core();
        if core.mana() >= SIGNATURE_MANA && core.rage() >= SIGNATURE_RAGE {
            affordable = true;
            break;
        }
        let legal = core.board().legal_move().expect("settled board");
        let version = checkpoint.version;
        let transition = apply(
            &rules,
            &checkpoint,
            &Command {
                id: [u8::try_from(version + 1).unwrap(); 16],
                match_id: MATCH,
                expected_version: version,
                ruleset: rules.ruleset(),
                action: Action::Swap {
                    first: legal.first,
                    second: legal.second,
                },
            },
            &seed,
            clock(version + 1),
        )
        .unwrap();
        checkpoint = transition.next;
    }
    assert!(
        affordable,
        "the deterministic drive must reach Signature resources before the match ends"
    );
    let version = checkpoint.version;
    let refused = apply(
        &rules,
        &checkpoint,
        &Command {
            id: [9; 16],
            match_id: MATCH,
            expected_version: version,
            ruleset: rules.ruleset(),
            action: Action::Signature,
        },
        &seed,
        clock(version + 1),
    );
    assert!(
        matches!(refused, Err(aetheria_game_core::Error::InvalidAction)),
        "a Lv1 snapshot must reject Signature even with full resources"
    );
}
