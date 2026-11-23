use crate::{Error, Value, canonical, canonical::list};
use hmac::{Hmac, Mac};
use rand_chacha::{
    ChaCha20Rng,
    rand_core::{Rng, SeedableRng},
};
use sha2::Sha256;
use zeroize::Zeroizing;

pub const RNG_VERSION: u32 = 1;
pub const MAX_WORDS_PER_TURN: u64 = 16_384;

/// Host supplies a fresh OS-CSPRNG 256-bit seed per match; never a client seed.
/// Deliberately has no Debug/Clone/Serialize/export implementation.
pub struct SecretSeed(Zeroizing<[u8; 32]>);

impl SecretSeed {
    pub fn from_host_entropy(bytes: [u8; 32]) -> Self {
        Self(Zeroizing::new(bytes))
    }
    pub(crate) fn commitment(&self, binding: Value) -> Result<[u8; 32], Error> {
        canonical::hash(
            "vl.seed-commit.v1",
            &list([binding, Value::Bytes(self.0.to_vec())]),
        )
    }
    fn key(&self, binding: Value) -> Result<[u8; 32], Error> {
        let mut mac =
            Hmac::<Sha256>::new_from_slice(self.0.as_ref()).map_err(|_| Error::InvalidState)?;
        mac.update(&canonical::encode(&list([
            Value::Text("vl.rng-key.v1".into()),
            binding,
        ]))?);
        Ok(mac.finalize().into_bytes().into())
    }
}

/// Ephemeral, server-only stream. Failed turns discard it and consume no durable entropy.
pub struct TurnRng {
    rng: ChaCha20Rng,
    start: u64,
    cursor: u64,
}

impl TurnRng {
    pub(crate) fn new(seed: &SecretSeed, binding: Value, cursor: u64) -> Result<Self, Error> {
        let key = Zeroizing::new(seed.key(binding)?);
        let mut rng = ChaCha20Rng::from_seed(*key);
        rng.set_word_pos(u128::from(cursor));
        Ok(Self {
            rng,
            start: cursor,
            cursor,
        })
    }
    pub fn cursor(&self) -> u64 {
        self.cursor
    }
    pub fn next_word(&mut self) -> Result<u32, Error> {
        if self.cursor - self.start >= MAX_WORDS_PER_TURN {
            return Err(Error::EntropyExhausted);
        }
        let next = self.cursor.checked_add(1).ok_or(Error::EntropyExhausted)?;
        let word = self.rng.next_u32();
        self.cursor = next;
        Ok(word)
    }
    pub fn below(&mut self, upper: u32) -> Result<u32, Error> {
        if upper == 0 {
            return Err(Error::InvalidAction);
        }
        let limit = (1_u64 << 32) - (1_u64 << 32) % u64::from(upper);
        loop {
            let word = self.next_word()?;
            if u64::from(word) < limit {
                return Ok(word % upper);
            }
        }
    }
    pub fn shuffle<T>(&mut self, items: &mut [T]) -> Result<(), Error> {
        if items.len() > 512 {
            return Err(Error::Capacity);
        }
        for index in (1..items.len()).rev() {
            let target = self.below((index + 1) as u32)? as usize;
            items.swap(index, target);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn stream(cursor: u64) -> TurnRng {
        TurnRng::new(
            &SecretSeed::from_host_entropy([7; 32]),
            Value::Text("test".into()),
            cursor,
        )
        .unwrap()
    }
    #[test]
    fn upstream_chacha20_reference_vector() {
        let mut rng = ChaCha20Rng::from_seed([0; 32]);
        // Published ChaCha20 zero-key/zero-nonce block, little-endian words.
        assert_eq!(
            [
                rng.next_u32(),
                rng.next_u32(),
                rng.next_u32(),
                rng.next_u32()
            ],
            [0xade0b876, 0x903df1a0, 0xe56a5d40, 0x28bd8653]
        );
    }
    #[test]
    fn entropy_limits_resume_and_rejection_sampling() {
        let mut rng = stream(0);
        assert_eq!(rng.below(0), Err(Error::InvalidAction));
        assert_eq!(rng.cursor(), 0);
        for _ in 0..100 {
            let value = rng.below(0x8000_0001).unwrap();
            assert!(value < 0x8000_0001);
        }
        assert!(rng.cursor() > 100); // Actual rejected words consume stream positions.
        let mut restored = stream(rng.cursor());
        assert_eq!(rng.next_word(), restored.next_word());
        let mut empty = stream(u64::MAX);
        assert_eq!(empty.next_word(), Err(Error::EntropyExhausted));
        let mut rng = stream(0);
        for _ in 0..MAX_WORDS_PER_TURN {
            rng.next_word().unwrap();
        }
        assert_eq!(rng.next_word(), Err(Error::EntropyExhausted));
    }
    #[test]
    fn shuffle_is_repeatable_and_preserves_items() {
        let mut a: Vec<_> = (0..512).collect();
        let mut b = a.clone();
        stream(0).shuffle(&mut a).unwrap();
        stream(0).shuffle(&mut b).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, (0..512).collect::<Vec<_>>());
        a.sort_unstable();
        assert_eq!(a, (0..512).collect::<Vec<_>>());
        assert_eq!(stream(0).shuffle(&mut [0; 513]), Err(Error::Capacity));
        stream(0).shuffle(&mut [] as &mut [u8]).unwrap();
    }
    #[test]
    fn match_binding_changes_commitment_and_stream() {
        let seed = SecretSeed::from_host_entropy([7; 32]);
        let a = Value::Text("match-a".into());
        let b = Value::Text("match-b".into());
        assert_ne!(
            seed.commitment(a.clone()).unwrap(),
            seed.commitment(b.clone()).unwrap()
        );
        assert_ne!(
            TurnRng::new(&seed, a, 0).unwrap().next_word(),
            TurnRng::new(&seed, b, 0).unwrap().next_word()
        );
    }
}
