-- Existing ciphertext cannot establish ownership at version zero or recreate
-- missing reducer inputs. Leave old rows unindexed for explicit reconciliation.
CREATE TABLE game_native_pet_participants (
 match_id uuid PRIMARY KEY REFERENCES game_native_matches(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE RESTRICT
);
CREATE INDEX game_native_pet_participant_account ON game_native_pet_participants(account_id,match_id);

-- Version zero holds the initial state. Later versions hold bounded commands.
-- Both are sealed by the native owner and bound to match, epoch and version.
CREATE TABLE game_native_pet_replay (
 match_id uuid NOT NULL REFERENCES game_native_pet_participants(match_id) ON DELETE CASCADE,
 state_version bigint NOT NULL CHECK (state_version>=0),
 epoch bigint NOT NULL CHECK (epoch>0),
 key_id text NOT NULL CHECK (key_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
 nonce bytea NOT NULL CHECK (octet_length(nonce)=12),
 tag bytea NOT NULL CHECK (octet_length(tag)=16),
 sealed_input bytea NOT NULL CHECK (octet_length(sealed_input) BETWEEN 1 AND 1048576),
 PRIMARY KEY (match_id,state_version)
);

-- A dump preserves its origin binding. Supported restores use a separate
-- empty database. In-place restores are not supported and never use this guard
-- as a proof of deletion freshness.
CREATE FUNCTION game_native_pet_database_identity() RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
 RETURN (SELECT system_identifier::text FROM pg_control_system()) || ':' ||
  (SELECT oid::text FROM pg_database WHERE datname=current_database()) || ':' || current_database();
CREATE TABLE game_native_pet_database_guard (
 singleton boolean PRIMARY KEY CHECK (singleton),
 database_identity text NOT NULL
);
INSERT INTO game_native_pet_database_guard VALUES(true,game_native_pet_database_identity());

CREATE FUNCTION game_native_pet_require_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.ruleset_id='pet-arena-pve' AND NOT EXISTS (
  SELECT 1 FROM game_native_pet_participants p JOIN game_native_pet_replay r USING(match_id)
  WHERE p.match_id=NEW.id AND r.state_version=0 AND r.epoch=NEW.epoch
 ) THEN
  RAISE EXCEPTION 'Pet match requires participant and genesis' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER game_native_pet_genesis_required AFTER INSERT ON game_native_matches
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION game_native_pet_require_participant();

REVOKE ALL ON game_native_pet_participants,game_native_pet_replay,game_native_pet_database_guard FROM PUBLIC;

-- Only the trusted offline privacy adapter calls this within canonical account
-- and admission locks. Ordinary gameplay and worker roles cannot erase.
CREATE FUNCTION game_native_pet_erase(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM m.id FROM game_native_matches m JOIN game_native_pet_participants p ON p.match_id=m.id
  WHERE p.account_id=subject AND m.ruleset_id='pet-arena-pve' ORDER BY m.id FOR UPDATE OF m;
 PERFORM o.event_id FROM game_native_outbox o JOIN game_native_pet_participants p ON p.match_id=o.match_id
  JOIN game_native_matches m ON m.id=p.match_id
  WHERE p.account_id=subject AND m.ruleset_id='pet-arena-pve' ORDER BY o.event_id FOR UPDATE OF o;
 DELETE FROM platform_native_reward_ledger l USING game_native_settlements s,game_native_pet_participants p,game_native_matches m
  WHERE l.settlement_id=s.settlement_id AND s.match_id=p.match_id AND m.id=p.match_id AND m.ruleset_id='pet-arena-pve' AND p.account_id=subject;
 DELETE FROM platform_native_reward_inbox i USING game_native_settlements s,game_native_pet_participants p,game_native_matches m
  WHERE i.settlement_id=s.settlement_id AND s.match_id=p.match_id AND m.id=p.match_id AND m.ruleset_id='pet-arena-pve' AND p.account_id=subject;
 DELETE FROM game_native_matches m USING game_native_pet_participants p
  WHERE m.id=p.match_id AND m.ruleset_id='pet-arena-pve' AND p.account_id=subject;
END $$;
REVOKE ALL ON FUNCTION game_native_pet_erase(uuid) FROM PUBLIC;
