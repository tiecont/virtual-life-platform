use aetheria_pet_arena::taxonomy_v3::*;
use serde_json::{Value, json};

#[test]
fn every_canonical_direction_and_integer_rounding() {
    let source: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/element_effectiveness_matrix.json"
    ))
    .unwrap();
    for attacker in ELEMENTS {
        for defender in ELEMENTS {
            let a = serde_json::to_value(attacker).unwrap();
            let d = serde_json::to_value(defender).unwrap();
            let expected = source["attackerRowsDefenderColumns"][a.as_str().unwrap()]
                [d.as_str().unwrap()]
            .as_u64()
            .unwrap();
            assert_eq!(u64::from(effectiveness(attacker, defender)), expected);
            for base in [0, 1, 3, 799, 1000, 1_000_001] {
                assert_eq!(
                    u64::from(scale_damage(base, attacker, defender).unwrap()),
                    u64::from(base) * expected / 1000
                );
            }
        }
    }
    assert_eq!(
        scale_damage(u32::MAX, Element::Fire, Element::Grass),
        Err(TaxonomyError::Arithmetic)
    );
    assert_eq!(
        scale_damage(u32::MAX, Element::Electric, Element::Ground),
        Ok(0)
    );
    assert_eq!(effectiveness(Element::Ground, Element::Electric), 1250);
}

#[test]
fn all_race_defaults_and_240_explicit_morphologies_resolve() {
    let source: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/races.json"
    ))
    .unwrap();
    for r in source["races"].as_array().unwrap() {
        let request: MorphologyRequest =
            serde_json::from_value(json!({"race":r["id"],"overrideMorphology":null})).unwrap();
        let resolved = request.resolve().unwrap();
        assert_eq!(
            serde_json::to_value(resolved).unwrap(),
            json!({"bodyPlan":r["defaultBodyPlan"],"rig":r["defaultRig"],"locomotion":r["locomotion"]})
        );
    }
    let pets: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/pets_initial_240.json"
    ))
    .unwrap();
    for p in pets["pets"].as_array().unwrap() {
        let race: Race = serde_json::from_value(p["race"].clone()).unwrap();
        let request: MorphologyRequest = serde_json::from_value(json!({"race":race,"overrideMorphology":{"bodyPlan":p["bodyPlan"],"rig":p["rigArchetype"],"locomotion":race.default_morphology().locomotion}})).unwrap();
        assert!(request.resolve().is_ok(), "{}", p["id"]);
    }
}

#[test]
fn strict_input_rejects_extra_elements_effects_and_partial_overrides() {
    for value in [json!("arcane"), json!(19), json!(null), json!("Fire")] {
        assert!(serde_json::from_value::<Element>(value).is_err());
    }
    for value in [
        json!({"race":"beast","damage":100000}),
        json!({"race":"unknown"}),
        json!({"race":"construct","overrideMorphology":{"bodyPlan":"hexapod"}}),
        json!({"race":"aquatic","overrideMorphology":{"bodyPlan":"radial","rig":"rig_aquatic","locomotion":"swim","script":"x"}}),
    ] {
        assert!(serde_json::from_value::<MorphologyRequest>(value).is_err());
    }
    let incompatible: MorphologyRequest = serde_json::from_value(json!({"race":"construct","overrideMorphology":{"bodyPlan":"hexapod","rig":"rig_humanoid","locomotion":"walk"}})).unwrap();
    assert_eq!(incompatible.resolve(), Err(TaxonomyError::IncompatibleRig));
}
