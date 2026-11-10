use std::time::Instant;
use vl_world::{Position, TICK_PERIOD, zone};

#[tokio::main]
async fn main() {
    let started = Instant::now();
    let (handle, zone) = zone(20, 32).unwrap();
    let mut pending = Vec::new();
    for id in 1..=20 {
        pending.push(
            handle
                .join(
                    id,
                    Position {
                        x: (id as i32 % 5) * 2500,
                        z: (id as i32 / 5) * 2500,
                    },
                )
                .unwrap(),
        );
    }
    let task = tokio::spawn(zone.run());
    let mut actors = Vec::new();
    for reply in pending {
        actors.push(reply.await.unwrap().unwrap());
    }
    let mut timer = tokio::time::interval(TICK_PERIOD);
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    for sequence in 1..=100 {
        timer.tick().await;
        for (index, actor) in actors.iter().enumerate() {
            actor
                .input(
                    sequence,
                    if (sequence / 10 + index as u64).is_multiple_of(2) {
                        1000
                    } else {
                        -1000
                    },
                    0,
                )
                .unwrap();
        }
    }
    tokio::time::sleep(TICK_PERIOD * 2).await;
    let snapshot = handle.snapshot(&actors[0]).unwrap().await.unwrap().unwrap();
    assert_eq!(snapshot.actor_count, 20);
    assert!(snapshot.tick >= 100);
    assert!(snapshot.queue_high_water <= 32);
    assert!(
        snapshot
            .visible
            .iter()
            .any(|entity| entity.id == 1 && entity.last_input == 100)
    );
    handle.stop().unwrap().await.unwrap().unwrap();
    task.await.unwrap().unwrap();
    println!(
        "{}",
        serde_json::json!({
            "result":"PASS", "scope":"Default-off trusted-host zone prototype; no network/auth/privacy or Windows qualification",
            "actors":snapshot.actor_count, "scripted_inputs":2000, "tick_period_ms":50, "ticks":snapshot.tick,
            "wall_ms":started.elapsed().as_millis(), "tick_p95_us":snapshot.tick_p95_us,
            "tick_compute_overruns":snapshot.compute_overruns, "late_wakes":snapshot.late_wakes,
            "tick_samples_us":snapshot.tick_samples_us, "queue_capacity":32,
            "queue_high_water":snapshot.queue_high_water, "movement_buffers":20, "database_dependencies":[],
            "joined_task":true
        })
    );
}
