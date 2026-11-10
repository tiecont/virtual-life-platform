-- Additive native-only storage. Existing Nest journal is the sole DDL owner.
-- No activation, legacy conversion, credentials or platform ledger writes.
CREATE TABLE game_native_matches (
 id uuid PRIMARY KEY,
 world_id text NOT NULL CHECK (world_id ~ '^native:[a-z0-9][a-z0-9._-]{0,63}$'),
 ruleset_id text NOT NULL CHECK (ruleset_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
 ruleset_version integer NOT NULL CHECK (ruleset_version > 0),
 content_hash bytea NOT NULL CHECK (octet_length(content_hash)=32),
 engine_hash bytea NOT NULL CHECK (octet_length(engine_hash)=32),
 protocol_version integer NOT NULL CHECK (protocol_version=1),
 canonical_version integer NOT NULL CHECK (canonical_version=1),
 rng_version integer NOT NULL CHECK (rng_version=1),
 owner_boot_id uuid NOT NULL,
 epoch bigint NOT NULL CHECK (epoch > 0),
 state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
 server_tick numeric(20,0) NOT NULL CHECK (server_tick BETWEEN 0 AND 18446744073709551615),
 logical_time_ms numeric(20,0) NOT NULL CHECK (logical_time_ms BETWEEN 0 AND 18446744073709551615),
 rng_cursor numeric(20,0) NOT NULL CHECK (rng_cursor BETWEEN 0 AND 18446744073709551615),
 status text NOT NULL CHECK (status IN ('ACTIVE','SETTLING','FINISHED','ABORTED')),
 seed_commitment bytea NOT NULL CHECK (octet_length(seed_commitment)=32),
 audit_hash bytea NOT NULL CHECK (octet_length(audit_hash)=32),
 snapshot_key_id text NOT NULL CHECK (snapshot_key_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
 snapshot_nonce bytea NOT NULL CHECK (octet_length(snapshot_nonce)=12),
 snapshot_tag bytea NOT NULL CHECK (octet_length(snapshot_tag)=16),
 sealed_snapshot bytea NOT NULL CHECK (octet_length(sealed_snapshot) BETWEEN 1 AND 1048576),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,state_version,epoch)
);
CREATE TABLE game_native_receipts (
 match_id uuid NOT NULL REFERENCES game_native_matches(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 command_id uuid NOT NULL,
 payload_fingerprint bytea NOT NULL CHECK (octet_length(payload_fingerprint)=32),
 committed_version bigint NOT NULL CHECK (committed_version > 0),
 epoch bigint NOT NULL CHECK (epoch > 0),
 receipt_hash bytea NOT NULL CHECK (octet_length(receipt_hash)=32),
 key_id text NOT NULL CHECK (key_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
 nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
 tag bytea NOT NULL CHECK (octet_length(tag)=16),
 sealed_receipt bytea NOT NULL CHECK (octet_length(sealed_receipt) BETWEEN 1 AND 1048576),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,actor_id,command_id),
 UNIQUE(match_id,committed_version),
 UNIQUE(match_id,committed_version,epoch)
);
CREATE TABLE game_native_events (
 match_id uuid NOT NULL,
 state_version bigint NOT NULL,
 epoch bigint NOT NULL,
 event_index integer NOT NULL CHECK (event_index BETWEEN 0 AND 511),
 event_hash bytea NOT NULL CHECK (octet_length(event_hash)=32),
 key_id text NOT NULL CHECK (key_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
 nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
 tag bytea NOT NULL CHECK (octet_length(tag)=16),
 sealed_event bytea NOT NULL CHECK (octet_length(sealed_event) BETWEEN 1 AND 1048576),
 PRIMARY KEY(match_id,state_version,event_index),
 FOREIGN KEY(match_id,state_version,epoch) REFERENCES game_native_receipts(match_id,committed_version,epoch) ON DELETE CASCADE
);
CREATE TABLE game_native_settlements (
 match_id uuid PRIMARY KEY,
 state_version bigint NOT NULL,
 epoch bigint NOT NULL,
 settlement_id uuid NOT NULL UNIQUE,
 proposal_hash bytea NOT NULL CHECK (octet_length(proposal_hash)=32),
 -- Proposal only; platform owner authorizes/deduplicates the actual effect.
 proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal)='object' AND octet_length(proposal::text)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(match_id,state_version,epoch) REFERENCES game_native_receipts(match_id,committed_version,epoch) ON DELETE CASCADE,
 UNIQUE(match_id,settlement_id)
);
CREATE TABLE game_native_outbox (
 event_id uuid PRIMARY KEY,
 match_id uuid NOT NULL,
 settlement_id uuid NOT NULL,
 effect_type text NOT NULL CHECK (effect_type='game.settlement.v1'),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 available_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(match_id,effect_type),
 UNIQUE(settlement_id,effect_type),
 FOREIGN KEY(match_id,settlement_id) REFERENCES game_native_settlements(match_id,settlement_id) ON DELETE CASCADE
);
CREATE INDEX game_native_outbox_pending ON game_native_outbox(available_at,event_id) WHERE delivered_at IS NULL;

-- Row-lock checks supplement the host's owner/version CAS, never authentication.
CREATE FUNCTION game_native_check_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE checkpoint game_native_matches%ROWTYPE;
BEGIN
 SELECT * INTO checkpoint FROM game_native_matches WHERE id=NEW.match_id FOR UPDATE;
 IF NOT FOUND OR checkpoint.epoch<>NEW.epoch OR checkpoint.state_version<>NEW.committed_version THEN
  RAISE EXCEPTION 'Native receipt fence/version mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER game_native_receipt_fence BEFORE INSERT ON game_native_receipts
 FOR EACH ROW EXECUTE FUNCTION game_native_check_receipt();
CREATE FUNCTION game_native_check_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE checkpoint game_native_matches%ROWTYPE;
BEGIN
 SELECT * INTO checkpoint FROM game_native_matches WHERE id=NEW.match_id FOR UPDATE;
 IF NOT FOUND OR checkpoint.epoch<>NEW.epoch OR checkpoint.state_version<>NEW.state_version OR checkpoint.status<>'SETTLING' THEN
  RAISE EXCEPTION 'Native settlement requires current settling checkpoint' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER game_native_settlement_fence BEFORE INSERT ON game_native_settlements
 FOR EACH ROW EXECUTE FUNCTION game_native_check_settlement();
CREATE FUNCTION game_native_check_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.world_id,NEW.ruleset_id,NEW.ruleset_version,NEW.content_hash,NEW.engine_hash,
        NEW.protocol_version,NEW.canonical_version,NEW.rng_version,NEW.seed_commitment,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.world_id,OLD.ruleset_id,OLD.ruleset_version,OLD.content_hash,OLD.engine_hash,
        OLD.protocol_version,OLD.canonical_version,OLD.rng_version,OLD.seed_commitment,OLD.created_at) THEN
  RAISE EXCEPTION 'Native match identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.epoch<OLD.epoch OR NEW.state_version<OLD.state_version OR NEW.server_tick<OLD.server_tick
    OR NEW.logical_time_ms<OLD.logical_time_ms OR NEW.rng_cursor<OLD.rng_cursor
    OR (NEW.owner_boot_id<>OLD.owner_boot_id AND NEW.epoch<=OLD.epoch)
    OR (NEW.epoch>OLD.epoch AND NEW.owner_boot_id=OLD.owner_boot_id)
    OR (OLD.status IN ('FINISHED','ABORTED') AND NEW.status<>OLD.status) THEN
  RAISE EXCEPTION 'Native checkpoint regression' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER game_native_checkpoint_forward BEFORE UPDATE ON game_native_matches
 FOR EACH ROW EXECUTE FUNCTION game_native_check_checkpoint();
