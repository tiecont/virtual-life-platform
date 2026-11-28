use super::{Error, Game, Host, Result, Sealed};
use sha2::{Digest, Sha256};
use tokio_postgres::Transaction;
use uuid::Uuid;

impl<G: Game> Host<G>
where
    G::State: Send + Sync,
    G::Action: Send + Sync + 'static,
{
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
