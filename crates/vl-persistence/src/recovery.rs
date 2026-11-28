use super::{Error, Game, Host, Result, Sealed, Stored};
use sha2::{Digest, Sha256};
use tokio_postgres::{Row, Transaction};
use uuid::Uuid;
use vl_game_core::{Canonical, Command, LogicalClock, Value, apply, begin, canonical};
use zeroize::Zeroizing;

fn envelope(row: &Row, column: &str) -> Sealed {
    Sealed {
        key: row.get("key_id"),
        nonce: row.get("nonce"),
        tag: row.get("tag"),
        bytes: row.get(column),
    }
}

impl<G: Game> Host<G>
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
    pub(super) async fn check_pet_database(&self, tx: &Transaction<'_>) -> Result<()> {
        if tx
            .query_opt(
                "SELECT 1 FROM game_native_pet_database_guard WHERE singleton
             AND database_identity=game_native_pet_database_identity()",
                &[],
            )
            .await?
            .is_none()
        {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    pub(super) async fn pet_owner(&self, tx: &Transaction<'_>, id: Uuid) -> Result<String> {
        tx.query_opt(
            "SELECT account_id::text FROM game_native_pet_participants WHERE match_id=$1::text::uuid",
            &[&id.to_string()],
        ).await?.map(|row| row.get(0)).ok_or(Error::Integrity)
    }

    pub(super) async fn store_pet_input(
        &self,
        tx: &Transaction<'_>,
        id: Uuid,
        epoch: i64,
        version: i64,
        binding: &str,
        bytes: &[u8],
    ) -> Result<()> {
        let sealed = self
            .keys
            .seal(bytes, &self.aad(id, epoch, version, "pet-replay", binding)?)?;
        tx.execute(
            "INSERT INTO game_native_pet_replay(match_id,state_version,epoch,key_id,nonce,tag,sealed_input)
             VALUES($1::text::uuid,$2,$3,$4,$5,$6,$7)",
            &[&id.to_string(),&version,&epoch,&sealed.key,&sealed.nonce,&sealed.tag,&sealed.bytes],
        ).await?;
        Ok(())
    }

    pub(super) async fn verify_pet_replay(
        &self,
        tx: &Transaction<'_>,
        id: Uuid,
        stored: &Stored<G::State>,
    ) -> Result<()> {
        let subject = self.pet_owner(tx, id).await?;
        let cp = &stored.checkpoint;
        if self
            .game
            .pet_participant(&cp.state)
            .map(|account| account.to_string())
            .as_ref()
            != Some(&subject)
        {
            return Err(Error::Integrity);
        }
        let id_text = id.to_string();
        let genesis = tx.query_opt(
            "SELECT * FROM game_native_pet_replay WHERE match_id=$1::text::uuid AND state_version=0",
            &[&id_text],
        ).await?.ok_or(Error::Integrity)?;
        // Pet Arena v1 has no takeover path or owner epoch transition.
        if stored.epoch != 1 || genesis.get::<_, i64>("epoch") != stored.epoch {
            return Err(Error::Integrity);
        }
        let bytes = self.keys.open(
            &envelope(&genesis, "sealed_input"),
            &self.aad(id, stored.epoch, 0, "pet-replay", &subject)?,
        )?;
        if bytes.len() > super::MAX_STATE {
            return Err(Error::Integrity);
        }
        let mut replay = begin(
            self.game.as_ref(),
            *id.as_bytes(),
            self.game.decode(&bytes)?,
            &stored.seed,
            LogicalClock {
                server_tick: 0,
                logical_time_ms: 0,
            },
        )
        .map_err(|_| Error::Integrity)?;
        let mut terminal = false;
        let final_version = i64::try_from(cp.version).map_err(|_| Error::Integrity)?;
        let counts = tx.query_one(
            "SELECT (SELECT count(*) FROM game_native_pet_replay WHERE match_id=$1::text::uuid),
                    (SELECT count(*) FROM game_native_receipts WHERE match_id=$1::text::uuid)",
            &[&id_text],
        ).await?;
        if counts.get::<_, i64>(0) != final_version.checked_add(1).ok_or(Error::Integrity)?
            || counts.get::<_, i64>(1) != final_version
        {
            return Err(Error::Integrity);
        }
        for version in 1..=final_version {
            if terminal {
                return Err(Error::Integrity);
            }
            let rows = tx.query_opt(
                "SELECT p.*,r.epoch AS receipt_epoch,r.actor_id::text AS actor,r.command_id::text AS command,
                        r.payload_fingerprint,r.receipt_hash,r.key_id AS receipt_key,r.nonce AS receipt_nonce,
                        r.tag AS receipt_tag,r.sealed_receipt
                 FROM game_native_pet_replay p
                 JOIN game_native_receipts r ON r.match_id=p.match_id AND r.committed_version=p.state_version
                 WHERE p.match_id=$1::text::uuid AND p.state_version=$2",
                &[&id_text,&version],
            ).await?.ok_or(Error::Integrity)?;
            let epoch: i64 = rows.get("epoch");
            let command_id: String = rows.get("command");
            let command_uuid = Uuid::parse_str(&command_id).map_err(|_| Error::Integrity)?;
            if epoch != stored.epoch
                || rows.get::<_, i64>("receipt_epoch") != epoch
                || rows.get::<_, &str>("actor") != subject
            {
                return Err(Error::Integrity);
            }
            let binding = format!("{subject}:{command_id}");
            let action = self.keys.open(
                &envelope(&rows, "sealed_input"),
                &self.aad(id, epoch, version, "pet-replay", &binding)?,
            )?;
            let action = self.game.decode_replay_action(&action)?;
            if !self.game.authorize(&replay.state, &subject, &action) {
                return Err(Error::Integrity);
            }
            let fingerprint = canonical::hash(
                "vl.command.v1",
                &Value::List(vec![
                    Value::Text(subject.clone()),
                    Value::Bytes(id.as_bytes().to_vec()),
                    Value::Bytes(command_uuid.as_bytes().to_vec()),
                    Value::Int(epoch),
                    Value::Int(version - 1),
                    action.canonical(),
                ]),
            )?;
            if rows.get::<_, Vec<u8>>("payload_fingerprint") != fingerprint {
                return Err(Error::Integrity);
            }
            let clock = LogicalClock {
                server_tick: version as u64,
                logical_time_ms: version as u64,
            };
            let transition = apply(
                self.game.as_ref(),
                &replay,
                &Command {
                    id: *command_uuid.as_bytes(),
                    match_id: *id.as_bytes(),
                    expected_version: replay.version,
                    ruleset: self.game.ruleset(),
                    action,
                },
                &stored.seed,
                clock,
            )
            .map_err(|_| Error::Integrity)?;
            let expected = Zeroizing::new(self.game.project(&transition.next.state, &subject)?);
            let receipt = self.keys.open(
                &Sealed {
                    key: rows.get("receipt_key"),
                    nonce: rows.get("receipt_nonce"),
                    tag: rows.get("receipt_tag"),
                    bytes: rows.get("sealed_receipt"),
                },
                &self.aad(id, epoch, version, "receipt", &binding)?,
            )?;
            if receipt.as_slice() != expected.as_slice()
                || rows.get::<_, Vec<u8>>("receipt_hash") != Sha256::digest(&receipt).as_slice()
            {
                return Err(Error::Integrity);
            }
            // Fetch bounded pages, including the expected end of a turn: a
            // wholly absent event set cannot pass as an empty sequence.
            let events = &transition.events;
            for offset in (0..=events.len()).step_by(16) {
                let batch = tx.query(
                    "SELECT * FROM game_native_events WHERE match_id=$1::text::uuid AND state_version=$2
                     AND event_index >= $3 ORDER BY event_index LIMIT 16",
                    &[&id_text,&version,&(offset as i32)],
                ).await?;
                let expected = &events[offset..events.len().min(offset + 16)];
                if batch.len() != expected.len() {
                    return Err(Error::Integrity);
                }
                for (position, (row, event)) in batch.iter().zip(expected).enumerate() {
                    let index = offset + position;
                    if row.get::<_, i32>("event_index") != index as i32
                        || row.get::<_, i64>("epoch") != epoch
                    {
                        return Err(Error::Integrity);
                    }
                    let bytes = self.keys.open(
                        &envelope(row, "sealed_event"),
                        &self.aad(id, epoch, version, "event", &index.to_string())?,
                    )?;
                    let expected_event = Zeroizing::new(canonical::encode(event)?);
                    if bytes.as_slice() != expected_event.as_slice()
                        || row.get::<_, Vec<u8>>("event_hash") != Sha256::digest(&bytes).as_slice()
                    {
                        return Err(Error::Integrity);
                    }
                }
            }
            terminal = transition.settlement == Some(Value::Null);
            if !terminal && transition.settlement.is_some() {
                return Err(Error::Integrity);
            }
            replay = transition.next;
        }
        if replay.audit_hash != cp.audit_hash
            || replay.seed_commitment != cp.seed_commitment
            || replay.rng_cursor != cp.rng_cursor
            || replay.clock != cp.clock
            || replay.state.canonical() != cp.state.canonical()
            || stored.status != if terminal { "SETTLING" } else { "ACTIVE" }
        {
            return Err(Error::Integrity);
        }
        let settlement = tx.query_opt(
            "SELECT s.state_version,s.epoch,s.proposal::text,s.proposal_hash,o.match_id IS NOT NULL AS has_outbox
             FROM game_native_settlements s LEFT JOIN game_native_outbox o USING(match_id,settlement_id)
             WHERE s.match_id=$1::text::uuid", &[&id_text],
        ).await?;
        match (terminal, settlement) {
            (false, None) => Ok(()),
            (true, Some(row)) => {
                let proposal = self.completion_proposal(&replay.state)?;
                let json = serde_json::to_string(&proposal).map_err(|_| Error::Integrity)?;
                if row.get::<_, i64>("state_version") != final_version
                    || row.get::<_, i64>("epoch") != stored.epoch
                    || !row.get::<_, bool>("has_outbox")
                    || row.get::<_, Vec<u8>>("proposal_hash")
                        != Sha256::digest(json.as_bytes()).as_slice()
                    || serde_json::from_str::<serde_json::Value>(row.get("proposal"))
                        .map_err(|_| Error::Integrity)?
                        != proposal
                {
                    return Err(Error::Integrity);
                }
                Ok(())
            }
            _ => Err(Error::Integrity),
        }
    }

    // Authenticate historical envelopes before recovery exposes a listener.
    // Small pages bound memory even when stored ciphertext is at its SQL limit.
    // This verifies stored envelopes/hashes, not a reducer replay from genesis.
    pub(super) async fn verify_journal(
        &self,
        tx: &Transaction<'_>,
        id: Uuid,
        epoch: i64,
        version: u64,
    ) -> Result<()> {
        let mut last = 0_i64;
        loop {
            let rows = tx.query(
                "SELECT *,actor_id::text AS actor,command_id::text AS command FROM game_native_receipts WHERE match_id=$1::text::uuid AND committed_version>$2 ORDER BY committed_version LIMIT 16",
                &[&id.to_string(), &last],
            ).await?;
            if rows.is_empty() {
                break;
            }
            for row in rows {
                let current: i64 = row.get("committed_version");
                let at_epoch: i64 = row.get("epoch");
                if current != last.checked_add(1).ok_or(Error::Integrity)?
                    || current as u64 > version
                    || at_epoch < 1
                    || at_epoch > epoch
                {
                    return Err(Error::Integrity);
                }
                let sealed = Sealed {
                    key: row.get("key_id"),
                    nonce: row.get("nonce"),
                    tag: row.get("tag"),
                    bytes: row.get("sealed_receipt"),
                };
                let recipient = format!(
                    "{}:{}",
                    row.get::<_, String>("actor"),
                    row.get::<_, String>("command")
                );
                let bytes = self.keys.open(
                    &sealed,
                    &self.aad(id, at_epoch, current, "receipt", &recipient)?,
                )?;
                if bytes.is_empty()
                    || bytes.len() > super::MAX_PROJECTION
                    || row.get::<_, Vec<u8>>("receipt_hash") != Sha256::digest(&bytes).as_slice()
                {
                    return Err(Error::Integrity);
                }
                last = current;
            }
        }
        if last as u64 != version {
            return Err(Error::Integrity);
        }
        let (mut last_version, mut last_index) = (0_i64, -1_i32);
        loop {
            let rows = tx.query(
                "SELECT * FROM game_native_events WHERE match_id=$1::text::uuid AND (state_version,event_index)>($2,$3) ORDER BY state_version,event_index LIMIT 16",
                &[&id.to_string(), &last_version, &last_index],
            ).await?;
            if rows.is_empty() {
                break;
            }
            for row in rows {
                let current: i64 = row.get("state_version");
                let index: i32 = row.get("event_index");
                let at_epoch: i64 = row.get("epoch");
                let expected_index = if current == last_version {
                    last_index + 1
                } else {
                    0
                };
                if current < 1
                    || current as u64 > version
                    || index != expected_index
                    || at_epoch < 1
                    || at_epoch > epoch
                {
                    return Err(Error::Integrity);
                }
                let sealed = Sealed {
                    key: row.get("key_id"),
                    nonce: row.get("nonce"),
                    tag: row.get("tag"),
                    bytes: row.get("sealed_event"),
                };
                let bytes = self.keys.open(
                    &sealed,
                    &self.aad(id, at_epoch, current, "event", &index.to_string())?,
                )?;
                if row.get::<_, Vec<u8>>("event_hash") != Sha256::digest(&bytes).as_slice() {
                    return Err(Error::Integrity);
                }
                last_version = current;
                last_index = index;
            }
        }
        Ok(())
    }
}
