-- New route clear receipts are separate from the historical map-pair journal.
-- Existing ownership, settlement receipts and match configuration pins stay intact.
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
     (bundle->'schemaVersion'='5'::jsonb AND engine_capability='arena8-coop-v4') OR
     (bundle->'schemaVersion'='6'::jsonb AND engine_capability='arena8-coop-v5') OR
     (bundle->'schemaVersion'='7'::jsonb AND engine_capability='arena8-coop-v6')
    )
    AND published_at IS NOT NULL AND state IN ('PUBLISHED','SUPERSEDED')
 ) THEN
  RAISE EXCEPTION 'Functional solo allocation requires a published configuration' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE pet_arena_campaign_route_clears (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 route_id text NOT NULL CHECK (route_id ~ '^recruit-[a-z][a-z0-9-]{2,55}$'),
 ruleset text NOT NULL DEFAULT 'arena8-coop-pve' CHECK (ruleset='arena8-coop-pve'),
 config_version bigint NOT NULL,
 config_digest text NOT NULL CHECK (config_digest ~ '^[a-f0-9]{64}$'),
 match_id uuid NOT NULL,
 settlement_id uuid NOT NULL,
 cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,route_id),
 UNIQUE(account_id,settlement_id),
 FOREIGN KEY(ruleset,config_version) REFERENCES gameplay_config_versions(ruleset,version)
);
CREATE FUNCTION pet_arena_campaign_route_clear_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM gameplay_config_versions v
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.bundle->'campaignRoutes')='array'
     THEN v.bundle->'campaignRoutes' ELSE '[]'::jsonb END) AS route(value)
   JOIN game_native_matches m ON m.id=NEW.match_id
   JOIN game_native_settlements s ON s.match_id=m.id AND s.state_version=m.state_version AND s.epoch=m.epoch
  WHERE v.ruleset=NEW.ruleset AND v.version=NEW.config_version AND v.content_digest=NEW.config_digest
   AND v.published_at IS NOT NULL AND v.bundle->'schemaVersion'='7'::jsonb AND v.engine_capability='arena8-coop-v6'
   AND route.value->>'id'=NEW.route_id AND route.value->'enabled'='true'::jsonb
   AND m.status='SETTLING' AND m.ruleset_id IN ('arena8-functional-pve','arena8-coop-pve')
   AND s.settlement_id=NEW.settlement_id AND s.proposal->>'outcome'='won'
   AND s.proposal->>'configDigest'=NEW.config_digest AND s.proposal->>'contentHash'=encode(m.content_hash,'hex')
   AND s.proposal->>'encounterId'=NEW.route_id AND s.proposal->'participants' @> jsonb_build_array(
    jsonb_build_object('account',NEW.account_id::text)
   )
   AND (
    (m.ruleset_id='arena8-functional-pve' AND EXISTS (
     SELECT 1 FROM platform_native_arena8_matches n WHERE n.match_id=m.id AND n.account_id=NEW.account_id
      AND n.encounter_id=NEW.route_id AND n.status='ACTIVE'
      AND n.functional_config_version=NEW.config_version AND n.functional_config_digest=NEW.config_digest
    )) OR (m.ruleset_id='arena8-coop-pve' AND route.value->>'mode'='either' AND EXISTS (
     SELECT 1 FROM coop_allocations a JOIN coop_rooms room ON room.id=a.room_id
     WHERE a.match_id=m.id AND a.status='ACTIVE' AND room.boss_id=NEW.route_id
      AND a.config_version=NEW.config_version AND a.config_digest=NEW.config_digest
    ))
   )
 ) THEN
  RAISE EXCEPTION 'Campaign clear requires the exact pinned qualifying native victory' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pet_arena_campaign_route_clear_verified BEFORE INSERT ON pet_arena_campaign_route_clears
 FOR EACH ROW EXECUTE FUNCTION pet_arena_campaign_route_clear_guard();
CREATE TRIGGER pet_arena_campaign_route_clear_immutable BEFORE UPDATE ON pet_arena_campaign_route_clears
 FOR EACH ROW EXECUTE FUNCTION gameplay_config_immutable();
REVOKE ALL ON pet_arena_campaign_route_clears FROM PUBLIC;
REVOKE ALL ON FUNCTION pet_arena_campaign_route_clear_guard() FROM PUBLIC;
