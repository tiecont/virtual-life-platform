use crate::Error;
use vl_game_core::Fixed;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Kind {
    Poison,
    Slow,
    Empower,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Status {
    pub kind: Kind,
    pub potency: Fixed,
    pub remaining_turns: u8,
}

impl Status {
    pub fn new(kind: Kind, potency: Fixed) -> Result<Self, Error> {
        if potency.raw() <= 0 || potency.raw() > 100_000 {
            return Err(Error::InvalidStatus);
        }
        if kind == Kind::Slow && potency.raw() != 1000 {
            return Err(Error::InvalidStatus);
        }
        Ok(Self {
            kind,
            potency,
            remaining_turns: if kind == Kind::Poison { 3 } else { 2 },
        })
    }

    /// Same-kind reapplication refreshes to the maximum; it never adds stacks.
    pub fn refresh(self, incoming: Self) -> Result<Self, Error> {
        self.validate()?;
        incoming.validate()?;
        if self.kind != incoming.kind {
            return Err(Error::InvalidStatus);
        }
        Ok(Self {
            potency: self.potency.max(incoming.potency),
            remaining_turns: self.remaining_turns.max(incoming.remaining_turns),
            ..self
        })
    }

    pub fn validate(self) -> Result<(), Error> {
        let maximum = Self::new(self.kind, self.potency)?;
        if self.remaining_turns == 0 || self.remaining_turns > maximum.remaining_turns {
            return Err(Error::InvalidStatus);
        }
        Ok(())
    }

    /// End-of-turn expiry. The combat owner applies poison before this decrement.
    pub fn expire(self) -> Result<Option<Self>, Error> {
        self.validate()?;
        Ok((self.remaining_turns > 1).then(|| Self {
            remaining_turns: self.remaining_turns - 1,
            ..self
        }))
    }
}

/// Fixed-point shield-first example shared with future combat fixtures.
pub fn shielded_hit(health: Fixed, shield: Fixed, damage: Fixed) -> Result<(Fixed, Fixed), Error> {
    if health.raw() < 0 || shield.raw() < 0 || damage.raw() < 0 {
        return Err(Error::InvalidStatus);
    }
    let absorbed = shield.min(damage);
    let remaining = damage
        .checked_sub(absorbed)
        .map_err(|_| Error::Arithmetic)?;
    let next_health = health
        .checked_sub(remaining)
        .map_err(|_| Error::Arithmetic)?;
    Ok((
        Fixed::from_raw(next_health.raw().max(0)),
        shield
            .checked_sub(absorbed)
            .map_err(|_| Error::Arithmetic)?,
    ))
}
