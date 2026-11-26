-- Local-only native Arena8 allocation journal. The platform API owns it; the
-- restricted runtime role has no grant. No ticket, key or database credential
-- is stored here.
CREATE TABLE platform_native_arena8_matches (
 match_id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 world_id text NOT NULL CHECK (world_id ~ '^native:[a-z0-9][a-z0-9._-]{0,63}$'),
 boot_id uuid NOT NULL,
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 generation bigint NOT NULL DEFAULT 0 CHECK (generation BETWEEN 0 AND 9007199254740991),
 pet_id text NOT NULL CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 map_id text NOT NULL CHECK (map_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 encounter_id text NOT NULL CHECK (encounter_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 level smallint NOT NULL CHECK (level BETWEEN 1 AND 60),
 artifacts jsonb NOT NULL CHECK (jsonb_typeof(artifacts)='array' AND jsonb_array_length(artifacts)<=3),
 status text NOT NULL CHECK (status IN ('STARTING','ACTIVE','CLOSED','FAILED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(account_id,request_id),
 CHECK (status <> 'STARTING' OR generation = 0),
 CHECK (status <> 'ACTIVE' OR generation > 0)
);
-- One live match per account; a request id remains fingerprint-bound forever.
CREATE UNIQUE INDEX platform_native_arena8_active ON platform_native_arena8_matches(account_id) WHERE status IN ('STARTING','ACTIVE');
CREATE FUNCTION platform_native_arena8_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.match_id,NEW.account_id,NEW.request_id,NEW.fingerprint,NEW.world_id,
        NEW.boot_id,NEW.content_hash,NEW.pet_id,NEW.map_id,NEW.encounter_id,
        NEW.level,NEW.artifacts)
    IS DISTINCT FROM ROW(OLD.match_id,OLD.account_id,OLD.request_id,OLD.fingerprint,
        OLD.world_id,OLD.boot_id,OLD.content_hash,OLD.pet_id,OLD.map_id,
        OLD.encounter_id,OLD.level,OLD.artifacts) THEN
  RAISE EXCEPTION 'Native Arena8 allocation identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_native_arena8_identity_immutable BEFORE UPDATE ON platform_native_arena8_matches
 FOR EACH ROW EXECUTE FUNCTION platform_native_arena8_identity();
REVOKE ALL ON platform_native_arena8_matches FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_native_arena8_identity() FROM PUBLIC;
