-- Wave D2 gameplay configuration authority. Admin-authored drafts are validated
-- by the Rust engine before publication; published revisions are immutable and
-- the active selection is versioned independently of history.
CREATE TABLE gameplay_config_versions (
 ruleset text NOT NULL CHECK (ruleset IN ('arena8-coop-pve')),
 version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
 schema_version integer NOT NULL CHECK (schema_version = 1),
 state text NOT NULL CHECK (state IN ('DRAFT','VALIDATED','PUBLISHED','SUPERSEDED','RETIRED')),
 engine_capability text CHECK (engine_capability IS NULL OR engine_capability ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
 content_digest text CHECK (content_digest IS NULL OR content_digest ~ '^[a-f0-9]{64}$'),
 bundle jsonb NOT NULL CHECK (jsonb_typeof(bundle) = 'object' AND octet_length(bundle::text) BETWEEN 2 AND 1048576),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
 parent_version bigint,
 created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 256 AND created_by = btrim(created_by)),
 updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 256 AND updated_by = btrim(updated_by)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 validated_at timestamptz,
 published_at timestamptz,
 PRIMARY KEY (ruleset, version),
 FOREIGN KEY (ruleset, parent_version) REFERENCES gameplay_config_versions(ruleset, version),
 CHECK (parent_version IS NULL OR parent_version < version),
 CHECK (
  (state = 'DRAFT' AND content_digest IS NULL AND engine_capability IS NULL AND validated_at IS NULL AND published_at IS NULL)
  OR (state = 'VALIDATED' AND content_digest IS NOT NULL AND engine_capability IS NOT NULL AND validated_at IS NOT NULL AND published_at IS NULL)
  OR (state IN ('PUBLISHED','SUPERSEDED') AND content_digest IS NOT NULL AND engine_capability IS NOT NULL AND validated_at IS NOT NULL AND published_at IS NOT NULL)
  OR (state = 'RETIRED')
 )
);
CREATE INDEX gameplay_config_versions_state ON gameplay_config_versions(ruleset, state, version DESC);
CREATE TABLE gameplay_config_active (
 ruleset text PRIMARY KEY,
 version bigint NOT NULL,
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 256 AND updated_by = btrim(updated_by)),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (ruleset, version) REFERENCES gameplay_config_versions(ruleset, version)
);
CREATE TABLE gameplay_config_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ruleset text NOT NULL,
 version bigint NOT NULL,
 action text NOT NULL CHECK (action IN ('create','update','validate','publish','rollback','retire','seed')),
 actor text NOT NULL CHECK (length(actor) BETWEEN 1 AND 256 AND actor = btrim(actor)),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 from_state text,
 to_state text,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object' AND octet_length(detail::text) <= 16384),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 previous_hash text NOT NULL CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
 event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
 UNIQUE (fingerprint)
);
CREATE INDEX gameplay_config_events_version ON gameplay_config_events(ruleset, version, sequence DESC);
CREATE TABLE gameplay_config_match_pins (
 match_id uuid PRIMARY KEY REFERENCES game_native_matches(id) DEFERRABLE INITIALLY DEFERRED,
 ruleset text NOT NULL,
 version bigint NOT NULL,
 content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
 engine_capability text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (ruleset, version) REFERENCES gameplay_config_versions(ruleset, version)
);
-- A version begins as an immutable-identity draft. Only the authored bundle and
-- metadata may change while it is a draft; validation records the engine digest;
-- publication is a one-way state change; history is never rewritten.
CREATE FUNCTION gameplay_config_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.state <> 'DRAFT' OR NEW.revision <> 1 OR NEW.content_digest IS NOT NULL
   OR NEW.engine_capability IS NOT NULL OR NEW.validated_at IS NOT NULL OR NEW.published_at IS NOT NULL
   OR NEW.updated_by <> NEW.created_by THEN
   RAISE EXCEPTION 'Gameplay configuration must be created as a draft' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'Gameplay configuration versions are retained' USING ERRCODE = '23514';
 END IF;
 IF NEW.ruleset <> OLD.ruleset OR NEW.version <> OLD.version OR NEW.schema_version <> OLD.schema_version
  OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
  OR NEW.parent_version IS DISTINCT FROM OLD.parent_version OR NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Gameplay configuration identity is immutable' USING ERRCODE = '23514';
 END IF;
 IF OLD.state = 'DRAFT' THEN
  IF NEW.state = 'DRAFT' AND NEW.content_digest IS NULL AND NEW.engine_capability IS NULL
   AND NEW.validated_at IS NULL AND NEW.published_at IS NULL THEN
   RETURN NEW;
  END IF;
  IF NEW.state = 'VALIDATED' AND NEW.content_digest IS NOT NULL AND NEW.engine_capability IS NOT NULL
   AND NEW.validated_at IS NOT NULL AND NEW.published_at IS NULL AND NEW.bundle = OLD.bundle THEN
   RETURN NEW;
  END IF;
  IF NEW.state = 'RETIRED' AND NEW.bundle = OLD.bundle AND NEW.content_digest IS NULL
   AND NEW.engine_capability IS NULL AND NEW.validated_at IS NULL AND NEW.published_at IS NULL THEN
   RETURN NEW;
  END IF;
 ELSIF OLD.state = 'VALIDATED' THEN
  IF NEW.state = 'DRAFT' AND NEW.content_digest IS NULL AND NEW.engine_capability IS NULL
   AND NEW.validated_at IS NULL AND NEW.published_at IS NULL THEN
   RETURN NEW;
  END IF;
  IF NEW.state = 'PUBLISHED' AND NEW.bundle = OLD.bundle AND NEW.content_digest = OLD.content_digest
   AND NEW.engine_capability = OLD.engine_capability AND NEW.validated_at = OLD.validated_at
   AND NEW.published_at IS NOT NULL THEN
   RETURN NEW;
  END IF;
  IF NEW.state = 'RETIRED' AND NEW.bundle = OLD.bundle AND NEW.content_digest = OLD.content_digest
   AND NEW.engine_capability = OLD.engine_capability AND NEW.validated_at = OLD.validated_at THEN
   RETURN NEW;
  END IF;
 ELSIF OLD.state = 'PUBLISHED' THEN
  IF NEW.state IN ('SUPERSEDED','RETIRED')
   AND (to_jsonb(NEW) - 'state' - 'revision' - 'updated_by' - 'updated_at')
     = (to_jsonb(OLD) - 'state' - 'revision' - 'updated_by' - 'updated_at') THEN
   RETURN NEW;
  END IF;
 ELSIF OLD.state = 'SUPERSEDED' THEN
  IF NEW.state = 'RETIRED'
   AND (to_jsonb(NEW) - 'state' - 'revision' - 'updated_by' - 'updated_at')
     = (to_jsonb(OLD) - 'state' - 'revision' - 'updated_by' - 'updated_at') THEN
   RETURN NEW;
  END IF;
 END IF;
 RAISE EXCEPTION 'Illegal gameplay configuration transition' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER gameplay_config_version_guard BEFORE INSERT OR UPDATE OR DELETE ON gameplay_config_versions FOR EACH ROW EXECUTE FUNCTION gameplay_config_version_guard();
-- The active selection only ever points at an engine-validated published revision.
-- Rollback re-points the selection; it never re-labels historical versions.
CREATE FUNCTION gameplay_config_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.revision <> 1 THEN RAISE EXCEPTION 'Active gameplay configuration must start at revision one' USING ERRCODE = '23514'; END IF;
 ELSIF NEW.ruleset <> OLD.ruleset OR NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Active gameplay configuration revision must advance by one' USING ERRCODE = '23514';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM gameplay_config_versions v
  WHERE v.ruleset = NEW.ruleset AND v.version = NEW.version
   AND v.state IN ('PUBLISHED','SUPERSEDED') AND v.published_at IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Active gameplay configuration is not published' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gameplay_config_active_guard BEFORE INSERT OR UPDATE ON gameplay_config_active FOR EACH ROW EXECUTE FUNCTION gameplay_config_active_guard();
CREATE FUNCTION gameplay_config_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Gameplay configuration journal is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER gameplay_config_event_immutable BEFORE UPDATE OR DELETE ON gameplay_config_events FOR EACH ROW EXECUTE FUNCTION gameplay_config_immutable();
CREATE TRIGGER gameplay_config_pin_immutable BEFORE UPDATE OR DELETE ON gameplay_config_match_pins FOR EACH ROW EXECUTE FUNCTION gameplay_config_immutable();
CREATE FUNCTION gameplay_config_pin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM gameplay_config_versions v
  WHERE v.ruleset = NEW.ruleset AND v.version = NEW.version
   AND v.published_at IS NOT NULL AND v.content_digest = NEW.content_digest
   AND v.engine_capability = NEW.engine_capability
 ) THEN
  RAISE EXCEPTION 'Match configuration pin does not match a published revision' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gameplay_config_pin_guard BEFORE INSERT ON gameplay_config_match_pins FOR EACH ROW EXECUTE FUNCTION gameplay_config_pin_guard();
REVOKE ALL ON gameplay_config_versions,gameplay_config_active,gameplay_config_events,gameplay_config_match_pins FROM PUBLIC;
REVOKE ALL ON FUNCTION gameplay_config_version_guard(),gameplay_config_active_guard(),gameplay_config_immutable(),gameplay_config_pin_guard() FROM PUBLIC;
