use super::*;

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
