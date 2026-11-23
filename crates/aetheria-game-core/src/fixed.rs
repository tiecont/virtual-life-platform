//! Signed milli-units; multiplication/division truncate toward zero, never saturate.
use crate::{Canonical, Error, Value};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct Fixed(i64);

impl Fixed {
    pub const SCALE: i64 = 1000;
    pub const fn from_raw(raw: i64) -> Self {
        Self(raw)
    }
    pub const fn raw(self) -> i64 {
        self.0
    }
    pub fn from_integer(value: i64) -> Result<Self, Error> {
        value
            .checked_mul(Self::SCALE)
            .map(Self)
            .ok_or(Error::Arithmetic)
    }
    pub fn checked_add(self, other: Self) -> Result<Self, Error> {
        self.0
            .checked_add(other.0)
            .map(Self)
            .ok_or(Error::Arithmetic)
    }
    pub fn checked_sub(self, other: Self) -> Result<Self, Error> {
        self.0
            .checked_sub(other.0)
            .map(Self)
            .ok_or(Error::Arithmetic)
    }
    pub fn checked_mul(self, other: Self) -> Result<Self, Error> {
        Self::wide(i128::from(self.0) * i128::from(other.0) / i128::from(Self::SCALE))
    }
    pub fn checked_div(self, other: Self) -> Result<Self, Error> {
        if other.0 == 0 {
            return Err(Error::Arithmetic);
        }
        Self::wide(i128::from(self.0) * i128::from(Self::SCALE) / i128::from(other.0))
    }
    fn wide(value: i128) -> Result<Self, Error> {
        i64::try_from(value)
            .map(Self)
            .map_err(|_| Error::Arithmetic)
    }
}

impl Canonical for Fixed {
    fn canonical(&self) -> Value {
        Value::Int(self.0)
    }
}
