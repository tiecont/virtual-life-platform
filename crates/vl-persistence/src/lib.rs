//! Opt-in single-owner command host. No routes, migrator, public broadcast or wallet.
mod crypto;
mod recovery;
pub use crypto::Keys;
use crypto::Sealed;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fmt, sync::Arc};
use tokio::task::JoinHandle;
use tokio_postgres::{Client, Config, Row, Transaction};
use uuid::Uuid;
use vl_game_core::{
    Canonical, Checkpoint, Command, LogicalClock, Reducer, SecretSeed, Value, apply, begin,
    canonical,
};
use vl_security::{
    TrustError,
    durable::{DurableSession, DurableTrust},
    transport::connect_runtime_postgres,
};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    Invalid,
    Unauthorized,
    Conflict,
    Collision,
    Integrity,
    Unavailable,
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<tokio_postgres::Error> for Error {
    fn from(_: tokio_postgres::Error) -> Self {
        Self::Unavailable
    }
}
impl From<vl_game_core::Error> for Error {
    fn from(_: vl_game_core::Error) -> Self {
        Self::Invalid
    }
}
const MAX_STATE: usize = 131_072;
const MAX_PROJECTION: usize = 16_384;

/// A reviewed domain must implement codecs, membership and recipient projection.
/// Turn authorization is separate from membership so old receipts remain readable.
pub enum Completion {
    Game,
    PetArena { won: bool },
}

pub trait Game: Reducer + Send + Sync + 'static {
    // The host calls this only when a reducer signals a terminal transition.
    // No amount, recipient or arbitrary payload can cross this boundary.
    fn completion(&self, _state: &Self::State) -> Result<Completion> {
        Ok(Completion::Game)
    }
    fn encode(&self, state: &Self::State) -> Result<Vec<u8>>;
    fn decode(&self, bytes: &[u8]) -> Result<Self::State>;
    fn member(&self, state: &Self::State, account: &str) -> bool;
    fn authorize(&self, state: &Self::State, account: &str, action: &Self::Action) -> bool;
    fn project(&self, state: &Self::State, account: &str) -> Result<Vec<u8>>;
    fn can_spectate(&self, _state: &Self::State, _account: &str) -> bool {
        false
    }
    fn project_public(&self, _state: &Self::State) -> Result<Vec<u8>> {
        Err(Error::Unauthorized)
    }
}

pub struct Scope {
    pub world: String,
    pub boot: Uuid,
    pub engine: [u8; 32],
}
pub struct Request<A> {
    pub match_id: Uuid,
    pub command_id: Uuid,
    pub epoch: i64,
    pub expected_version: i64,
    pub action: A,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RewardStatus {
    Pending,
    Granted,
    Declined,
}

#[derive(PartialEq, Eq)]
pub struct Receipt {
    pub epoch: i64,
    pub version: i64,
    pub projection: Vec<u8>,
    pub reward: Option<RewardStatus>,
}

impl fmt::Debug for Receipt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Receipt")
            .field("epoch", &self.epoch)
            .field("version", &self.version)
            .finish_non_exhaustive()
    }
}

// The SQL driver is cancelled even if acquisition is cancelled before publication.
struct Driver(Option<JoinHandle<std::result::Result<(), tokio_postgres::Error>>>);
impl Drop for Driver {
    fn drop(&mut self) {
        if let Some(task) = &self.0 {
            task.abort();
        }
    }
}
pub struct Owner {
    client: Client,
    _driver: Driver,
    pid: i32,
    key: i64,
    scope: Scope,
}
impl Owner {
    /// A session advisory lock admits one live native host per world. The SQL
    /// transaction rechecks this exact backend/lock before and after native work.
    pub async fn acquire(config: &Config, ca: &[u8], role: &str, scope: Scope) -> Result<Self> {
        if scope.boot.is_nil()
            || scope.engine == [0; 32]
            || !scope.world.starts_with("native:")
            || scope.world.len() > 71
        {
            return Err(Error::Invalid);
        }
        let (client, driver) = connect_runtime_postgres(config, ca, role)
            .await
            .map_err(|_| Error::Unavailable)?;
        let driver = Driver(Some(driver));
        let hash = Sha256::digest(format!("vl.native.owner.v1:{}", scope.world));
        let key = i64::from_be_bytes(hash[..8].try_into().unwrap()) & i64::MAX;
        let row = client
            .query_one("SELECT pg_backend_pid(),pg_try_advisory_lock($1)", &[&key])
            .await?;
        if !row.get::<_, bool>(1) {
            return Err(Error::Conflict);
        }
        Ok(Self {
            client,
            _driver: driver,
            pid: row.get(0),
            key,
            scope,
        })
    }
    async fn check(&self, tx: &Transaction<'_>) -> Result<()> {
        if self.client.is_closed() {
            return Err(Error::Unavailable);
        }
        let exists=tx.query_opt("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=$1 AND granted AND mode='ExclusiveLock' AND classid=($2::bigint>>32)::oid AND objid=($2::bigint&4294967295)::oid AND objsubid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",&[&self.pid,&self.key]).await?;
        if exists.is_none() {
            return Err(Error::Conflict);
        }
        let world=tx.query_opt("SELECT 1 FROM platform_native_worlds WHERE world_id=$1 AND boot_id=$2::text::uuid AND enabled AND lease_until>clock_timestamp()",&[&self.scope.world,&self.scope.boot.to_string()]).await?;
        if world.is_none() {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
struct Disk {
    schema: u32,
    seed: [u8; 32],
    state: Vec<u8>,
    version: i64,
    epoch: i64,
    tick: u64,
    time: u64,
    cursor: u64,
    commitment: [u8; 32],
    audit: [u8; 32],
}
pub struct Host<G> {
    game: Arc<G>,
    keys: Arc<Keys>,
    owner: Arc<Owner>,
}
impl<G> Clone for Host<G> {
    fn clone(&self) -> Self {
        Self {
            game: Arc::clone(&self.game),
            keys: Arc::clone(&self.keys),
            owner: Arc::clone(&self.owner),
        }
    }
}
struct Stored<S> {
    checkpoint: Checkpoint<S>,
    seed: SecretSeed,
    seed_bytes: Zeroizing<[u8; 32]>,
    epoch: i64,
    status: String,
}

impl<G: Game> Host<G>
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
    pub fn game(&self) -> &G {
        &self.game
    }
    pub fn new(game: G, keys: Keys, owner: Owner) -> Result<Self> {
        let rules = game.ruleset();
        if rules.version > i32::MAX as u32 || rules.rng_version != 1 {
            return Err(Error::Invalid);
        }
        Ok(Self {
            game: Arc::new(game),
            keys: Arc::new(keys),
            owner: Arc::new(owner),
        })
    }
    fn aad(
        &self,
        id: Uuid,
        epoch: i64,
        version: i64,
        purpose: &str,
        recipient: &str,
    ) -> Result<Vec<u8>> {
        let rules = self.game.ruleset();
        Ok(canonical::encode(&Value::List(vec![
            Value::Text("vl.storage.v1".into()),
            Value::Text(self.owner.scope.world.clone()),
            Value::Bytes(id.as_bytes().to_vec()),
            Value::Text(rules.id),
            Value::Uint(rules.version.into()),
            Value::Bytes(rules.content_hash.to_vec()),
            Value::Bytes(self.owner.scope.engine.to_vec()),
            Value::Int(epoch),
            Value::Int(version),
            Value::Text(purpose.into()),
            Value::Text(recipient.into()),
        ]))?)
    }
    fn snapshot(&self, cp: &Checkpoint<G::State>, seed: &[u8; 32], epoch: i64) -> Result<Sealed> {
        let state = self.game.encode(&cp.state)?;
        if state.len() > MAX_STATE {
            return Err(Error::Invalid);
        }
        let disk = Disk {
            schema: 1,
            seed: *seed,
            state,
            version: i64::try_from(cp.version).map_err(|_| Error::Invalid)?,
            epoch,
            tick: cp.clock.server_tick,
            time: cp.clock.logical_time_ms,
            cursor: cp.rng_cursor,
            commitment: cp.seed_commitment,
            audit: cp.audit_hash,
        };
        let bytes = Zeroizing::new(serde_json::to_vec(&disk).map_err(|_| Error::Invalid)?);
        self.keys.seal(
            &bytes,
            &self.aad(
                Uuid::from_bytes(cp.match_id),
                epoch,
                disk.version,
                "snapshot",
                "",
            )?,
        )
    }
    fn restore(&self, id: Uuid, row: &Row) -> Result<Stored<G::State>> {
        let rules = self.game.ruleset();
        let epoch: i64 = row.get("epoch");
        let version: i64 = row.get("state_version");
        if row.get::<_, String>("world_id") != self.owner.scope.world
            || row.get::<_, String>("ruleset_id") != rules.id
            || row.get::<_, i32>("ruleset_version") != rules.version as i32
            || row.get::<_, Vec<u8>>("content_hash") != rules.content_hash
            || row.get::<_, Vec<u8>>("engine_hash") != self.owner.scope.engine
            || row.get::<_, i32>("protocol_version") != 1
            || row.get::<_, i32>("canonical_version") != 1
            || row.get::<_, i32>("rng_version") != 1
            || epoch < 1
            || version < 0
        {
            return Err(Error::Integrity);
        }
        let sealed = Sealed {
            key: row.get("snapshot_key_id"),
            nonce: row.get("snapshot_nonce"),
            tag: row.get("snapshot_tag"),
            bytes: row.get("sealed_snapshot"),
        };
        let bytes = self
            .keys
            .open(&sealed, &self.aad(id, epoch, version, "snapshot", "")?)?;
        let disk: Disk = serde_json::from_slice(&bytes).map_err(|_| Error::Integrity)?;
        if disk.schema != 1
            || disk.state.len() > MAX_STATE
            || disk.version != version
            || disk.epoch != epoch
            || disk.tick.to_string() != row.get::<_, String>("tick_text")
            || disk.time.to_string() != row.get::<_, String>("time_text")
            || disk.cursor.to_string() != row.get::<_, String>("cursor_text")
            || row.get::<_, Vec<u8>>("seed_commitment") != disk.commitment
            || row.get::<_, Vec<u8>>("audit_hash") != disk.audit
        {
            return Err(Error::Integrity);
        }
        let state = self.game.decode(&disk.state)?;
        self.game.validate(&state)?;
        let seed = SecretSeed::from_host_entropy(disk.seed);
        let genesis = begin(
            self.game.as_ref(),
            *id.as_bytes(),
            state.clone(),
            &seed,
            LogicalClock {
                server_tick: disk.tick,
                logical_time_ms: disk.time,
            },
        )?;
        if genesis.seed_commitment != disk.commitment {
            return Err(Error::Integrity);
        }
        Ok(Stored {
            checkpoint: Checkpoint {
                match_id: *id.as_bytes(),
                ruleset: rules,
                version: version as u64,
                clock: LogicalClock {
                    server_tick: disk.tick,
                    logical_time_ms: disk.time,
                },
                rng_cursor: disk.cursor,
                seed_commitment: disk.commitment,
                audit_hash: disk.audit,
                state,
            },
            seed,
            seed_bytes: Zeroizing::new(disk.seed),
            epoch,
            status: row.get("status"),
        })
    }
    async fn row(&self, tx: &Transaction<'_>, id: Uuid) -> Result<Row> {
        tx.query_opt("SELECT *,owner_boot_id::text AS boot_text,server_tick::text AS tick_text,logical_time_ms::text AS time_text,rng_cursor::text AS cursor_text FROM game_native_matches WHERE id=$1::text::uuid FOR UPDATE",&[&id.to_string()]).await?.ok_or(Error::Unauthorized)
    }
    async fn reward_status(
        tx: &Transaction<'_>,
        match_id: Uuid,
        final_version: i64,
        account: &str,
    ) -> Result<Option<RewardStatus>> {
        let row = tx
            .query_opt(
                "SELECT o.delivery_outcome FROM game_native_outbox o
             JOIN game_native_receipts r USING (match_id)
             WHERE o.match_id=$1::text::uuid AND r.committed_version=$2
               AND r.actor_id=$3::text::uuid",
                &[&match_id.to_string(), &final_version, &account],
            )
            .await?;
        match row.as_ref().map(|r| r.get::<_, Option<&str>>(0)) {
            None => Ok(None),
            Some(None) => Ok(Some(RewardStatus::Pending)),
            Some(Some("granted")) => Ok(Some(RewardStatus::Granted)),
            Some(Some("declined")) => Ok(Some(RewardStatus::Declined)),
            Some(Some(_)) => Err(Error::Integrity),
        }
    }
    /// Validate an existing checkpoint under the currently leased logical boot.
    /// A different boot requires an explicit allocator recovery procedure.
    pub async fn resume(&self, db: &mut Client, id: Uuid) -> Result<()> {
        let tx = db.transaction().await?;
        tx.batch_execute("SET LOCAL statement_timeout='2000ms';SET LOCAL lock_timeout='1000ms';SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))").await?;
        self.owner.check(&tx).await?;
        let world = tx
            .query_opt(
                "SELECT 1 FROM platform_native_worlds WHERE world_id=$1 AND content_hash=$2",
                &[
                    &self.owner.scope.world,
                    &hex(&self.game.ruleset().content_hash),
                ],
            )
            .await?;
        if world.is_none() {
            return Err(Error::Unauthorized);
        }
        let row = self.row(&tx, id).await?;
        if row.get::<_, String>("boot_text") != self.owner.scope.boot.to_string() {
            return Err(Error::Conflict);
        }
        let stored = self.restore(id, &row)?;
        self.verify_journal(&tx, id, stored.epoch, stored.checkpoint.version)
            .await?;
        self.owner.check(&tx).await?;
        tx.commit().await?;
        Ok(())
    }
    /// Trusted allocator entrypoint, not a player command or a migration.
    pub async fn create(&self, db: &mut Client, id: Uuid, state: G::State) -> Result<()> {
        if id.is_nil() {
            return Err(Error::Invalid);
        }
        let mut seed = Zeroizing::new([0; 32]);
        getrandom::fill(seed.as_mut()).map_err(|_| Error::Unavailable)?;
        let cp = begin(
            self.game.as_ref(),
            *id.as_bytes(),
            state,
            &SecretSeed::from_host_entropy(*seed),
            LogicalClock {
                server_tick: 0,
                logical_time_ms: 0,
            },
        )?;
        let sealed = self.snapshot(&cp, &seed, 1)?;
        let rules = self.game.ruleset();
        let tx = db.transaction().await?;
        tx.batch_execute("SET LOCAL statement_timeout='2000ms';SET LOCAL lock_timeout='1000ms';SELECT pg_advisory_xact_lock(hashtextextended('native-admission-v1',0))").await?;
        self.owner.check(&tx).await?;
        let world = tx
            .query_opt(
                "SELECT 1 FROM platform_native_worlds WHERE world_id=$1 AND content_hash=$2",
                &[&self.owner.scope.world, &hex(&rules.content_hash)],
            )
            .await?;
        if world.is_none() {
            return Err(Error::Unauthorized);
        }
        tx.execute("INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,protocol_version,canonical_version,rng_version,owner_boot_id,epoch,state_version,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot) VALUES($1::text::uuid,$2,$3,$4,$5,$6,1,1,1,$7::text::uuid,1,0,0,0,0,'ACTIVE',$8,$9,$10,$11,$12,$13)",&[&id.to_string(),&self.owner.scope.world,&rules.id,&(rules.version as i32),&&rules.content_hash[..],&&self.owner.scope.engine[..],&self.owner.scope.boot.to_string(),&&cp.seed_commitment[..],&&cp.audit_hash[..],&sealed.key,&sealed.nonce,&sealed.tag,&sealed.bytes]).await?;
        self.owner.check(&tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn execute(
        &self,
        db: &mut Client,
        trust: &DurableTrust,
        session: &DurableSession,
        request: Request<G::Action>,
    ) -> Result<Receipt> {
        if request.match_id.is_nil()
            || request.command_id.is_nil()
            || request.expected_version < 0
            || request.epoch < 1
        {
            return Err(Error::Invalid);
        }
        let host = self.clone();
        trust
            .command(db, session, |tx, actor| {
                Box::pin(async move {
                    tx.batch_execute("SAVEPOINT native_command")
                        .await
                        .map_err(|_| TrustError::PolicyUnavailable)?;
                    let result = host.turn(tx, &actor, request).await;
                    if result.is_err() {
                        tx.batch_execute("ROLLBACK TO SAVEPOINT native_command")
                            .await
                            .map_err(|_| TrustError::PolicyUnavailable)?;
                    }
                    Ok(result)
                })
            })
            .await
            .map_err(|_| Error::Unauthorized)?
    }
    /// Fresh recipient projection after reconnect; the trust boundary rechecks
    /// policy after decryption and does not expose the private checkpoint.
    pub async fn projection(
        &self,
        db: &mut Client,
        trust: &DurableTrust,
        session: &DurableSession,
        id: Uuid,
    ) -> Result<Receipt> {
        if id.is_nil() {
            return Err(Error::Invalid);
        }
        let host = self.clone();
        trust
            .command(db, session, |tx, actor| {
                Box::pin(async move {
                    let result = async {
                        host.owner.check(tx).await?;
                        if actor.world != host.owner.scope.world
                            || actor.boot != host.owner.scope.boot.to_string()
                        {
                            return Err(Error::Unauthorized);
                        }
                        let row = host.row(tx, id).await?;
                        if row.get::<_, String>("boot_text") != actor.boot {
                            return Err(Error::Conflict);
                        }
                        let stored = host.restore(id, &row)?;
                        let state = &stored.checkpoint.state;
                        let version = stored.checkpoint.version as i64;
                        let (projection, reward) = if host.game.member(state, actor.account) {
                            let reward = if stored.status == "SETTLING" {
                                Self::reward_status(tx, id, version, actor.account).await?
                            } else {
                                None
                            };
                            (host.game.project(state, actor.account)?, reward)
                        } else if host.game.can_spectate(state, actor.account) {
                            (host.game.project_public(state)?, None)
                        } else {
                            return Err(Error::Unauthorized);
                        };
                        if projection.is_empty() || projection.len() > MAX_PROJECTION {
                            return Err(Error::Invalid);
                        }
                        host.owner.check(tx).await?;
                        Ok(Receipt {
                            epoch: stored.epoch,
                            version,
                            projection,
                            reward,
                        })
                    }
                    .await;
                    Ok(result)
                })
            })
            .await
            .map_err(|_| Error::Unauthorized)?
    }
    async fn turn(
        &self,
        tx: &Transaction<'_>,
        actor: &vl_security::durable::AuthorizedActor<'_>,
        r: Request<G::Action>,
    ) -> Result<Receipt> {
        self.owner.check(tx).await?;
        if actor.world != self.owner.scope.world || actor.boot != self.owner.scope.boot.to_string()
        {
            return Err(Error::Unauthorized);
        }
        let row = self.row(tx, r.match_id).await?;
        if row.get::<_, String>("boot_text") != actor.boot {
            return Err(Error::Conflict);
        }
        let stored = self.restore(r.match_id, &row)?;
        if !self.game.member(&stored.checkpoint.state, actor.account) {
            return Err(Error::Unauthorized);
        }
        let fingerprint = canonical::hash(
            "vl.command.v1",
            &Value::List(vec![
                Value::Text(actor.account.into()),
                Value::Bytes(r.match_id.as_bytes().to_vec()),
                Value::Bytes(r.command_id.as_bytes().to_vec()),
                Value::Int(r.epoch),
                Value::Int(r.expected_version),
                r.action.canonical(),
            ]),
        )?;
        if let Some(receipt)=tx.query_opt("SELECT * FROM game_native_receipts WHERE match_id=$1::text::uuid AND actor_id=$2::text::uuid AND command_id=$3::text::uuid",&[&r.match_id.to_string(),&actor.account,&r.command_id.to_string()]).await?{
            if receipt.get::<_,Vec<u8>>("payload_fingerprint")!=fingerprint{return Err(Error::Collision);}
            let epoch=receipt.get("epoch");let version=receipt.get("committed_version");let scope=format!("{}:{}",actor.account,r.command_id);
            let sealed=Sealed {key:receipt.get("key_id"),nonce:receipt.get("nonce"),tag:receipt.get("tag"),bytes:receipt.get("sealed_receipt")};
            let bytes=self.keys.open(&sealed,&self.aad(r.match_id,epoch,version,"receipt",&scope)?)?;
            if bytes.len()>MAX_PROJECTION || receipt.get::<_,Vec<u8>>("receipt_hash")!=Sha256::digest(&bytes).as_slice(){return Err(Error::Integrity);}
            let reward = if stored.status == "SETTLING" && version as u64 == stored.checkpoint.version {
                Self::reward_status(tx, r.match_id, version, actor.account).await?
            } else {
                None
            };
            self.owner.check(tx).await?;
            return Ok(Receipt {epoch,version,projection:bytes.to_vec(),reward});
        }
        if stored.epoch != r.epoch
            || stored.checkpoint.version != r.expected_version as u64
            || stored.status != "ACTIVE"
        {
            return Err(Error::Conflict);
        }
        if !self
            .game
            .authorize(&stored.checkpoint.state, actor.account, &r.action)
        {
            return Err(Error::Unauthorized);
        }
        let clock = LogicalClock {
            server_tick: stored
                .checkpoint
                .clock
                .server_tick
                .checked_add(1)
                .ok_or(Error::Invalid)?,
            logical_time_ms: stored
                .checkpoint
                .clock
                .logical_time_ms
                .checked_add(1)
                .ok_or(Error::Invalid)?,
        };
        let transition = apply(
            self.game.as_ref(),
            &stored.checkpoint,
            &Command {
                id: *r.command_id.as_bytes(),
                match_id: *r.match_id.as_bytes(),
                expected_version: r.expected_version as u64,
                ruleset: self.game.ruleset(),
                action: r.action,
            },
            &stored.seed,
            clock,
        );
        let transition = transition?;
        let version = i64::try_from(transition.next.version).map_err(|_| Error::Invalid)?;
        // Only an explicit completion sentinel is supported. Economy effects and
        // arbitrary/private reducer settlement payloads require a separate adapter.
        if transition
            .settlement
            .as_ref()
            .is_some_and(|s| s != &Value::Null)
        {
            return Err(Error::Invalid);
        }
        let projection = self.game.project(&transition.next.state, actor.account)?;
        if projection.is_empty() || projection.len() > MAX_PROJECTION {
            return Err(Error::Invalid);
        }
        let snapshot = self.snapshot(&transition.next, &stored.seed_bytes, stored.epoch)?;
        let receipt = self.keys.seal(
            &projection,
            &self.aad(
                r.match_id,
                stored.epoch,
                version,
                "receipt",
                &format!("{}:{}", actor.account, r.command_id),
            )?,
        )?;
        let status = if transition.settlement.is_some() {
            "SETTLING"
        } else {
            "ACTIVE"
        };
        let changed=tx.execute("UPDATE game_native_matches SET state_version=$5,server_tick=$6::text::numeric,logical_time_ms=$7::text::numeric,rng_cursor=$8::text::numeric,status=$9,audit_hash=$10,snapshot_key_id=$11,snapshot_nonce=$12,snapshot_tag=$13,sealed_snapshot=$14,updated_at=clock_timestamp() WHERE id=$1::text::uuid AND owner_boot_id=$2::text::uuid AND epoch=$3 AND state_version=$4 AND status='ACTIVE'",&[&r.match_id.to_string(),&actor.boot,&stored.epoch,&r.expected_version,&version,&clock.server_tick.to_string(),&clock.logical_time_ms.to_string(),&transition.next.rng_cursor.to_string(),&status,&&transition.next.audit_hash[..],&snapshot.key,&snapshot.nonce,&snapshot.tag,&snapshot.bytes]).await?;
        if changed != 1 {
            return Err(Error::Conflict);
        }
        tx.execute("INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt) VALUES($1::text::uuid,$2::text::uuid,$3::text::uuid,$4,$5,$6,$7,$8,$9,$10,$11)",&[&r.match_id.to_string(),&actor.account,&r.command_id.to_string(),&&fingerprint[..],&version,&stored.epoch,&&Sha256::digest(&projection)[..],&receipt.key,&receipt.nonce,&receipt.tag,&receipt.bytes]).await?;
        for (index, event) in transition.events.iter().enumerate() {
            let bytes = Zeroizing::new(canonical::encode(event)?);
            let sealed = self.keys.seal(
                &bytes,
                &self.aad(
                    r.match_id,
                    stored.epoch,
                    version,
                    "event",
                    &index.to_string(),
                )?,
            )?;
            tx.execute("INSERT INTO game_native_events(match_id,state_version,epoch,event_index,event_hash,key_id,nonce,tag,sealed_event) VALUES($1::text::uuid,$2,$3,$4,$5,$6,$7,$8,$9)",&[&r.match_id.to_string(),&version,&stored.epoch,&(index as i32),&&Sha256::digest(&bytes)[..],&sealed.key,&sealed.nonce,&sealed.tag,&sealed.bytes]).await?;
        }
        if transition.settlement.is_some() {
            let id = Uuid::new_v4().to_string();
            let rules = self.game.ruleset();
            let proposal = match self.game.completion(&transition.next.state)? {
                Completion::Game => {
                    serde_json::json!({"kind":"game.completed.v1","ruleset":rules.id,"rulesetVersion":rules.version})
                }
                Completion::PetArena { won } => {
                    serde_json::json!({"kind":"pet-arena.completed.v1","outcome":if won { "won" } else { "lost" },"ruleset":rules.id,"rulesetVersion":rules.version})
                }
            };
            let proposal = serde_json::to_string(&proposal).map_err(|_| Error::Invalid)?;
            tx.execute("INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1::text::uuid,$2,$3,$4::text::uuid,$5,$6::text::jsonb)",&[&r.match_id.to_string(),&version,&stored.epoch,&id,&&Sha256::digest(proposal.as_bytes())[..],&proposal]).await?;
            tx.execute("INSERT INTO game_native_outbox(event_id,match_id,settlement_id,effect_type) VALUES($1::text::uuid,$2::text::uuid,$3::text::uuid,'game.settlement.v1')",&[&Uuid::new_v4().to_string(),&r.match_id.to_string(),&id]).await?;
        }
        self.owner.check(tx).await?;
        Ok(Receipt {
            epoch: stored.epoch,
            version,
            projection,
            reward: transition
                .settlement
                .as_ref()
                .map(|_| RewardStatus::Pending),
        })
    }
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipt_debug_redacts_private_projection() {
        let receipt = Receipt {
            epoch: 1,
            version: 2,
            projection: b"PRIVATE_CARD_SENTINEL".to_vec(),
            reward: Some(RewardStatus::Pending),
        };
        assert_eq!(
            format!("{receipt:?}"),
            "Receipt { epoch: 1, version: 2, .. }"
        );
    }
}
