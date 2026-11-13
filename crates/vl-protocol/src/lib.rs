//! Wire data is untrusted; successful decoding is never authentication.
use prost::Message;

pub mod public {
    include!(concat!(env!("OUT_DIR"), "/virtuallife.public.v1.rs"));
}
pub mod internal {
    include!(concat!(env!("OUT_DIR"), "/virtuallife.internal.v1.rs"));
}
pub const PUBLIC_VERSION: u32 = 1;
pub const INTERNAL_VERSION: u32 = 1;
pub const MAX_FRAME_BYTES: usize = 65_536;
pub const MAX_ACTION_BYTES: usize = 16_384;
pub const MAX_INTERNAL_BYTES: usize = 131_072;

#[derive(Debug, PartialEq, Eq)]
pub enum DecodeError {
    Oversize,
    Malformed,
    UnsupportedVersion,
    InvalidEnvelope,
}

// Structural validation only, never signature/service/player authentication.
pub fn validate_internal(request: &internal::ExecuteGameRequest) -> Result<(), DecodeError> {
    if request.encoded_len() > MAX_INTERNAL_BYTES {
        return Err(DecodeError::Oversize);
    }
    if request.rpc_version != INTERNAL_VERSION {
        return Err(DecodeError::UnsupportedVersion);
    }
    let actor = request.actor.as_ref().ok_or(DecodeError::InvalidEnvelope)?;
    if actor.account_id.len() != 16
        || actor.session_id.len() != 16
        || actor.audience != "vl-native-runtime-v1"
        || actor.policy_generation == 0
        || actor.expires_at_unix_ms <= 0
        || actor.signed_grant.is_empty()
        || actor.signed_grant.len() > 4096
        || request.authority_epoch == 0
    {
        return Err(DecodeError::InvalidEnvelope);
    }
    decode_client(&request.public_command)?;
    Ok(())
}

pub fn internal_server<T: internal::activity_runtime_server::ActivityRuntime>(
    implementation: T,
) -> internal::activity_runtime_server::ActivityRuntimeServer<T> {
    internal::activity_runtime_server::ActivityRuntimeServer::new(implementation)
        .max_decoding_message_size(MAX_INTERNAL_BYTES)
        .max_encoding_message_size(MAX_INTERNAL_BYTES)
}

pub fn decode_client(bytes: &[u8]) -> Result<public::ClientEnvelope, DecodeError> {
    if bytes.len() > MAX_FRAME_BYTES {
        return Err(DecodeError::Oversize);
    }
    let envelope = public::ClientEnvelope::decode(bytes).map_err(|_| DecodeError::Malformed)?;
    if envelope.protocol_version != PUBLIC_VERSION {
        return Err(DecodeError::UnsupportedVersion);
    }
    if envelope.command_id.len() != 16 {
        return Err(DecodeError::InvalidEnvelope);
    }
    use public::client_envelope::Body;
    let valid = match &envelope.body {
        Some(Body::Hello(value)) => {
            !value.ticket.is_empty()
                && value.ticket.len() <= 4096
                && !value.client_build.is_empty()
                && value.client_build.len() <= 64
                && value
                    .client_build
                    .bytes()
                    .next()
                    .is_some_and(|b| b.is_ascii_alphanumeric())
                && value
                    .client_build
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
                && value.content_hash.len() == 32
                && value.platform_label.as_ref().is_none_or(|label| {
                    !label.is_empty()
                        && label.len() <= 32
                        && label
                            .bytes()
                            .next()
                            .is_some_and(|b| b.is_ascii_alphanumeric())
                        && label
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                })
        }
        Some(Body::GameIntent(value)) => {
            value.game_session_id.len() == 16
                && value
                    .kind
                    .bytes()
                    .next()
                    .is_some_and(|b| b.is_ascii_lowercase())
                && value.kind.len() <= 64
                && value
                    .kind
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b".-_".contains(&b))
                && value.action_payload.len() <= MAX_ACTION_BYTES
        }
        Some(Body::MoveIntent(value)) => {
            value.input_sequence > 0
                && (-1000..=1000).contains(&value.direction_x)
                && (-1000..=1000).contains(&value.direction_z)
        }
        Some(Body::Resync(_)) => true,
        None => false,
    };
    if !valid {
        return Err(DecodeError::InvalidEnvelope);
    }
    Ok(envelope)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn hello() -> public::ClientEnvelope {
        public::ClientEnvelope {
            protocol_version: 1,
            command_id: vec![0x11; 16],
            sequence: 9,
            body: Some(public::client_envelope::Body::Hello(public::Hello {
                ticket: "fixture-ticket".into(),
                client_build: "linux-fixture-v1".into(),
                content_hash: vec![0x22; 32],
                platform_label: None,
            })),
        }
    }
    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
    #[test]
    fn frozen_v1_wire_and_additive_unknown_field_are_compatible() {
        let encoded = hello().encode_to_vec();
        assert_eq!(
            hex(&encoded),
            include_str!("../../../proto/native/fixtures/client-hello-v1.hex").trim()
        );
        let mut additive = encoded.clone();
        additive.extend([0xf8, 0x07, 0x01]);
        assert_eq!(decode_client(&additive).unwrap(), hello());
        assert_eq!(decode_client(&encoded).unwrap().encode_to_vec(), encoded);
    }
    #[test]
    fn version_oversize_malformed_and_missing_body_fail_closed() {
        assert_eq!(
            decode_client(&vec![0; MAX_FRAME_BYTES + 1]),
            Err(DecodeError::Oversize)
        );
        assert_eq!(decode_client(&[0x80]), Err(DecodeError::Malformed));
        let mut value = hello();
        value.protocol_version = 2;
        assert_eq!(
            decode_client(&value.encode_to_vec()),
            Err(DecodeError::UnsupportedVersion)
        );
        value.protocol_version = 1;
        value.body = None;
        assert_eq!(
            decode_client(&value.encode_to_vec()),
            Err(DecodeError::InvalidEnvelope)
        );
    }
    #[test]
    fn movement_bounds_and_action_limits_are_not_client_authority() {
        let mut value = hello();
        value.body = Some(public::client_envelope::Body::MoveIntent(
            public::MoveIntent {
                input_sequence: 1,
                direction_x: 1001,
                direction_z: 0,
                ..Default::default()
            },
        ));
        assert_eq!(
            decode_client(&value.encode_to_vec()),
            Err(DecodeError::InvalidEnvelope)
        );
        value.body = Some(public::client_envelope::Body::GameIntent(
            public::GameIntent {
                game_session_id: vec![1; 16],
                expected_state_version: 1,
                kind: "card.draw".into(),
                action_payload: vec![0; MAX_ACTION_BYTES + 1],
            },
        ));
        assert_eq!(
            decode_client(&value.encode_to_vec()),
            Err(DecodeError::InvalidEnvelope)
        );
    }
    #[test]
    fn genesis_game_command_accepts_version_zero() {
        let mut frame = hello();
        frame.body = Some(public::client_envelope::Body::GameIntent(
            public::GameIntent {
                game_session_id: vec![1; 16],
                expected_state_version: 0,
                kind: "fixture.advance.v1".into(),
                action_payload: b"{}".to_vec(),
            },
        ));
        assert_eq!(decode_client(&frame.encode_to_vec()).unwrap(), frame);
    }
    #[test]
    fn server_fixture_preserves_u64_above_javascript_safe_integer() {
        let value = public::ServerEnvelope {
            protocol_version: 1,
            command_id: vec![0x11; 16],
            canonical_version: 9_007_199_254_740_993,
            body: Some(public::server_envelope::Body::Hello(
                public::HelloAccepted {
                    content_hash: vec![0x22; 32],
                    state_schema_version: 1,
                    ..Default::default()
                },
            )),
        };
        let encoded = value.encode_to_vec();
        assert_eq!(
            hex(&encoded),
            include_str!("../../../proto/native/fixtures/server-hello-v1.hex").trim()
        );
        assert_eq!(
            public::ServerEnvelope::decode(encoded.as_slice()).unwrap(),
            value
        );
    }
    #[test]
    fn internal_rpc_rejects_wrong_version_missing_actor_and_oversize() {
        let mut request = internal::ExecuteGameRequest {
            rpc_version: 2,
            ..Default::default()
        };
        assert_eq!(
            validate_internal(&request),
            Err(DecodeError::UnsupportedVersion)
        );
        request.rpc_version = 1;
        assert_eq!(
            validate_internal(&request),
            Err(DecodeError::InvalidEnvelope)
        );
        request.public_command = vec![0; MAX_INTERNAL_BYTES + 1];
        assert_eq!(validate_internal(&request), Err(DecodeError::Oversize));
    }
}
