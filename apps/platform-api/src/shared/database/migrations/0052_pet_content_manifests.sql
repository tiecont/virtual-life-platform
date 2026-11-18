-- Offline v3 content only. No production publication, grants or runtime activation.
CREATE TABLE pet_content_versions (
 content_hash text PRIMARY KEY CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 rules_hash text NOT NULL CHECK (rules_hash ~ '^[a-f0-9]{64}$'),
 ruleset text NOT NULL CHECK (ruleset='pet-arena-pve-v3'),
 schema_version integer NOT NULL CHECK (schema_version=3),
 release text NOT NULL CHECK (release='OFFLINE_ONLY'),
 manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=4194304),
 state text NOT NULL DEFAULT 'sealed' CHECK (state IN ('sealed','retired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(content_hash,rules_hash)
);
CREATE TABLE pet_content_selection (
 channel text PRIMARY KEY CHECK (channel='offline-v3'),
 content_hash text REFERENCES pet_content_versions(content_hash),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
INSERT INTO pet_content_selection(channel) VALUES('offline-v3');
CREATE TABLE pet_content_transitions (
 revision bigint PRIMARY KEY CHECK (revision BETWEEN 1 AND 9007199254740991),
 action text NOT NULL CHECK (action IN ('select','rollback','retire')),
 content_hash text NOT NULL REFERENCES pet_content_versions(content_hash),
 previous_hash text REFERENCES pet_content_versions(content_hash),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pet_content_match_pins (
 match_id uuid PRIMARY KEY REFERENCES game_native_matches(id) DEFERRABLE INITIALLY DEFERRED,
 content_hash text NOT NULL,
 rules_hash text NOT NULL,
 binding jsonb NOT NULL CHECK (jsonb_typeof(binding)='object' AND octet_length(binding::text)<=4096),
 FOREIGN KEY(content_hash,rules_hash) REFERENCES pet_content_versions(content_hash,rules_hash)
);
CREATE FUNCTION pet_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='pet_content_versions' AND TG_OP='UPDATE' THEN
  IF OLD.state='sealed' AND NEW.state='retired' AND (to_jsonb(OLD)-'state')=(to_jsonb(NEW)-'state') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Sealed Pet content is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER pet_content_version_immutable BEFORE UPDATE OR DELETE ON pet_content_versions FOR EACH ROW EXECUTE FUNCTION pet_content_immutable();
CREATE TRIGGER pet_content_pin_immutable BEFORE UPDATE OR DELETE ON pet_content_match_pins FOR EACH ROW EXECUTE FUNCTION pet_content_immutable();
CREATE TRIGGER pet_content_transition_immutable BEFORE UPDATE OR DELETE ON pet_content_transitions FOR EACH ROW EXECUTE FUNCTION pet_content_immutable();
-- Every future v3 native match must atomically commit its immutable manifest pin.
-- Existing v1 and legacy rows are deliberately outside this new constraint.
CREATE FUNCTION pet_content_require_pin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m game_native_matches%ROWTYPE; p pet_content_match_pins%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='game_native_matches' THEN
  IF NEW.ruleset_id<>'pet-arena-pve-v3' THEN RETURN NEW; END IF;
  SELECT * INTO m FROM game_native_matches WHERE id=NEW.id;
 ELSE SELECT * INTO m FROM game_native_matches WHERE id=NEW.match_id;
 END IF;
 SELECT * INTO p FROM pet_content_match_pins WHERE match_id=m.id;
 IF m.id IS NULL OR m.ruleset_id<>'pet-arena-pve-v3' OR m.ruleset_version<>3 OR p.match_id IS NULL OR encode(m.content_hash,'hex')<>p.content_hash OR encode(m.engine_hash,'hex')<>p.rules_hash THEN
  RAISE EXCEPTION 'V3 match content pin mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER pet_content_native_pin AFTER INSERT ON game_native_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pet_content_require_pin();
CREATE CONSTRAINT TRIGGER pet_content_match_binding AFTER INSERT ON pet_content_match_pins DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pet_content_require_pin();
REVOKE ALL ON pet_content_versions,pet_content_selection,pet_content_transitions,pet_content_match_pins FROM PUBLIC;
REVOKE ALL ON FUNCTION pet_content_immutable(),pet_content_require_pin() FROM PUBLIC;
