use super::*;

#[tokio::test]
async fn scoped_movement_validates_incarnation_sequence_clock_and_cancellation_at_tick() {
    let (handle, zone) = zone(2, 8).unwrap();
    let zone = zone
        .with_collision(collision::Collision::aurora().unwrap())
        .with_epoch(500)
        .unwrap();
    let task = tokio::spawn(zone.run());
    let actor = handle
        .join(1, Position { x: 0, z: -4000 })
        .unwrap()
        .await
        .unwrap()
        .unwrap();
    let initial = handle.snapshot(&actor).unwrap().await.unwrap().unwrap();
    let input = |sequence, epoch, tick| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        movement::MoveInput {
            sequence,
            epoch,
            expected_tick: tick,
            x: 1000,
            z: 0,
            sent_at_ms: now,
            expires_at_ms: now + 5000,
        }
    };
    let mut request = handle
        .move_actor(&actor, input(1, initial.authority_epoch + 1, initial.tick))
        .unwrap();
    assert_eq!((&mut request.reply).await.unwrap(), Err(Error::StaleEpoch));
    drop(request);
    let mut request = handle
        .move_actor(&actor, input(2, initial.authority_epoch, initial.tick))
        .unwrap();
    assert_eq!((&mut request.reply).await.unwrap(), Err(Error::StaleInput));
    drop(request);
    let mut expired = input(1, initial.authority_epoch, initial.tick);
    expired.expires_at_ms = 1;
    let mut request = handle.move_actor(&actor, expired).unwrap();
    assert_eq!((&mut request.reply).await.unwrap(), Err(Error::Closed));
    drop(request);
    let request = handle
        .move_actor(&actor, input(1, initial.authority_epoch, initial.tick))
        .unwrap();
    drop(request);
    tokio::time::sleep(TICK_PERIOD * 2).await;
    assert_eq!(
        handle
            .snapshot(&actor)
            .unwrap()
            .await
            .unwrap()
            .unwrap()
            .visible[0]
            .position
            .x,
        0
    );
    let mut request = handle
        .move_actor(&actor, input(1, initial.authority_epoch, initial.tick))
        .unwrap();
    assert_eq!((&mut request.reply).await.unwrap().unwrap().position.x, 20);
    drop(request);
    let (other, _) = super::zone(1, 1).unwrap();
    assert!(matches!(
        other.move_actor(&actor, input(2, initial.authority_epoch, initial.tick)),
        Err(Error::WrongZone)
    ));
    handle.stop().unwrap().await.unwrap().unwrap();
    task.await.unwrap().unwrap();
}

#[test]
fn aurora_writer_caps_acceleration_floods_and_collisions_without_position_input() {
    let (_, zone) = zone(2, 8).unwrap();
    let mut zone = zone.with_collision(collision::Collision::aurora().unwrap());
    assert!(matches!(
        zone.join(1, Position { x: -9000, z: 6000 }),
        Err(Error::InvalidInput)
    ));
    let actor = zone.join(1, Position { x: -9000, z: 4600 }).unwrap();
    actor.input(1, 0, 1000).unwrap();
    zone.advance().unwrap();
    assert_eq!(zone.actors[&1].position.z, 4620);
    for sequence in 2..=10000 {
        actor.input(sequence, 0, 1000).unwrap();
    }
    zone.advance().unwrap();
    assert_eq!(zone.actors[&1].position.z, 4660);
    for sequence in 10001..=10100 {
        actor.input(sequence, 0, 1000).unwrap();
        zone.advance().unwrap();
    }
    assert_eq!(zone.actors[&1].position.z, 5020);
    assert_eq!(zone.actors[&1].velocity.z, 0);
    assert_eq!(actor.input(10100, 0, -1000), Err(Error::StaleInput));
    actor.input(10101, 0, -1000).unwrap();
    zone.advance().unwrap();
    assert_eq!(zone.actors[&1].position.z, 5000);
    zone.advance().unwrap();
    assert_eq!(zone.actors[&1].velocity, Position::default());
    drop(actor);
    zone.advance().unwrap();
    assert!(zone.actors.is_empty());
}

#[test]
fn queue_capacity_and_zone_identity_fail_closed() {
    assert!(zone(0, 1).is_err());
    assert!(zone(MAX_ACTORS + 1, 1).is_err());
    let (handle, mut zone) = zone(2, 1).unwrap();
    let pending = handle.join(1, Position::default()).unwrap();
    assert!(matches!(
        handle.join(2, Position::default()),
        Err(Error::Backpressure)
    ));
    drop(pending);
    let actor = zone.join(1, Position::default()).unwrap();
    let (other, _) = super::zone(1, 1).unwrap();
    assert!(matches!(other.snapshot(&actor), Err(Error::WrongZone)));
    assert!(matches!(
        handle.join(0, Position::default()),
        Err(Error::InvalidInput)
    ));
    assert!(matches!(
        handle.join(2, Position { x: i32::MAX, z: 0 }),
        Err(Error::InvalidInput)
    ));
}

#[test]
fn movement_is_coalesced_bounded_sequenced_and_disconnect_removes_actor() {
    let (_, mut zone) = zone(2, 8).unwrap();
    let actor = zone.join(1, Position::default()).unwrap();
    for sequence in 1..=10_000 {
        actor.input(sequence, 1000, 1000).unwrap();
    }
    assert_eq!(actor.input(9999, 0, 0), Err(Error::StaleInput));
    assert_eq!(actor.input(10_001, i32::MIN, 0), Err(Error::InvalidInput));
    zone.advance().unwrap();
    assert_eq!(
        zone.actor(1, actor.generation).unwrap().position,
        Position { x: 50, z: 50 }
    );
    assert_eq!(zone.actor(1, actor.generation).unwrap().last_input, 10_000);
    zone.advance().unwrap();
    assert_eq!(zone.actor(1, actor.generation).unwrap().position.x, 50);
    zone.leave(1, actor.generation).unwrap();
    let replacement = zone
        .join(
            1,
            Position {
                x: BOUND_MM - 1,
                z: 0,
            },
        )
        .unwrap();
    assert_eq!(actor.input(10_001, 0, 0), Err(Error::StaleActor));
    assert_eq!(zone.leave(1, actor.generation), Err(Error::StaleActor));
    replacement.input(1, 1000, 0).unwrap();
    zone.advance().unwrap();
    assert_eq!(
        zone.actor(1, replacement.generation).unwrap().position.x,
        BOUND_MM
    );
    drop(replacement);
    zone.advance().unwrap();
    assert!(zone.actors.is_empty());
    assert!(zone.cells.is_empty());
}

#[test]
fn spatial_grid_matches_brute_force_across_negative_cells_edges_and_moves() {
    let (_, mut zone) = zone(64, 8).unwrap();
    let mut actors = Vec::new();
    for id in 1..=64 {
        let position = Position {
            x: (id as i32 % 8) * 1701 - 6500,
            z: (id as i32 / 8) * 1399 - 5500,
        };
        actors.push(zone.join(id, position).unwrap());
    }
    for tick in 1..=60 {
        for actor in &actors {
            actor
                .input(tick, if actor.id % 2 == 0 { 1000 } else { -1000 }, 0)
                .unwrap();
        }
        zone.advance().unwrap();
        for actor in &actors {
            let snapshot = zone.snapshot(actor.id, actor.generation).unwrap();
            let center = zone.actors[&actor.id].position;
            let expected: Vec<_> = zone
                .actors
                .iter()
                .filter_map(|(id, row)| {
                    let dx = i64::from(center.x) - i64::from(row.position.x);
                    let dz = i64::from(center.z) - i64::from(row.position.z);
                    (dx * dx + dz * dz <= i64::from(AOI_MM).pow(2)).then_some(*id)
                })
                .collect();
            assert_eq!(
                snapshot
                    .visible
                    .iter()
                    .map(|row| row.id)
                    .collect::<Vec<_>>(),
                expected
            );
        }
    }
}

#[test]
fn capacity_rejoin_and_sample_retention_are_bounded() {
    let (_, mut zone) = zone(1, 8).unwrap();
    let actor = zone.join(1, Position::default()).unwrap();
    assert!(matches!(
        zone.join(1, Position::default()),
        Err(Error::DuplicateActor)
    ));
    assert!(matches!(
        zone.join(2, Position::default()),
        Err(Error::Capacity)
    ));
    for _ in 0..MAX_SAMPLES + 10 {
        zone.advance().unwrap();
    }
    let snapshot = zone.snapshot(1, actor.generation).unwrap();
    assert_eq!(snapshot.tick_samples_us.len(), MAX_SAMPLES);
    assert_eq!(snapshot.tick, MAX_SAMPLES as u64 + 10);
    let mut ordered = snapshot.tick_samples_us;
    ordered.sort_unstable();
    assert_eq!(
        snapshot.tick_p95_us,
        ordered[(MAX_SAMPLES * 95).div_ceil(100) - 1]
    );
}

#[tokio::test]
async fn live_actor_mailbox_replies_and_shutdown_do_not_detach_work() {
    let (handle, zone) = zone(2, 4).unwrap();
    let task = tokio::spawn(zone.run());
    let actor = handle
        .join(1, Position::default())
        .unwrap()
        .await
        .unwrap()
        .unwrap();
    actor.input(1, 1000, 0).unwrap();
    tokio::time::sleep(TICK_PERIOD * 2).await;
    let snapshot = handle.snapshot(&actor).unwrap().await.unwrap().unwrap();
    assert_eq!(snapshot.visible[0].position.x, STEP_MM);
    assert!(snapshot.queue_high_water <= 4);
    handle.leave(&actor).unwrap().await.unwrap().unwrap();
    assert_eq!(
        handle.snapshot(&actor).unwrap().await.unwrap().unwrap_err(),
        Error::StaleActor
    );
    handle.stop().unwrap().await.unwrap().unwrap();
    task.await.unwrap().unwrap();
    assert!(matches!(
        handle.join(1, Position::default()),
        Err(Error::Closed)
    ));
}
