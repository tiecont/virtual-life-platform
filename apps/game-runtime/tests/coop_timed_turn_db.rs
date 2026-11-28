//! Transactional PostgreSQL verification for `arena8-coop-v3` timed turns,
//! background 100ms expiration, late-command rejection, concurrent boundary races,
//! and restart recovery preserving the remaining turn deadline.

use aetheria_gateway::Fault;
use aetheria_gateway::durable::GameCommands;
use aetheria_persistence::{Host, Keys, Owner, Scope};
use aetheria_pet_arena::arena8::coop::{ArtifactLoadout, CoopConfig, CoopPhase, SEATS, SeatInput};
use aetheria_protocol::public;
use aetheria_security::{
    RuntimeScope, TicketVerifier,
    durable::{DurableSession, DurableTrust},
    transport::connect_runtime_postgres,
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, encode};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::net::TcpListener;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use uuid::Uuid;

use aetheria_game_runtime::features::pet_arena::coop::application::INTENT_KIND;
use aetheria_game_runtime::features::pet_arena::coop::domain::{Rules, SYSTEM_ACTOR_ID};
use aetheria_game_runtime::features::runtime::application::{Commands, PING_KIND};

struct TempPg {
    root: PathBuf,
    pgdata: PathBuf,
    ca_file: PathBuf,
    port: u16,
    ticket_der: PathBuf,
    ticket_pub_b64: String,
    started: bool,
}

impl TempPg {
    fn boot() -> Self {
        let short = Uuid::new_v4().simple().to_string();
        let root = PathBuf::from(format!("/tmp/agy-coop-db-{}", &short[..12]));
        let pgdata = root.join("data");
        fs::create_dir_all(&pgdata).expect("create temp dir");
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("chmod root");
        fs::set_permissions(&pgdata, fs::Permissions::from_mode(0o700)).expect("chmod pgdata");

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let key_path = root.join("server.key");
        let cert_path = root.join("server.crt");
        let out = Command::new("openssl")
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                key_path.to_str().unwrap(),
                "-out",
                cert_path.to_str().unwrap(),
                "-days",
                "1",
                "-subj",
                "/CN=127.0.0.1",
                "-addext",
                "subjectAltName=IP:127.0.0.1",
            ])
            .output()
            .expect("openssl req");
        assert!(out.status.success(), "{out:?}");
        fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600)).expect("chmod key");

        let ticket_der = root.join("ticket.der");
        let out = Command::new("openssl")
            .args([
                "genpkey",
                "-algorithm",
                "ed25519",
                "-outform",
                "DER",
                "-out",
                ticket_der.to_str().unwrap(),
            ])
            .output()
            .expect("openssl genpkey");
        assert!(out.status.success(), "{out:?}");

        let pub_der = Command::new("openssl")
            .args([
                "pkey",
                "-inform",
                "DER",
                "-in",
                ticket_der.to_str().unwrap(),
                "-pubout",
                "-outform",
                "DER",
            ])
            .output()
            .expect("openssl pkey pubout");
        assert!(pub_der.status.success(), "{pub_der:?}");
        let raw_pub = &pub_der.stdout[pub_der.stdout.len() - 32..];
        let ticket_pub_b64 = base64url(raw_pub);

        let initdb = Command::new("initdb")
            .args([
                "-D",
                pgdata.to_str().unwrap(),
                "--username=postgres",
                "--auth=trust",
                "--encoding=UTF8",
                "--locale=C",
            ])
            .output()
            .expect("initdb");
        assert!(initdb.status.success(), "{initdb:?}");

        fs::write(
            pgdata.join("pg_hba.conf"),
            "local all all trust\nhostssl all all 127.0.0.1/32 scram-sha-256\n",
        )
        .expect("pg_hba");
        fs::write(
            pgdata.join("postgresql.conf"),
            format!(
                "listen_addresses = '127.0.0.1'\n\
                 port = {port}\n\
                 ssl = on\n\
                 ssl_cert_file = '{}'\n\
                 ssl_key_file = '{}'\n\
                 ssl_min_protocol_version = 'TLSv1.2'\n\
                 password_encryption = scram-sha-256\n\
                 unix_socket_directories = '{}'\n\
                 fsync = off\n\
                 max_connections = 32\n",
                cert_path.display(),
                key_path.display(),
                root.display()
            ),
        )
        .expect("postgresql.conf");

        let log_file = root.join("postgres.log");
        let start = Command::new("pg_ctl")
            .args([
                "-w",
                "-D",
                pgdata.to_str().unwrap(),
                "-l",
                log_file.to_str().unwrap(),
                "start",
            ])
            .output()
            .expect("pg_ctl start");
        assert!(
            start.status.success(),
            "pg_ctl start failed: {} / {}",
            String::from_utf8_lossy(&start.stderr),
            fs::read_to_string(&log_file).unwrap_or_default()
        );

        let mut pg = Self {
            root,
            pgdata,
            ca_file: cert_path,
            port,
            ticket_der,
            ticket_pub_b64,
            started: true,
        };
        pg.init_schema();
        pg
    }

    fn psql(&self, sql: &str) {
        let out = Command::new("psql")
            .args([
                "-h",
                self.root.to_str().unwrap(),
                "-p",
                &self.port.to_string(),
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                sql,
            ])
            .output()
            .expect("psql");
        assert!(
            out.status.success(),
            "psql failed for `{sql}`: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    fn init_schema(&mut self) {
        self.psql(
            "CREATE ROLE coop_runtime_role LOGIN PASSWORD 'coop-runtime-test-pass' \
             NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS \
             CONNECTION LIMIT 16;",
        );
        self.psql(&format!(
            "{}\n{}\n{}\n{}\n{}",
            include_str!("../../../apps/platform-api/src/shared/database/migrations/0048_native_game_storage.sql"),
            "CREATE TABLE identity_accounts (id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'active');\n\
             CREATE TABLE identity_sessions (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, revoked_at timestamptz, expires_at timestamptz NOT NULL);\n\
             CREATE TABLE safety_sanctions (subject_id uuid NOT NULL, revoked_at timestamptz, effective_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, kind text NOT NULL, world_slug text);\n\
             CREATE FUNCTION progression_no_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END; $$;",
            include_str!("../../../apps/platform-api/src/shared/database/migrations/0049_native_runtime_admission.sql"),
            include_str!("../../../apps/platform-api/src/shared/database/migrations/0050_native_reward_settlement.sql"),
            ""
        ));
        self.psql(
            "GRANT USAGE ON SCHEMA public TO coop_runtime_role;\n\
             GRANT SELECT, INSERT ON platform_native_ticket_uses TO coop_runtime_role;\n\
             GRANT SELECT ON identity_accounts, identity_sessions, safety_sanctions, platform_native_worlds, platform_native_admissions TO coop_runtime_role;\n\
             GRANT SELECT, INSERT ON game_native_matches, game_native_receipts, game_native_events, game_native_settlements, game_native_outbox TO coop_runtime_role;\n\
             GRANT UPDATE (state_version, server_tick, logical_time_ms, rng_cursor, status, audit_hash, snapshot_key_id, snapshot_nonce, snapshot_tag, sealed_snapshot, updated_at) ON game_native_matches TO coop_runtime_role;",
        );
    }

    fn runtime_db_url(&self) -> String {
        format!(
            "postgresql://coop_runtime_role:coop-runtime-test-pass@127.0.0.1:{}/postgres",
            self.port
        )
    }
}

impl Drop for TempPg {
    fn drop(&mut self) {
        if self.started {
            let _ = Command::new("pg_ctl")
                .args([
                    "-D",
                    self.pgdata.to_str().unwrap(),
                    "-m",
                    "immediate",
                    "stop",
                ])
                .output();
        }
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn base64url(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = *chunk.get(1).unwrap_or(&0) as usize;
        let b2 = *chunk.get(2).unwrap_or(&0) as usize;
        out.push(TABLE[b0 >> 2] as char);
        out.push(TABLE[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((b1 & 0x0f) << 2) | (b2 >> 6)] as char);
        }
        if chunk.len() > 2 {
            out.push(TABLE[b2 & 0x3f] as char);
        }
    }
    out
}

#[derive(Serialize)]
struct TicketClaims {
    v: u32,
    iss: &'static str,
    aud: &'static str,
    sub: String,
    sid: String,
    jti: String,
    iat: u64,
    nbf: u64,
    exp: u64,
    world: String,
    boot: String,
    content: String,
    protocol: u32,
    scope: &'static str,
    generation: &'static str,
}

fn sign_ticket(
    pem_bytes: &[u8],
    account: Uuid,
    session: Uuid,
    world: &str,
    boot: Uuid,
    content_hex: &str,
) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let jti = Uuid::new_v4().simple().to_string();
    let mut header = Header::new(Algorithm::EdDSA);
    header.typ = Some("aetheria-runtime-ticket+jwt".into());
    header.kid = Some("test-k1".into());
    let claims = TicketClaims {
        v: 1,
        iss: "aetheria-platform-v1",
        aud: "aetheria-native-runtime-v1",
        sub: account.to_string(),
        sid: session.to_string(),
        jti,
        iat: now,
        nbf: now,
        exp: now + 30,
        world: world.into(),
        boot: boot.to_string(),
        content: content_hex.into(),
        protocol: 1,
        scope: "world.connect game.command",
        generation: "1",
    };
    let key = EncodingKey::from_ed_der(pem_bytes);
    encode(&header, &claims, &key).expect("encode ticket")
}

fn intent(match_id: Uuid, version: u64, kind: &str, payload: &[u8]) -> public::GameIntent {
    public::GameIntent {
        game_session_id: match_id.as_bytes().to_vec(),
        expected_state_version: version,
        kind: kind.into(),
        action_payload: payload.to_vec(),
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

struct DbDriver(JoinHandle<Result<(), tokio_postgres::Error>>);
impl Drop for DbDriver {
    fn drop(&mut self) {
        self.0.abort();
    }
}

#[tokio::test]
#[ignore = "requires local PostgreSQL binaries (initdb/pg_ctl/psql) and openssl"]
async fn v3_timed_turn_expiry_late_commands_races_and_restart_recovery() {
    let pg = TempPg::boot();
    let ca_pem = fs::read(&pg.ca_file).expect("ca pem");
    let ticket_der = fs::read(&pg.ticket_der).expect("ticket der");

    let bundle = fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../config/gameplay/arena8-coop-functional-v2.candidate.json"
    ))
    .expect("v2 candidate bundle");
    let digest = CoopConfig::parse(&bundle).unwrap().digest();
    let accounts = [
        Uuid::from_u128(0xaaaa_0000_0000_4000_8000_0000_0000_0001),
        Uuid::from_u128(0xaaaa_0000_0000_4000_8000_0000_0000_0002),
        Uuid::from_u128(0xaaaa_0000_0000_4000_8000_0000_0000_0003),
        Uuid::from_u128(0xaaaa_0000_0000_4000_8000_0000_0000_0004),
    ];
    let sessions = [
        Uuid::from_u128(0xbbbb_0000_0000_4000_8000_0000_0000_0001),
        Uuid::from_u128(0xbbbb_0000_0000_4000_8000_0000_0000_0002),
        Uuid::from_u128(0xbbbb_0000_0000_4000_8000_0000_0000_0003),
        Uuid::from_u128(0xbbbb_0000_0000_4000_8000_0000_0000_0004),
    ];
    let pets = [
        "pet-v3-fire-icarus",
        "pet-v31-water-marivell",
        "pet-v31-electric-quorion",
        "pet-v31-ground-gravorn",
    ];
    let seats: [SeatInput; SEATS] = std::array::from_fn(|i| SeatInput {
        account: accounts[i].to_string(),
        pet_id: pets[i].into(),
        owned_pet_instance_id: format!("inst-{i}"),
        level: 20,
        artifact_power_pm: 0,
    });
    let loadouts: [ArtifactLoadout; SEATS] = seats.each_ref().map(|seat| ArtifactLoadout {
        digest: ArtifactLoadout::digest(digest, seat, &[]),
        entries: vec![],
    });

    let fake_clock = Arc::new(AtomicU64::new(1_700_000_000_000));
    let make_rules = || {
        let clock = Arc::clone(&fake_clock);
        let empty_skills = std::array::from_fn(|_| Vec::new());
        Rules::load_with_skill_levels(
            &bundle,
            seats.clone(),
            "cinder-terraces-warden".into(),
            Some(&loadouts),
            &empty_skills,
        )
        .unwrap()
        .with_clock(Arc::new(move || clock.load(Ordering::Acquire)))
    };
    let rules = make_rules();
    let initial = rules.initial();
    let content_hash = rules.content_hash();
    let content_hex = hex(&content_hash);
    let world_id = "native:coop-timed-test";
    let boot_id = Uuid::new_v4();
    let match_id = Uuid::new_v4();
    let engine_hash = [0x42u8; 32];

    pg.psql(&format!(
        "INSERT INTO platform_native_worlds(world_id,boot_id,content_hash,generation,enabled,capacity,lease_until) \
         VALUES('{world_id}','{boot_id}','{content_hex}',1,true,4,now()+interval '1 hour');"
    ));
    for i in 0..SEATS {
        pg.psql(&format!(
            "INSERT INTO identity_accounts(id,status) VALUES('{}','active');\n\
             INSERT INTO identity_sessions(id,account_id,expires_at) VALUES('{}','{}',now()+interval '1 hour');\n\
             INSERT INTO platform_native_admissions(account_id,session_id,world_id,generation,world_generation,allowed,valid_until) \
             VALUES('{}','{}','{world_id}',1,1,true,now()+interval '1 hour');",
            accounts[i], sessions[i], accounts[i], accounts[i], sessions[i]
        ));
    }

    let db_cfg: tokio_postgres::Config = pg.runtime_db_url().parse().unwrap();
    let role = "coop_runtime_role";
    let keys = || Keys::new("k1".into(), BTreeMap::from([("k1".into(), [0x77u8; 32])])).unwrap();
    let trust = DurableTrust::new(
        TicketVerifier::new(
            BTreeMap::from([(
                "test-k1".into(),
                DecodingKey::from_ed_components(&pg.ticket_pub_b64).unwrap(),
            )]),
            RuntimeScope {
                world: world_id.into(),
                boot: boot_id.to_string(),
                content: content_hex.clone(),
            },
        )
        .unwrap(),
    );

    let owner = Owner::acquire(
        &db_cfg,
        &ca_pem,
        role,
        Scope {
            world: world_id.into(),
            boot: boot_id,
            engine: engine_hash,
        },
    )
    .await
    .expect("owner acquire");
    let host = Host::new(rules, keys(), owner).unwrap();
    let (mut db, driver) = connect_runtime_postgres(&db_cfg, &ca_pem, role)
        .await
        .expect("runtime pg");
    let _driver = DbDriver(driver);

    host.create(&mut db, match_id, initial)
        .await
        .expect("create match");
    let commands = Arc::new(Commands::new(host.clone(), match_id));

    let mut durable_sessions: Vec<DurableSession> = Vec::with_capacity(SEATS);
    for i in 0..SEATS {
        let jwt = sign_ticket(
            &ticket_der,
            accounts[i],
            sessions[i],
            world_id,
            boot_id,
            &content_hex,
        );
        durable_sessions.push(trust.admit(&mut db, &jwt).await.expect("admit seat"));
    }

    // 1. Ping does not commit DB state and reflects server clock.
    let ping_reply = commands
        .execute(
            &mut db,
            &trust,
            &durable_sessions[0],
            Uuid::new_v4().as_bytes(),
            &intent(match_id, 0, PING_KIND, b"{}"),
            true,
        )
        .await
        .expect("ping");
    assert!(!ping_reply.committed);
    assert_eq!(ping_reply.version, 0);
    let ping_json: serde_json::Value = serde_json::from_slice(&ping_reply.projection).unwrap();
    assert_eq!(ping_json["pong"], true);
    assert_eq!(ping_json["serverUnixMs"], 1_700_000_000_000u64);

    // 2. Start stamps turn_deadline_ms = t0 + 15_000ms.
    let cmd_start = Uuid::new_v4();
    let start_reply = commands
        .execute(
            &mut db,
            &trust,
            &durable_sessions[0],
            cmd_start.as_bytes(),
            &intent(
                match_id,
                0,
                INTENT_KIND,
                br#"{"epoch":1,"action":{"kind":"start"}}"#,
            ),
            true,
        )
        .await
        .expect("start");
    assert!(start_reply.committed);
    assert_eq!(start_reply.version, 1);
    let start_state: serde_json::Value = serde_json::from_slice(&start_reply.projection).unwrap();
    assert_eq!(
        start_state["state"]["turnDeadlineUnixMs"],
        1_700_000_015_000u64
    );
    assert_eq!(start_state["state"]["turnRemainingMs"], 15_000);
    assert_eq!(start_state["state"]["turn"], 0);
    assert_eq!(start_state["state"]["activeSeat"], 0);

    // 3. Seat 0 voluntarily passes via EndTurn before deadline (at +4s).
    fake_clock.store(1_700_000_004_000, Ordering::Release);
    let cmd_end = Uuid::new_v4();
    let end_reply = commands
        .execute(
            &mut db,
            &trust,
            &durable_sessions[0],
            cmd_end.as_bytes(),
            &intent(
                match_id,
                1,
                INTENT_KIND,
                br#"{"epoch":1,"action":{"kind":"endTurn"}}"#,
            ),
            true,
        )
        .await
        .expect("end turn");
    assert_eq!(end_reply.version, 2);
    let end_view: serde_json::Value = serde_json::from_slice(&end_reply.projection).unwrap();
    assert_eq!(end_view["state"]["turn"], 1);
    assert_eq!(end_view["state"]["activeSeat"], 1);
    assert_eq!(
        end_view["state"]["turnDeadlineUnixMs"],
        1_700_000_019_000u64
    );
    assert_eq!(end_view["state"]["participants"][0]["mana"], 0);
    assert_eq!(end_view["state"]["participants"][0]["rage"], 0);

    // 4. Late player command for seat 1 AFTER deadline (at +19s >= 1_700_000_019_000)
    // is rejected with Fault::Rejected(StaleVersion) AND triggers system ExpireTurn!
    fake_clock.store(1_700_000_019_000, Ordering::Release);
    let late_err = commands
        .execute(
            &mut db,
            &trust,
            &durable_sessions[1],
            Uuid::new_v4().as_bytes(),
            &intent(
                match_id,
                2,
                INTENT_KIND,
                br#"{"epoch":1,"action":{"kind":"guard"}}"#,
            ),
            true,
        )
        .await
        .err()
        .expect("late command must be rejected");
    assert!(matches!(
        late_err,
        Fault::Rejected(public::ErrorCode::StaleVersion)
    ));

    let (epoch, version, status, after_late) = host
        .inspect_state(&mut db, match_id)
        .await
        .expect("inspect");
    assert_eq!(epoch, 1);
    assert_eq!(version, 3);
    assert_eq!(status, "ACTIVE");
    assert_eq!(after_late.phase, CoopPhase::Playing);
    assert_eq!(after_late.turn_index, 2);
    assert_eq!(after_late.active_seat, 2);
    assert_eq!(after_late.turn_deadline_ms, Some(1_700_000_034_000));

    // 5. Idempotent client retry of previously committed `cmd_end` succeeds even AFTER turn 1 expired!
    let retry_end = commands
        .execute(
            &mut db,
            &trust,
            &durable_sessions[0],
            cmd_end.as_bytes(),
            &intent(
                match_id,
                1,
                INTENT_KIND,
                br#"{"epoch":1,"action":{"kind":"endTurn"}}"#,
            ),
            true,
        )
        .await
        .expect("committed retry must succeed across later turn expiration");
    assert_eq!(retry_end.version, 2);

    // Verify receipt actor_id for committed_version = 3 is SYSTEM_ACTOR_ID (no AFK seat credit).
    let (mut db2, driver2) = connect_runtime_postgres(&db_cfg, &ca_pem, role)
        .await
        .expect("second client");
    let _driver2 = DbDriver(driver2);
    let row = db2
        .query_one(
            "SELECT actor_id::text FROM game_native_receipts WHERE match_id=$1::text::uuid AND committed_version=3",
            &[&match_id.to_string()],
        )
        .await
        .expect("receipt query");
    assert_eq!(row.get::<_, String>(0), SYSTEM_ACTOR_ID);

    // 6. Concurrent boundary race: two ticker calls across two DB clients race at deadline.
    // Exactly one advances turn 2 -> 3; no double-advance.
    fake_clock.store(1_700_000_034_500, Ordering::Release);
    let (res_a, res_b) = tokio::join!(
        commands.tick_expiration(&mut db),
        commands.tick_expiration(&mut db2)
    );
    assert!(res_a.unwrap());
    assert!(res_b.unwrap());
    let (_, version_after_race, _, state_after_race) =
        host.inspect_state(&mut db, match_id).await.unwrap();
    assert_eq!(version_after_race, 4);
    assert_eq!(state_after_race.turn_index, 3);
    assert_eq!(state_after_race.active_seat, 3);
    assert_eq!(state_after_race.turn_deadline_ms, Some(1_700_000_049_500));

    // 6b. Concurrent player-vs-ticker boundary race across two DB clients at exact deadline:
    // Seat 3 tries Guard as fake_clock reaches deadline while ticker checks simultaneously.
    // Exactly one transition commits (turn 3 -> 4 via ExpireTurn) without double-advance.
    fake_clock.store(1_700_000_049_500, Ordering::Release);
    let guard_cmd_id = Uuid::new_v4();
    let guard_intent = intent(
        match_id,
        4,
        INTENT_KIND,
        br#"{"epoch":1,"action":{"kind":"guard"}}"#,
    );
    let (player_res, ticker_res) = tokio::join!(
        commands.execute(
            &mut db,
            &trust,
            &durable_sessions[3],
            guard_cmd_id.as_bytes(),
            &guard_intent,
            true
        ),
        commands.tick_expiration(&mut db2)
    );
    assert!(matches!(
        player_res.err(),
        Some(Fault::Rejected(public::ErrorCode::StaleVersion))
    ));
    assert!(ticker_res.unwrap());
    let (_, version_after_player_race, _, state_after_player_race) =
        host.inspect_state(&mut db, match_id).await.unwrap();
    assert_eq!(version_after_player_race, 5);
    assert_eq!(state_after_player_race.turn_index, 4);
    assert_eq!(state_after_player_race.round_index, 2);
    assert_eq!(state_after_player_race.active_seat, 0);
    assert_eq!(
        state_after_player_race.turn_deadline_ms,
        Some(1_700_000_064_500)
    );

    // 7. Restart recovery: drop host/owner/commands cleanly, advance clock by 9s (leaving 6s remaining),
    // re-acquire Owner + resume Host, confirm remaining timer is 6_000ms (NOT reset to 15_000ms),
    // then run background ticker until deadline passes.
    drop(commands);
    drop(host);
    fake_clock.store(1_700_000_055_500, Ordering::Release);

    let mut owner2 = None;
    for _ in 0..40 {
        match Owner::acquire(
            &db_cfg,
            &ca_pem,
            role,
            Scope {
                world: world_id.into(),
                boot: boot_id,
                engine: engine_hash,
            },
        )
        .await
        {
            Ok(acquired) => {
                owner2 = Some(acquired);
                break;
            }
            Err(aetheria_persistence::Error::Conflict) => {
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
            Err(other) => panic!("unexpected owner error: {other:?}"),
        }
    }
    let owner2 = owner2.expect("re-acquire owner after restart");
    let host2 = Host::new(make_rules(), keys(), owner2).unwrap();
    host2
        .resume(&mut db, match_id)
        .await
        .expect("resume validates journal");
    let (_, resumed_version, _, resumed_state) =
        host2.inspect_state(&mut db, match_id).await.unwrap();
    assert_eq!(resumed_version, 5);
    assert_eq!(resumed_state.turn_deadline_ms, Some(1_700_000_064_500));

    let view_receipt = host2
        .projection(&mut db, &trust, &durable_sessions[0], match_id)
        .await
        .expect("reconnect projection");
    let view_json: serde_json::Value = serde_json::from_slice(&view_receipt.projection).unwrap();
    assert_eq!(view_json["turnDeadlineUnixMs"], 1_700_000_064_500u64);
    assert_eq!(view_json["turnRemainingMs"], 9_000);
    assert_eq!(view_json["canEndTurn"], true);

    // Spawn background ticker and advance fake clock past deadline to verify real auto-expire.
    let commands2 = Arc::new(Commands::new(host2.clone(), match_id));
    let shared_db = Arc::new(Mutex::new(db));
    let ticker_cmds = Arc::clone(&commands2);
    let ticker_db = Arc::clone(&shared_db);
    let ticker = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(50));
        loop {
            interval.tick().await;
            let mut client = ticker_db.lock().await;
            let _ = ticker_cmds.tick_expiration(&mut client).await;
        }
    });
    fake_clock.store(1_700_000_065_000, Ordering::Release);
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    ticker.abort();

    let mut db_final = shared_db.lock().await;
    let (_, final_ver, _, final_state) =
        host2.inspect_state(&mut db_final, match_id).await.unwrap();
    assert_eq!(final_ver, 6);
    assert_eq!(final_state.turn_index, 5);
    assert_eq!(final_state.round_index, 2);
    assert_eq!(final_state.active_seat, 1);
}
