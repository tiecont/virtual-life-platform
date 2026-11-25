-- Cooperative rooms, Achievement Points and allocation identity. Achievement
-- Points are eligibility progression only; they are never spent by a room,
-- combat or settlement. A room pins the published gameplay configuration that
-- authored its Boss and room threshold, exactly like an allocated match.
CREATE TABLE coop_achievement_ledger (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 points integer NOT NULL CHECK (points BETWEEN 1 AND 1000000),
 source text NOT NULL CHECK (source IN ('settlement','admin_grant','migration')),
 source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 128 AND source_ref = btrim(source_ref)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (account_id, source, source_ref)
);
CREATE INDEX coop_achievement_account ON coop_achievement_ledger(account_id);
CREATE TABLE coop_rooms (
 id uuid PRIMARY KEY,
 ruleset text NOT NULL CHECK (ruleset = 'arena8-coop-pve'),
 boss_id text NOT NULL CHECK (boss_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 host_account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 config_version bigint NOT NULL,
 config_digest text NOT NULL CHECK (config_digest ~ '^[a-f0-9]{64}$'),
 required_points integer NOT NULL CHECK (required_points BETWEEN 0 AND 1000000),
 status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED','STARTED','CLOSED')),
 revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 2147483647),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (ruleset, config_version) REFERENCES gameplay_config_versions(ruleset, version)
);
CREATE INDEX coop_rooms_open ON coop_rooms(status, created_at DESC);
CREATE TABLE coop_room_seats (
 room_id uuid NOT NULL REFERENCES coop_rooms(id) ON DELETE CASCADE,
 seat smallint NOT NULL CHECK (seat BETWEEN 0 AND 3),
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 pet_id text CHECK (pet_id IS NULL OR pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 pet_level smallint CHECK (pet_level IS NULL OR pet_level BETWEEN 1 AND 60),
 artifact_power_pm smallint NOT NULL DEFAULT 1000 CHECK (artifact_power_pm BETWEEN 1000 AND 5000),
 ready boolean NOT NULL DEFAULT false,
 joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (room_id, seat),
 UNIQUE (room_id, account_id),
 UNIQUE (room_id, pet_id),
 CHECK ((NOT ready) OR (pet_id IS NOT NULL AND pet_level IS NOT NULL))
);
CREATE TABLE coop_room_requests (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND octet_length(response::text) <= 65536),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (account_id, request_id)
);
CREATE TABLE coop_room_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room_id uuid NOT NULL REFERENCES coop_rooms(id) ON DELETE CASCADE,
 account_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
 action text NOT NULL CHECK (action IN ('create','join','leave','select_pet','ready','start','close')),
 from_state text,
 to_state text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX coop_room_events_room ON coop_room_events(room_id, sequence DESC);
-- The match row itself is created by the native Rust host on its first commit;
-- this allocation journal is the server-owned identity before that commit.
CREATE TABLE coop_allocations (
 match_id uuid PRIMARY KEY,
 room_id uuid NOT NULL UNIQUE REFERENCES coop_rooms(id) ON DELETE CASCADE,
 ruleset text NOT NULL CHECK (ruleset = 'arena8-coop-pve'),
 config_version bigint NOT NULL,
 config_digest text NOT NULL CHECK (config_digest ~ '^[a-f0-9]{64}$'),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 world_id text NOT NULL UNIQUE CHECK (world_id ~ '^native:[a-z0-9][a-z0-9._-]{0,63}$'),
 boot_id uuid NOT NULL,
 generation integer NOT NULL DEFAULT 0 CHECK (generation BETWEEN 0 AND 2147483647),
 seats jsonb NOT NULL CHECK (jsonb_typeof(seats) = 'array' AND jsonb_array_length(seats) = 4 AND octet_length(seats::text) <= 16384),
 status text NOT NULL DEFAULT 'STARTING' CHECK (status IN ('STARTING','ACTIVE','SETTLED','FAILED','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (ruleset, config_version) REFERENCES gameplay_config_versions(ruleset, version)
);
-- A room keeps authored identity and threshold values for its whole life. The
-- roster is mutable only while the room is OPEN and freezes on start.
CREATE FUNCTION coop_room_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'Cooperative rooms are retained' USING ERRCODE = '23514';
 END IF;
 IF NEW.ruleset <> OLD.ruleset OR NEW.boss_id <> OLD.boss_id
  OR NEW.host_account_id <> OLD.host_account_id OR NEW.config_version <> OLD.config_version
  OR NEW.config_digest <> OLD.config_digest OR NEW.required_points <> OLD.required_points
  OR NEW.created_at <> OLD.created_at OR NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Cooperative room identity is immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW.status <> OLD.status AND NOT (
  (OLD.status = 'OPEN' AND NEW.status IN ('LOCKED','CLOSED'))
  OR (OLD.status = 'LOCKED' AND NEW.status IN ('STARTED','CLOSED'))
  OR (OLD.status = 'STARTED' AND NEW.status = 'CLOSED')) THEN
  RAISE EXCEPTION 'Illegal cooperative room transition' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coop_room_guard BEFORE UPDATE ON coop_rooms FOR EACH ROW EXECUTE FUNCTION coop_room_guard();
CREATE FUNCTION coop_room_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room coop_rooms%ROWTYPE;
BEGIN
 SELECT * INTO room FROM coop_rooms WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.room_id ELSE NEW.room_id END;
 -- Account deletion may cascade the room first; that is not a gameplay mutation.
 IF room.id IS NULL THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP <> 'DELETE' AND room.status <> 'OPEN' THEN
  RAISE EXCEPTION 'Cooperative room roster is frozen' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' AND room.status IN ('LOCKED','STARTED') THEN
  RAISE EXCEPTION 'Cooperative room roster is frozen' USING ERRCODE = '23514';
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER coop_room_seat_guard BEFORE INSERT OR UPDATE OR DELETE ON coop_room_seats FOR EACH ROW EXECUTE FUNCTION coop_room_seat_guard();
REVOKE ALL ON coop_achievement_ledger,coop_rooms,coop_room_seats,coop_room_requests,coop_room_events,coop_allocations FROM PUBLIC;
REVOKE ALL ON FUNCTION coop_room_guard(),coop_room_seat_guard() FROM PUBLIC;
