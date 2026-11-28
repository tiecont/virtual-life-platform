use aetheria_pet_arena::manifest::MatchPin;

const FIXTURE: &[u8] = include_bytes!("fixtures/v3-pin.json");
#[test]
fn shared_binding_fixture_roundtrips_without_changing_v1_codec() {
    let pin = MatchPin::decode(FIXTURE).unwrap();
    assert_eq!(pin.level, 1);
    assert_eq!(pin.stats.hp, 100);
    assert_eq!(
        pin,
        MatchPin::decode(&serde_json::to_vec(&pin).unwrap()).unwrap()
    );
}
#[test]
fn rejects_unknown_nested_overflow_type_and_wrong_version_fields() {
    let original: serde_json::Value = serde_json::from_slice(FIXTURE).unwrap();
    for (field, invalid) in [
        ("schemaVersion", serde_json::json!(1)),
        ("ruleset", serde_json::json!("pet-arena-pve")),
        ("contentHash", serde_json::json!("A".repeat(64))),
        ("rulesHash", serde_json::json!("b".repeat(63))),
        ("loadout", serde_json::json!("../invalid")),
        ("encounterRevision", serde_json::json!(2147483648_u64)),
        ("level", serde_json::json!(101)),
        ("level", serde_json::json!("1")),
        ("script", serde_json::json!({"code": "invalid"})),
        (
            "stats",
            serde_json::json!({"hp": 1, "attack": 1, "defense": 0, "speed": 1, "extra": 1}),
        ),
        (
            "stats",
            serde_json::json!({"hp": 1000001, "attack": 1, "defense": 0, "speed": 1}),
        ),
        (
            "stats",
            serde_json::json!({"hp": 1, "attack": 1, "defense": -1, "speed": 1}),
        ),
    ] {
        let mut value = original.clone();
        value[field] = invalid;
        assert!(MatchPin::decode(&serde_json::to_vec(&value).unwrap()).is_err());
    }
    assert!(MatchPin::decode(&vec![b' '; 4097]).is_err());
    let duplicate =
        String::from_utf8(FIXTURE.to_vec())
            .unwrap()
            .replacen('{', "{\"schemaVersion\":3,", 1);
    assert!(MatchPin::decode(duplicate.as_bytes()).is_err());
}
