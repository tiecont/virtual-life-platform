use aetheria_game_core::{SecretSeed, TurnRng, Value};
use aetheria_pet_arena::arena8::coop::{
    CoopAction, CoopConfig, CoopRules, SeatInput, Status, StatusKind,
    config::{EffectKind, EffectTarget},
};
use std::collections::BTreeSet;

const BUNDLE: &[u8] = include_bytes!("../../../config/gameplay/arena8-coop-v2.seed.json");
const ICARUS: &str = "pet-v3-fire-icarus";

#[test]
fn every_active_pet_can_use_its_authored_kit_at_level_one() {
    let config = CoopConfig::parse(BUNDLE).unwrap();
    assert_eq!(config.pets.len(), 55);
    assert_eq!(config.skills.len(), 221);
    let rules: Vec<_> = config
        .bosses()
        .iter()
        .map(|boss| CoopRules::load(BUNDLE, boss.id.clone()).unwrap())
        .collect();
    let mut skills_cast = BTreeSet::new();
    let mut effects_seen = BTreeSet::new();
    let entropy = SecretSeed::from_host_entropy([23; 32]);

    for pet in &config.pets {
        let rules = rules
            .iter()
            .find(|rules| {
                rules.effectiveness(
                    pet.element().unwrap(),
                    rules.selected_boss().element().unwrap(),
                ) >= 1000
            })
            .unwrap_or_else(|| panic!("no neutral target for {}", pet.id));
        let initial = rules
            .allocate(std::array::from_fn(|index| SeatInput {
                account: format!("catalog-fixture-account-{index}"),
                pet_id: pet.id.clone(),
                owned_pet_instance_id: format!("catalog-fixture-instance-{index}"),
                level: 1,
                artifact_power_pm: 0,
            }))
            .unwrap();
        let mut rng = TurnRng::new(&entropy, Value::Text(pet.id.clone()), 0).unwrap();
        let mut started = rules
            .reduce(&initial, CoopAction::Start, &mut rng)
            .unwrap()
            .state;
        let actor = started.active_seat;
        let ally = (actor + 1) % started.participants.len();
        started.participants[actor].mana = config.resources.mana_cap;
        started.participants[actor].rage = config.resources.rage_cap;
        for seat in &mut started.participants {
            seat.hp = 1;
        }
        started.participants[ally].statuses[0] = Some(Status {
            kind: StatusKind::Vulnerability,
            value: 500,
            turns: 3,
        });
        assert_eq!(pet.fire_zone.is_some(), pet.id == ICARUS);
        let actions = [
            CoopAction::Guard,
            CoopAction::Skill,
            CoopAction::Signature,
            CoopAction::Ultimate,
            CoopAction::FireZone,
        ];
        for (slot, skill_id) in pet.skill_ids().into_iter().enumerate() {
            let Some(skill_id) = skill_id else {
                assert_eq!(slot, 4);
                continue;
            };
            let effect = &config.skill(skill_id).unwrap().effect;
            assert!(
                rules.ability_ready(&started, actor, actions[slot]),
                "{skill_id}"
            );
            let mut rng = TurnRng::new(&entropy, Value::Text(skill_id.to_string()), 0).unwrap();
            let resolution = rules
                .reduce(&started, actions[slot], &mut rng)
                .unwrap_or_else(|error| panic!("{skill_id}: {error:?}"));
            let (event, needs_positive_value) = match effect.kind {
                EffectKind::Damage | EffectKind::ChainDamage => ("boss-damage", true),
                EffectKind::DamageOverTime => ("boss-dot", true),
                EffectKind::Heal => ("heal", true),
                EffectKind::Shield => ("shield", true),
                EffectKind::Buff => ("buff", false),
                EffectKind::Debuff if effect.target == EffectTarget::Boss => ("boss-debuff", false),
                EffectKind::Debuff => ("buff", false),
                EffectKind::RageTransfer => ("rage-transfer", true),
                EffectKind::ManaRestore => ("mana-restored", true),
                EffectKind::Cleanse => ("cleanse", true),
                EffectKind::Curse => ("curse", true),
            };
            assert!(
                resolution.events.iter().any(|value| {
                    matches!(value, Value::List(fields)
                    if matches!(fields.as_slice(), [Value::Text(name), _, Value::Uint(value)]
                        if name == event && (!needs_positive_value || *value > 0)))
                }),
                "{skill_id} did not produce {event}"
            );
            assert!(skills_cast.insert(skill_id), "duplicated skill {skill_id}");
            effects_seen.insert(format!("{:?}", effect.kind));
        }
    }
    assert_eq!(skills_cast.len(), config.skills.len());
    assert_eq!(effects_seen.len(), 11);
}
