//! Default-off, trusted-host zone prototype. No network, database or auth adapter.
//! AOI is a geometric candidate set, never permission to disclose a participant.
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, oneshot, watch};

pub const TICK_PERIOD: Duration = Duration::from_millis(50);
pub const MAX_ACTORS: usize = 256;
pub const MAX_MAILBOX: usize = 256;
pub const MAX_SAMPLES: usize = 4096;
pub const BOUND_MM: i32 = 100_000;
pub const AOI_MM: i32 = 5000;
const STEP_MM: i32 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidInput,
    Capacity,
    DuplicateActor,
    StaleInput,
    StaleActor,
    WrongZone,
    Backpressure,
    Closed,
}
pub type Reply<T> = oneshot::Receiver<Result<T, Error>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Position {
    pub x: i32,
    pub z: i32,
}
impl Position {
    fn valid(self) -> bool {
        (-BOUND_MM..=BOUND_MM).contains(&self.x) && (-BOUND_MM..=BOUND_MM).contains(&self.z)
    }
    fn cell(self) -> (i32, i32) {
        (self.x.div_euclid(AOI_MM), self.z.div_euclid(AOI_MM))
    }
}

#[derive(Clone, Copy, Default)]
struct Input {
    sequence: u64,
    x: i32,
    z: i32,
}

// A trusted host keeps this handle private to the authenticated connection.
// Rejoining the same ID gets a different generation and movement buffer.
pub struct ActorHandle {
    id: u64,
    generation: u64,
    domain: Arc<()>,
    movement: watch::Sender<Input>,
}
impl ActorHandle {
    pub fn input(&self, sequence: u64, x: i32, z: i32) -> Result<(), Error> {
        if sequence == 0 || !(-1000..=1000).contains(&x) || !(-1000..=1000).contains(&z) {
            return Err(Error::InvalidInput);
        }
        if self.movement.is_closed() {
            return Err(Error::StaleActor);
        }
        if !self.movement.send_if_modified(|current| {
            if sequence <= current.sequence {
                return false;
            }
            *current = Input { sequence, x, z };
            true
        }) {
            return Err(Error::StaleInput);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entity {
    pub id: u64,
    pub position: Position,
    pub last_input: u64,
}
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub tick: u64,
    pub visible: Vec<Entity>,
    pub actor_count: usize,
    pub queue_high_water: usize,
    pub tick_samples_us: Vec<u64>,
    pub tick_p95_us: u64,
    pub compute_overruns: u64,
    pub late_wakes: u64,
}

enum Command {
    Join(u64, Position, oneshot::Sender<Result<ActorHandle, Error>>),
    Leave(u64, u64, oneshot::Sender<Result<(), Error>>),
    Snapshot(u64, u64, oneshot::Sender<Result<Snapshot, Error>>),
    Stop(oneshot::Sender<Result<(), Error>>),
}

#[derive(Clone)]
pub struct ZoneHandle {
    commands: mpsc::Sender<Command>,
    domain: Arc<()>,
    queue_high_water: Arc<AtomicUsize>,
}
impl ZoneHandle {
    fn send(&self, command: Command) -> Result<(), Error> {
        let permit = self.commands.try_reserve().map_err(|error| match error {
            mpsc::error::TrySendError::Full(_) => Error::Backpressure,
            mpsc::error::TrySendError::Closed(_) => Error::Closed,
        })?;
        self.queue_high_water.fetch_max(
            self.commands.max_capacity() - self.commands.capacity(),
            Ordering::Relaxed,
        );
        permit.send(command);
        Ok(())
    }
    pub fn join(&self, id: u64, spawn: Position) -> Result<Reply<ActorHandle>, Error> {
        if id == 0 || !spawn.valid() {
            return Err(Error::InvalidInput);
        }
        let (send, receive) = oneshot::channel();
        self.send(Command::Join(id, spawn, send))?;
        Ok(receive)
    }
    fn owns(&self, actor: &ActorHandle) -> Result<(), Error> {
        if !Arc::ptr_eq(&self.domain, &actor.domain) {
            return Err(Error::WrongZone);
        }
        Ok(())
    }
    pub fn leave(&self, actor: &ActorHandle) -> Result<Reply<()>, Error> {
        self.owns(actor)?;
        let (send, receive) = oneshot::channel();
        self.send(Command::Leave(actor.id, actor.generation, send))?;
        Ok(receive)
    }
    pub fn snapshot(&self, actor: &ActorHandle) -> Result<Reply<Snapshot>, Error> {
        self.owns(actor)?;
        let (send, receive) = oneshot::channel();
        self.send(Command::Snapshot(actor.id, actor.generation, send))?;
        Ok(receive)
    }
    pub fn stop(&self) -> Result<Reply<()>, Error> {
        let (send, receive) = oneshot::channel();
        self.send(Command::Stop(send))?;
        Ok(receive)
    }
}

struct Actor {
    generation: u64,
    position: Position,
    last_input: u64,
    movement: watch::Receiver<Input>,
}

pub struct Zone {
    receiver: mpsc::Receiver<Command>,
    domain: Arc<()>,
    actors: BTreeMap<u64, Actor>,
    cells: BTreeMap<(i32, i32), BTreeSet<u64>>,
    capacity: usize,
    next_generation: u64,
    tick: u64,
    samples: VecDeque<u64>,
    queue_high_water: Arc<AtomicUsize>,
    compute_overruns: u64,
    late_wakes: u64,
}

pub fn zone(capacity: usize, mailbox: usize) -> Result<(ZoneHandle, Zone), Error> {
    if capacity == 0 || capacity > MAX_ACTORS || mailbox == 0 || mailbox > MAX_MAILBOX {
        return Err(Error::InvalidInput);
    }
    let (commands, receiver) = mpsc::channel(mailbox);
    let domain = Arc::new(());
    let queue_high_water = Arc::new(AtomicUsize::new(0));
    Ok((
        ZoneHandle {
            commands,
            domain: Arc::clone(&domain),
            queue_high_water: Arc::clone(&queue_high_water),
        },
        Zone {
            receiver,
            domain,
            actors: BTreeMap::new(),
            cells: BTreeMap::new(),
            capacity,
            next_generation: 0,
            tick: 0,
            samples: VecDeque::new(),
            queue_high_water,
            compute_overruns: 0,
            late_wakes: 0,
        },
    ))
}

impl Zone {
    fn join(&mut self, id: u64, position: Position) -> Result<ActorHandle, Error> {
        if self.actors.contains_key(&id) {
            return Err(Error::DuplicateActor);
        }
        if self.actors.len() == self.capacity {
            return Err(Error::Capacity);
        }
        self.next_generation = self.next_generation.checked_add(1).ok_or(Error::Capacity)?;
        let generation = self.next_generation;
        let (send, movement) = watch::channel(Input::default());
        self.actors.insert(
            id,
            Actor {
                generation,
                position,
                last_input: 0,
                movement,
            },
        );
        self.cells.entry(position.cell()).or_default().insert(id);
        Ok(ActorHandle {
            id,
            generation,
            domain: Arc::clone(&self.domain),
            movement: send,
        })
    }
    fn actor(&self, id: u64, generation: u64) -> Result<&Actor, Error> {
        self.actors
            .get(&id)
            .filter(|actor| actor.generation == generation)
            .ok_or(Error::StaleActor)
    }
    fn remove_cell(&mut self, id: u64, position: Position) {
        let cell = position.cell();
        if let Some(ids) = self.cells.get_mut(&cell) {
            ids.remove(&id);
            if ids.is_empty() {
                self.cells.remove(&cell);
            }
        }
    }
    fn leave(&mut self, id: u64, generation: u64) -> Result<(), Error> {
        let position = self.actor(id, generation)?.position;
        self.actors.remove(&id);
        self.remove_cell(id, position);
        Ok(())
    }
    fn snapshot(&self, id: u64, generation: u64) -> Result<Snapshot, Error> {
        let center = self.actor(id, generation)?.position;
        let (cx, cz) = center.cell();
        let mut visible = Vec::new();
        for x in cx - 1..=cx + 1 {
            for z in cz - 1..=cz + 1 {
                for id in self.cells.get(&(x, z)).into_iter().flatten() {
                    let actor = &self.actors[id];
                    let dx = i64::from(actor.position.x) - i64::from(center.x);
                    let dz = i64::from(actor.position.z) - i64::from(center.z);
                    if dx * dx + dz * dz <= i64::from(AOI_MM).pow(2) {
                        visible.push(Entity {
                            id: *id,
                            position: actor.position,
                            last_input: actor.last_input,
                        });
                    }
                }
            }
        }
        visible.sort_unstable_by_key(|entity| entity.id);
        let mut ordered: Vec<_> = self.samples.iter().copied().collect();
        ordered.sort_unstable();
        let p95 = if ordered.is_empty() {
            0
        } else {
            ordered[(ordered.len() * 95).div_ceil(100) - 1]
        };
        Ok(Snapshot {
            tick: self.tick,
            visible,
            actor_count: self.actors.len(),
            queue_high_water: self.queue_high_water.load(Ordering::Relaxed),
            tick_samples_us: self.samples.iter().copied().collect(),
            tick_p95_us: p95,
            compute_overruns: self.compute_overruns,
            late_wakes: self.late_wakes,
        })
    }
    fn advance(&mut self) -> Result<(), Error> {
        let start = Instant::now();
        self.tick = self.tick.checked_add(1).ok_or(Error::Capacity)?;
        let mut disconnected = Vec::new();
        let mut changes = Vec::new();
        for (id, actor) in &mut self.actors {
            if actor.movement.has_changed().is_err() {
                disconnected.push((*id, actor.generation));
                continue;
            }
            let input = *actor.movement.borrow_and_update();
            if input.sequence <= actor.last_input {
                continue;
            }
            actor.last_input = input.sequence;
            // Conservative integer L1 cap: a diagonal cannot exceed cardinal speed.
            // Each input acts once; silence stops movement at the next tick.
            let divisor = 1000.max(input.x.abs() + input.z.abs());
            let old = actor.position;
            actor.position.x = (old.x + input.x * STEP_MM / divisor).clamp(-BOUND_MM, BOUND_MM);
            actor.position.z = (old.z + input.z * STEP_MM / divisor).clamp(-BOUND_MM, BOUND_MM);
            if old.cell() != actor.position.cell() {
                changes.push((*id, old, actor.position));
            }
        }
        for (id, old, new) in changes {
            self.remove_cell(id, old);
            self.cells.entry(new.cell()).or_default().insert(id);
        }
        for (id, generation) in disconnected {
            self.leave(id, generation)?;
        }
        let elapsed = start.elapsed();
        if elapsed > TICK_PERIOD {
            self.compute_overruns += 1;
        }
        if self.samples.len() == MAX_SAMPLES {
            self.samples.pop_front();
        }
        self.samples
            .push_back(elapsed.as_micros().try_into().unwrap_or(u64::MAX));
        Ok(())
    }
    pub async fn run(mut self) -> Result<(), Error> {
        let mut timer = tokio::time::interval(TICK_PERIOD);
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                biased;
                scheduled = timer.tick() => {
                    if tokio::time::Instant::now().saturating_duration_since(scheduled) >= TICK_PERIOD {
                        self.late_wakes += 1;
                    }
                    self.advance()?;
                }
                command = self.receiver.recv() => {
                    match command {
                        Some(Command::Join(id, position, reply)) => { let _ = reply.send(self.join(id, position)); }
                        Some(Command::Leave(id, generation, reply)) => { let _ = reply.send(self.leave(id, generation)); }
                        Some(Command::Snapshot(id, generation, reply)) => { let _ = reply.send(self.snapshot(id, generation)); }
                        Some(Command::Stop(reply)) => { let _ = reply.send(Ok(())); return Ok(()); }
                        None => return Ok(()),
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests;
