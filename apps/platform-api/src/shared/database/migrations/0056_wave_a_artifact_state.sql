-- Wave A Artifact gameplay state. Additive only: account-owned inventory,
-- equipment, deterministic upgrade materials, PvE acquisition claims and
-- immutable battle loadout snapshots. No purchase, publication or production
-- authorization is created by these tables.
CREATE TABLE pet_artifact_players (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 materials integer NOT NULL CHECK (materials >= 0),
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pet_artifact_owned (
 account_id uuid NOT NULL REFERENCES pet_artifact_players(account_id) ON DELETE CASCADE,
 artifact_id uuid NOT NULL,
 definition_id text NOT NULL CHECK (definition_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 upgrade_level smallint NOT NULL DEFAULT 1 CHECK (upgrade_level BETWEEN 1 AND 5),
 acquired_from text NOT NULL CHECK (acquired_from IN ('starter','pve')),
 acquired_map_id text CHECK (acquired_map_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,artifact_id),
 CHECK ((acquired_from = 'pve') = (acquired_map_id IS NOT NULL))
);
CREATE TABLE pet_artifact_loadouts (
 account_id uuid NOT NULL REFERENCES pet_artifact_players(account_id) ON DELETE CASCADE,
 pet_id text NOT NULL CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 slot text NOT NULL CHECK (slot IN ('core','aegis','rune')),
 artifact_id uuid NOT NULL,
 equipped_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,pet_id,slot),
 UNIQUE(account_id,artifact_id),
 FOREIGN KEY(account_id,artifact_id) REFERENCES pet_artifact_owned(account_id,artifact_id) ON DELETE CASCADE,
 FOREIGN KEY(account_id,pet_id) REFERENCES pet_wave_one_owned(account_id,pet_id) ON DELETE CASCADE
);
CREATE TABLE pet_artifact_snapshots (
 account_id uuid NOT NULL REFERENCES pet_artifact_players(account_id) ON DELETE CASCADE,
 snapshot_id uuid NOT NULL,
 pet_id text NOT NULL CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 pet_level smallint NOT NULL CHECK (pet_level BETWEEN 1 AND 60),
 digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 loadout jsonb NOT NULL CHECK (jsonb_typeof(loadout) = 'object' AND octet_length(loadout::text) <= 16384),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,snapshot_id),
 UNIQUE(account_id,pet_id,digest)
);
CREATE TABLE pet_artifact_pve_claims (
 account_id uuid NOT NULL REFERENCES pet_artifact_players(account_id) ON DELETE CASCADE,
 map_id text NOT NULL CHECK (map_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 artifact_id uuid NOT NULL,
 materials integer NOT NULL CHECK (materials > 0),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,map_id),
 FOREIGN KEY(account_id,artifact_id) REFERENCES pet_artifact_owned(account_id,artifact_id) ON DELETE CASCADE
);
CREATE TABLE pet_artifact_requests (
 account_id uuid NOT NULL REFERENCES pet_artifact_players(account_id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,request_id)
);
-- Battle snapshots are append-only. In-place updates are always refused; a
-- delete is only possible through the account-deletion cascade, after the
-- owning artifact player row is gone.
CREATE FUNCTION pet_artifact_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  RAISE EXCEPTION 'Artifact battle snapshot is immutable' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM pet_artifact_players WHERE account_id = OLD.account_id) THEN
  RAISE EXCEPTION 'Artifact battle snapshot is append-only' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER pet_artifact_snapshot_immutable BEFORE UPDATE OR DELETE ON pet_artifact_snapshots FOR EACH ROW EXECUTE FUNCTION pet_artifact_snapshot_immutable();
REVOKE ALL ON pet_artifact_players,pet_artifact_owned,pet_artifact_loadouts,pet_artifact_snapshots,pet_artifact_pve_claims,pet_artifact_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION pet_artifact_snapshot_immutable() FROM PUBLIC;
