//! The reviewed Unity export is the sole geometry input. No client positions.
use crate::{Error, Position};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collision {
    schema_version: u32,
    district_id: String,
    units: String,
    developer_only: bool,
    capsule_radius_mm: i32,
    capsule_skin_mm: i32,
    capsule_height_mm: i32,
    #[serde(rename = "allowedCenterMinXZ")]
    allowed_center_min_xz: [i32; 2],
    #[serde(rename = "allowedCenterMaxXZ")]
    allowed_center_max_xz: [i32; 2],
    boxes: Vec<BoxShape>,
    anchors: Vec<Anchor>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoxShape {
    min_mm: [i32; 3],
    max_mm: [i32; 3],
    walkable_surface: bool,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Anchor {
    id: String,
    position_mm: [i32; 3],
}
impl Collision {
    pub fn aurora() -> Result<Self, Error> {
        Self::parse(include_bytes!(
            "../../../config/aurora-blockout-collision.json"
        ))
    }
    pub fn parse(bytes: &[u8]) -> Result<Self, Error> {
        if bytes.len() > 65536 {
            return Err(Error::InvalidInput);
        }
        let value: Self = serde_json::from_slice(bytes).map_err(|_| Error::InvalidInput)?;
        if value.schema_version != 1
            || value.district_id != "aurora-plaza"
            || value.units != "millimeters"
            || !value.developer_only
            || !(1..=1000).contains(&value.capsule_radius_mm)
            || !(0..=500).contains(&value.capsule_skin_mm)
            || !(1000..=3000).contains(&value.capsule_height_mm)
            || value.boxes.is_empty()
            || value.boxes.len() > 64
            || value.anchors.is_empty()
            || value.anchors.len() > 64
        {
            return Err(Error::InvalidInput);
        }
        for axis in 0..2 {
            if value.allowed_center_min_xz[axis] >= value.allowed_center_max_xz[axis]
                || value.allowed_center_min_xz[axis] < -crate::BOUND_MM
                || value.allowed_center_max_xz[axis] > crate::BOUND_MM
            {
                return Err(Error::InvalidInput);
            }
        }
        for shape in &value.boxes {
            for axis in 0..3 {
                if shape.min_mm[axis] >= shape.max_mm[axis]
                    || shape.min_mm[axis] < -crate::BOUND_MM
                    || shape.max_mm[axis] > crate::BOUND_MM
                {
                    return Err(Error::InvalidInput);
                }
            }
        }
        for anchor in &value.anchors {
            if !value.clear(Position {
                x: anchor.position_mm[0],
                z: anchor.position_mm[2],
            }) {
                return Err(Error::InvalidInput);
            }
        }
        value.spawn()?;
        Ok(value)
    }
    pub fn spawn(&self) -> Result<Position, Error> {
        let mut anchors = self.anchors.iter().filter(|anchor| anchor.id == "spawn");
        let anchor = anchors.next().ok_or(Error::InvalidInput)?;
        if anchors.next().is_some() {
            return Err(Error::InvalidInput);
        }
        Ok(Position {
            x: anchor.position_mm[0],
            z: anchor.position_mm[2],
        })
    }
    pub fn clear(&self, point: Position) -> bool {
        if point.x < self.allowed_center_min_xz[0]
            || point.x > self.allowed_center_max_xz[0]
            || point.z < self.allowed_center_min_xz[1]
            || point.z > self.allowed_center_max_xz[1]
        {
            return false;
        }
        let radius = i64::from(self.capsule_radius_mm + self.capsule_skin_mm);
        self.boxes
            .iter()
            .filter(|shape| !shape.walkable_surface)
            .all(|shape| {
                let x = point.x.clamp(shape.min_mm[0], shape.max_mm[0]);
                let z = point.z.clamp(shape.min_mm[2], shape.max_mm[2]);
                let dx = i64::from(point.x) - i64::from(x);
                let dz = i64::from(point.z) - i64::from(z);
                dx * dx + dz * dz >= radius * radius
            })
    }
    // Sample at <=1mm along a bounded server tick, including both endpoints.
    // This conservative swept check cannot jump through a thin collider.
    pub fn step(&self, from: Position, target: Position) -> Position {
        let dx = i64::from(target.x) - i64::from(from.x);
        let dz = i64::from(target.z) - i64::from(from.z);
        let count = dx.abs().max(dz.abs());
        if count > 200 || !self.clear(from) {
            return from;
        }
        let mut last = from;
        for at in 1..=count {
            let next = Position {
                x: from.x + (dx * at / count) as i32,
                z: from.z + (dz * at / count) as i32,
            };
            if !self.clear(next) {
                break;
            }
            last = next;
        }
        last
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exported_capsule_bounds_and_sweeps_stop_walls_and_teleports() {
        let collision = Collision::aurora().unwrap();
        assert_eq!(collision.spawn().unwrap(), Position { x: 0, z: -4000 });
        assert!(!collision.clear(Position { x: -9000, z: 5500 }));
        assert!(!collision.clear(Position { x: 0, z: 2100 }));
        assert!(!collision.clear(Position { x: 15501, z: 0 }));
        let before = Position { x: -9000, z: 5000 };
        assert_eq!(
            collision.step(before, Position { x: -9000, z: 5200 }).z,
            5020
        );
        assert_eq!(
            collision.step(before, Position { x: -9000, z: 11000 }),
            before
        );
        assert_eq!(
            collision
                .step(Position { x: 15499, z: 0 }, Position { x: 15600, z: 0 })
                .x,
            15500
        );
        assert!(Collision::parse(b"{}").is_err());
        assert!(Collision::parse(&vec![0; 65537]).is_err());
    }
}
