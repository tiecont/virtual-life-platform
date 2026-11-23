use aetheria_game_runtime::features::pet_arena::projection::{
    FIRE_ZONE_OPCODE, FireZoneDto, ICARUS_PET_ID, ICARUS_SIGNATURE_CARD_ID, ICARUS_SIGNATURE_ID,
    SignatureDto,
};

#[test]
fn canonical_icarus_signature_contract_is_stable() {
    let projection = SignatureDto::icarus(12, (20..36).collect()).unwrap();
    assert_eq!(
        serde_json::to_string(&projection).unwrap(),
        r#"{"petId":"pet-v3-fire-icarus","signatureId":"signature_icarus","signatureCardId":"signature_card_icarus","opcode":"FIRE_ZONE","turn":12,"fireZone":{"turn":12,"cells":[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],"expiresTurn":14}}"#
    );
    assert_eq!(projection.pet_id, ICARUS_PET_ID);
    assert_eq!(projection.signature_id, ICARUS_SIGNATURE_ID);
    assert_eq!(projection.signature_card_id, ICARUS_SIGNATURE_CARD_ID);
    assert_eq!(projection.opcode, FIRE_ZONE_OPCODE);
}

#[test]
fn fire_zone_contract_rejects_unknown_fields_duplicate_cells_and_wrong_expiry() {
    assert!(serde_json::from_str::<FireZoneDto>(
        r#"{"turn":12,"cells":[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],"expiresTurn":15}"#
    )
    .unwrap()
    .validate()
    .is_err());
    assert!(serde_json::from_str::<FireZoneDto>(
        r#"{"turn":12,"cells":[20,20,22,23,24,25,26,27,28,29,30,31,32,33,34,35],"expiresTurn":14}"#
    )
    .unwrap()
    .validate()
    .is_err());
    assert!(serde_json::from_str::<FireZoneDto>(
        r#"{"turn":12,"cells":[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],"expiresTurn":14,"privateSeed":42}"#
    )
    .is_err());
    assert!(SignatureDto::decode(
        br#"{"petId":"pet-v3-fire-icarus","signatureId":"signature_icarus","signatureCardId":"signature_card_icarus","opcode":"FIRE_ZONE","turn":12,"fireZone":{"turn":12,"cells":[20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],"expiresTurn":14},"privateSeed":42}"#
    )
    .is_err());
}
