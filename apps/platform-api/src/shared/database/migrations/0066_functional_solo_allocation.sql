-- Scope functional solo to the same immutable PostgreSQL publications used by
-- the co-op validator. Existing elemental allocations retain their NULL pins.
ALTER TABLE platform_native_arena8_matches
 ADD COLUMN functional_config_version bigint,
 ADD COLUMN functional_config_digest text CHECK (functional_config_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN functional_allocation jsonb,
 ADD COLUMN functional_config_ruleset text GENERATED ALWAYS AS (
  CASE WHEN functional_config_version IS NOT NULL THEN 'arena8-coop-pve' END
 ) STORED,
 ADD CONSTRAINT arena8_solo_config_fk FOREIGN KEY (functional_config_ruleset,functional_config_version)
  REFERENCES gameplay_config_versions(ruleset,version),
 ADD CONSTRAINT arena8_solo_pin_complete CHECK (
  (functional_config_version IS NULL AND functional_config_digest IS NULL AND functional_allocation IS NULL)
  OR (functional_config_version IS NOT NULL AND functional_config_digest IS NOT NULL
   AND functional_allocation IS NOT NULL AND jsonb_typeof(functional_allocation)='object'
   AND octet_length(functional_allocation::text)<=8192)
 );

CREATE FUNCTION platform_functional_solo_pin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.functional_config_version,NEW.functional_config_digest,NEW.functional_allocation)
     IS DISTINCT FROM ROW(OLD.functional_config_version,OLD.functional_config_digest,OLD.functional_allocation) THEN
   RAISE EXCEPTION 'Functional solo allocation pin is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.functional_config_version IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM gameplay_config_versions
   WHERE ruleset='arena8-coop-pve' AND version=NEW.functional_config_version
    AND content_digest=NEW.functional_config_digest AND engine_capability='arena8-coop-v2'
    AND published_at IS NOT NULL AND state IN ('PUBLISHED','SUPERSEDED')
 ) THEN
  RAISE EXCEPTION 'Functional solo allocation requires a published configuration' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER platform_functional_solo_pin_guard
 BEFORE INSERT OR UPDATE ON platform_native_arena8_matches FOR EACH ROW EXECUTE FUNCTION platform_functional_solo_pin_guard();
REVOKE ALL ON FUNCTION platform_functional_solo_pin_guard() FROM PUBLIC;
