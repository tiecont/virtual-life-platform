//! Version 1 canonical binary data. No floats, unordered maps or implicit serializers.
use crate::Error;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const MAX_BYTES: usize = 1_048_576;
const MAX_NODES: usize = 30_000;
const MAX_DEPTH: usize = 32;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Int(i64),
    Uint(u64),
    Bytes(Vec<u8>),
    Text(String),
    List(Vec<Value>),
    Map(BTreeMap<String, Value>),
}

pub trait Canonical {
    fn canonical(&self) -> Value;
}

impl Canonical for Value {
    fn canonical(&self) -> Value {
        self.clone()
    }
}

pub fn encode(value: &Value) -> Result<Vec<u8>, Error> {
    struct Encoder {
        bytes: Vec<u8>,
        nodes: usize,
    }
    impl Encoder {
        fn put(&mut self, bytes: &[u8]) -> Result<(), Error> {
            if bytes.len() > MAX_BYTES - self.bytes.len() {
                return Err(Error::Capacity);
            }
            self.bytes.extend_from_slice(bytes);
            Ok(())
        }
        fn size(&mut self, size: usize) -> Result<(), Error> {
            let size = u32::try_from(size).map_err(|_| Error::Capacity)?;
            self.put(&size.to_be_bytes())
        }
        fn value(&mut self, value: &Value, depth: usize) -> Result<(), Error> {
            self.nodes += 1;
            if depth > MAX_DEPTH || self.nodes > MAX_NODES {
                return Err(Error::Capacity);
            }
            match value {
                Value::Null => self.put(&[0]),
                Value::Bool(v) => self.put(&[1, u8::from(*v)]),
                Value::Int(v) => {
                    self.put(&[2])?;
                    self.put(&v.to_be_bytes())
                }
                Value::Uint(v) => {
                    self.put(&[3])?;
                    self.put(&v.to_be_bytes())
                }
                Value::Bytes(v) => {
                    self.put(&[4])?;
                    self.size(v.len())?;
                    self.put(v)
                }
                Value::Text(v) => {
                    self.put(&[5])?;
                    self.size(v.len())?;
                    self.put(v.as_bytes())
                }
                Value::List(v) => {
                    self.put(&[6])?;
                    self.size(v.len())?;
                    for item in v {
                        self.value(item, depth + 1)?;
                    }
                    Ok(())
                }
                Value::Map(v) => {
                    self.put(&[7])?;
                    self.size(v.len())?;
                    for (key, item) in v {
                        self.size(key.len())?;
                        self.put(key.as_bytes())?;
                        self.value(item, depth + 1)?;
                    }
                    Ok(())
                }
            }
        }
    }
    let mut encoder = Encoder {
        bytes: b"VL-CANON\x01".to_vec(),
        nodes: 0,
    };
    encoder.value(value, 0)?;
    Ok(encoder.bytes)
}

pub fn hash(domain: &str, value: &Value) -> Result<[u8; 32], Error> {
    if domain.len() > 64 {
        return Err(Error::Capacity);
    }
    // Bound caller-owned trees before cloning them into the framed hash input.
    encode(value)?;
    // Domain and payload are independently length framed by the canonical codec.
    let bytes = encode(&Value::List(vec![
        Value::Text(domain.to_owned()),
        value.clone(),
    ]))?;
    Ok(Sha256::digest(bytes).into())
}

pub fn list(values: impl IntoIterator<Item = Value>) -> Value {
    Value::List(values.into_iter().collect())
}
