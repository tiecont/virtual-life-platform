-- Extend the publication guard for new v4 allocations while preserving the
-- immutable pins of existing solo matches.
CREATE OR REPLACE FUNCTION platform_functional_solo_pin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.functional_config_version,NEW.functional_config_digest,NEW.functional_allocation)
     IS DISTINCT FROM ROW(OLD.functional_config_version,OLD.functional_config_digest,OLD.functional_allocation) THEN
   RAISE EXCEPTION 'Functional solo allocation pin is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.functional_config_version IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM gameplay_config_versions
   WHERE ruleset='arena8-coop-pve' AND version=NEW.functional_config_version
    AND content_digest=NEW.functional_config_digest AND (
     (bundle->'schemaVersion'='3'::jsonb AND engine_capability='arena8-coop-v2') OR
     (bundle->'schemaVersion'='4'::jsonb AND engine_capability='arena8-coop-v3') OR
     (bundle->'schemaVersion'='5'::jsonb AND engine_capability='arena8-coop-v4')
    )
    AND published_at IS NOT NULL AND state IN ('PUBLISHED','SUPERSEDED')
 ) THEN
  RAISE EXCEPTION 'Functional solo allocation requires a published configuration' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
