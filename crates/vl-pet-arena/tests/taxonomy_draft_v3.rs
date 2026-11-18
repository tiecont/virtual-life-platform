use serde_json::{Value, json};
use vl_pet_arena::taxonomy_v3::*;

fn fixture() -> Value {
    let elements: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/elements.json"
    ))
    .unwrap();
    let matrix: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/element_effectiveness_matrix.json"
    ))
    .unwrap();
    let races: Value = serde_json::from_str(include_str!(
        "../../../specs/pet-arena/v3.1/data/races.json"
    ))
    .unwrap();
    json!({
        "schemaVersion":3,"ruleset":"pet-arena-pve-v3","state":"DRAFT_ONLY","enabled":false,
        "elements":elements["elements"].as_array().unwrap().iter().map(|e| json!({
            "id":e["id"],"strongAgainst":e["strongAgainst"],
            "resistedBy":e["resistedBy"],"noEffectAgainst":e["noEffectAgainst"]
        })).collect::<Vec<_>>(),
        "effectiveness":matrix["attackerRowsDefenderColumns"],
        "races":races["races"].as_array().unwrap().iter().map(|r| json!({
            "id":r["id"],"defaultBodyPlan":r["defaultBodyPlan"],
            "defaultRig":r["defaultRig"],"locomotion":r["locomotion"]
        })).collect::<Vec<_>>()
    })
}

fn decode(value: &Value) -> Result<TaxonomyDraft, TaxonomyError> {
    TaxonomyDraft::decode(&serde_json::to_vec(value).unwrap())
}

#[test]
fn shared_draft_shape_preserves_all_directions_and_race_templates() {
    let value = fixture();
    let draft = decode(&value).unwrap();
    for attacker in ELEMENTS {
        for defender in ELEMENTS {
            assert_eq!(
                draft.effectiveness(attacker, defender),
                effectiveness(attacker, defender)
            );
            for base in [0, 1, 3, 799, 1000, 1_000_001, u32::MAX] {
                assert_eq!(
                    draft.scale_damage(base, attacker, defender),
                    scale_damage(base, attacker, defender)
                );
            }
        }
    }
    for row in value["races"].as_array().unwrap() {
        let race: Race = serde_json::from_value(row["id"].clone()).unwrap();
        assert_eq!(draft.morphology(race), race.default_morphology());
    }
    assert_eq!(decode(&value), Ok(draft));
    let mut reordered = value;
    reordered["elements"].as_array_mut().unwrap().reverse();
    reordered["races"].as_array_mut().unwrap().reverse();
    assert_eq!(decode(&reordered), decode(&fixture()));
}

#[test]
fn candidate_damage_uses_validated_data_without_changing_frozen_defaults() {
    let mut value = fixture();
    let fire = value["elements"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|e| e["id"] == "fire")
        .unwrap();
    fire["resistedBy"]
        .as_array_mut()
        .unwrap()
        .retain(|e| e != "water");
    value["effectiveness"]["fire"]["water"] = json!(1000);
    let draft = decode(&value).unwrap();
    assert_eq!(draft.scale_damage(3, Element::Fire, Element::Water), Ok(3));
    assert_eq!(scale_damage(3, Element::Fire, Element::Water), Ok(2));
    value["races"][0]["defaultBodyPlan"] = json!("hexapod");
    value["races"][0]["defaultRig"] = json!("rig_insect");
    let draft = decode(&value).unwrap();
    assert_eq!(draft.morphology(Race::Beast).body_plan, BodyPlan::Hexapod);
    assert_eq!(
        Race::Beast.default_morphology().body_plan,
        BodyPlan::Quadruped
    );
}

#[test]
fn strict_layers_reject_missing_fields_wrong_types_and_unknown_fields() {
    let original = fixture();
    for path in [
        "",
        "/elements/0",
        "/races/0",
        "/effectiveness",
        "/effectiveness/fire",
    ] {
        for key in original.pointer(path).unwrap().as_object().unwrap().keys() {
            let mut missing = original.clone();
            missing
                .pointer_mut(path)
                .unwrap()
                .as_object_mut()
                .unwrap()
                .remove(key);
            assert!(decode(&missing).is_err(), "missing {path}/{key}");
            for replacement in [
                Value::Null,
                json!(true),
                json!([]),
                json!({}),
                json!("1000"),
                json!(1001),
            ] {
                if replacement == original.pointer(path).unwrap()[key] {
                    continue;
                }
                let mut changed = original.clone();
                changed.pointer_mut(path).unwrap()[key] = replacement;
                assert!(decode(&changed).is_err(), "type {path}/{key}");
            }
        }
        let mut extra = original.clone();
        extra.pointer_mut(path).unwrap()["script"] = json!("execute");
        assert!(decode(&extra).is_err(), "unknown {path}");
    }
}

#[test]
fn enum_values_require_strings_instead_of_serde_variant_objects() {
    let original = fixture();
    for path in [
        "/elements/0/id",
        "/elements/0/resistedBy/0",
        "/elements/0/noEffectAgainst/0",
        "/elements/1/strongAgainst/0",
        "/races/0/id",
        "/races/0/defaultBodyPlan",
        "/races/0/defaultRig",
        "/races/0/locomotion",
    ] {
        let mut changed = original.clone();
        let variant = changed.pointer(path).unwrap().as_str().unwrap().to_owned();
        *changed.pointer_mut(path).unwrap() = json!({variant: null});
        assert_eq!(decode(&changed), Err(TaxonomyError::InvalidDraft), "{path}");
    }
}

#[test]
fn duplicate_json_keys_fail_before_any_overwrite() {
    let original = fixture();
    let encoded = serde_json::to_string(&original).unwrap();
    let row = serde_json::to_string(&original["effectiveness"]["fire"]).unwrap();
    for raw in [
        encoded.replacen(
            "\"enabled\":false",
            "\"enabled\":false,\"enabled\":false",
            1,
        ),
        encoded.replacen("\"fire\":{", &format!("\"fire\":{row},\"fire\":{{"), 1),
        encoded.replacen("\"fire\":800", "\"fire\":800,\"fire\":800", 1),
        encoded.replacen(
            "\"id\":\"normal\"",
            "\"id\":\"normal\",\"id\":\"normal\"",
            1,
        ),
    ] {
        assert_ne!(raw, encoded, "mutation must change the fixture");
        assert_eq!(
            TaxonomyDraft::decode(raw.as_bytes()),
            Err(TaxonomyError::InvalidDraft)
        );
    }
}

#[test]
fn relations_require_unique_elements_bounded_values_and_offensive_counters() {
    let original = fixture();
    for list in ["elements", "races"] {
        let mut changed = original.clone();
        changed[list][0] = changed[list][1].clone();
        assert!(decode(&changed).is_err());
        let mut changed = original.clone();
        changed[list].as_array_mut().unwrap().pop();
        assert!(decode(&changed).is_err());
    }
    for permille in [
        json!(1),
        json!(799),
        json!(1251),
        json!(-1),
        json!(u64::MAX),
        json!(800.0),
    ] {
        let mut changed = original.clone();
        changed["effectiveness"]["fire"]["water"] = permille;
        assert!(decode(&changed).is_err());
    }
    for relations in [
        json!(["fire", "fire"]),
        json!(["rock"]),
        json!(["arcane"]),
        json!(vec!["fire"; 19]),
    ] {
        let mut changed = original.clone();
        changed["elements"][0]["strongAgainst"] = relations;
        assert!(decode(&changed).is_err());
    }
    let mut counterless = original.clone();
    for row in counterless["elements"].as_array_mut().unwrap() {
        row["strongAgainst"]
            .as_array_mut()
            .unwrap()
            .retain(|e| e != "normal");
    }
    for row in counterless["effectiveness"]
        .as_object_mut()
        .unwrap()
        .values_mut()
    {
        if row["normal"] == 1250 {
            row["normal"] = json!(1000);
        }
    }
    assert_eq!(decode(&counterless), Err(TaxonomyError::InvalidDraft));
    let mut incompatible = original.clone();
    incompatible["races"][0]["defaultRig"] = json!("rig_humanoid");
    assert_eq!(decode(&incompatible), Err(TaxonomyError::IncompatibleRig));
}

#[test]
fn draft_boundary_rejects_activation_versions_trailing_data_and_size() {
    for (key, value) in [
        ("schemaVersion", json!(2)),
        ("ruleset", json!("pet-arena-training")),
        ("state", json!("PUBLISHED")),
        ("enabled", json!(true)),
    ] {
        let mut changed = fixture();
        changed[key] = value;
        assert_eq!(decode(&changed), Err(TaxonomyError::InvalidDraft));
    }
    let mut bytes = serde_json::to_vec(&fixture()).unwrap();
    bytes.extend_from_slice(b"{}");
    assert!(TaxonomyDraft::decode(&bytes).is_err());
    let mut bytes = serde_json::to_vec(&fixture()).unwrap();
    bytes.resize(65_536, b' ');
    assert!(TaxonomyDraft::decode(&bytes).is_ok());
    bytes.push(b' ');
    assert_eq!(
        TaxonomyDraft::decode(&bytes),
        Err(TaxonomyError::InvalidDraft)
    );
    assert_eq!(TaxonomyDraft::decode(b""), Err(TaxonomyError::InvalidDraft));
}
