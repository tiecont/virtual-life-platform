use crate::{Error, Result};
use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use std::collections::BTreeMap;
use zeroize::Zeroizing;

pub struct Keys {
    active: String,
    keys: BTreeMap<String, Zeroizing<[u8; 32]>>,
}
pub(crate) struct Sealed {
    pub key: String,
    pub nonce: Vec<u8>,
    pub tag: Vec<u8>,
    pub bytes: Vec<u8>,
}
impl Keys {
    /// Dedicated storage keys supplied by the trusted host. Never ticket keys.
    pub fn new(active: String, keys: BTreeMap<String, [u8; 32]>) -> Result<Self> {
        if keys.is_empty()
            || keys.len() > 8
            || !keys.contains_key(&active)
            || keys.iter().any(|(id, key)| {
                id.is_empty()
                    || id.len() > 64
                    || !id.as_bytes()[0].is_ascii_alphanumeric()
                    || !id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
                    || *key == [0; 32]
            })
        {
            return Err(Error::Invalid);
        }
        Ok(Self {
            active,
            keys: keys
                .into_iter()
                .map(|(id, key)| (id, Zeroizing::new(key)))
                .collect(),
        })
    }
    pub(crate) fn seal(&self, bytes: &[u8], aad: &[u8]) -> Result<Sealed> {
        if bytes.is_empty() || bytes.len() > 1_048_576 {
            return Err(Error::Invalid);
        }
        let mut nonce = [0; 12];
        getrandom::fill(&mut nonce).map_err(|_| Error::Unavailable)?;
        let cipher = Aes256Gcm::new_from_slice(self.keys[&self.active].as_ref())
            .map_err(|_| Error::Invalid)?;
        let aad = [aad, self.active.as_bytes()].concat();
        let mut encrypted = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: bytes,
                    aad: &aad,
                },
            )
            .map_err(|_| Error::Integrity)?;
        let tag = encrypted.split_off(encrypted.len() - 16);
        Ok(Sealed {
            key: self.active.clone(),
            nonce: nonce.to_vec(),
            tag,
            bytes: encrypted,
        })
    }
    pub(crate) fn open(&self, sealed: &Sealed, aad: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
        if sealed.nonce.len() != 12
            || sealed.tag.len() != 16
            || sealed.bytes.is_empty()
            || sealed.bytes.len() > 1_048_576
        {
            return Err(Error::Integrity);
        }
        let key = self.keys.get(&sealed.key).ok_or(Error::Integrity)?;
        let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| Error::Integrity)?;
        let aad = [aad, sealed.key.as_bytes()].concat();
        cipher
            .decrypt(
                Nonce::from_slice(&sealed.nonce),
                Payload {
                    msg: &[sealed.bytes.as_slice(), sealed.tag.as_slice()].concat(),
                    aad: &aad,
                },
            )
            .map(Zeroizing::new)
            .map_err(|_| Error::Integrity)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn envelopes_bind_purpose_and_key_and_require_fresh_nonce() {
        let old = Keys::new("old".into(), [("old".into(), [7; 32])].into()).unwrap();
        let first = old
            .seal(b"private seed and cards", b"match/version/epoch/snapshot")
            .unwrap();
        let second = old
            .seal(b"private seed and cards", b"match/version/epoch/snapshot")
            .unwrap();
        assert_ne!(first.nonce, second.nonce);
        assert!(old.open(&first, b"match/version/epoch/receipt").is_err());
        let rotated = Keys::new(
            "new".into(),
            [("old".into(), [7; 32]), ("new".into(), [8; 32])].into(),
        )
        .unwrap();
        assert_eq!(
            rotated
                .open(&first, b"match/version/epoch/snapshot")
                .unwrap()
                .as_slice(),
            b"private seed and cards"
        );
        assert!(
            Keys::new("new".into(), [("new".into(), [8; 32])].into())
                .unwrap()
                .open(&first, b"match/version/epoch/snapshot")
                .is_err()
        );
        let mut corrupt = first;
        corrupt.bytes[0] ^= 1;
        assert!(old.open(&corrupt, b"match/version/epoch/snapshot").is_err());
    }
    #[test]
    fn invalid_envelope_metadata_never_decrypts() {
        let keys = Keys::new("fixture".into(), [("fixture".into(), [7; 32])].into()).unwrap();
        for field in ["nonce", "tag", "key", "empty", "oversize"] {
            let mut envelope = keys.seal(b"private", b"bound context").unwrap();
            match field {
                "nonce" => envelope.nonce[0] ^= 1,
                "tag" => envelope.tag[0] ^= 1,
                "key" => envelope.key = "unknown".into(),
                "empty" => envelope.nonce.clear(),
                "oversize" => envelope.bytes = vec![0; 1_048_577],
                _ => unreachable!(),
            }
            assert!(matches!(
                keys.open(&envelope, b"bound context"),
                Err(Error::Integrity)
            ));
        }
    }
}
