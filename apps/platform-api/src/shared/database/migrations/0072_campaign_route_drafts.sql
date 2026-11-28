-- Immutable draft revisions. Native activation requires a compatible gameplay
-- publication and does not use this separate authoring table as authority.
CREATE TABLE pet_arena_campaign_route_drafts (
 version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (version BETWEEN 1 AND 9007199254740991),
 content_digest text NOT NULL UNIQUE CHECK (content_digest ~ '^[a-f0-9]{64}$'),
 source_revision text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{40}$'),
 draft jsonb NOT NULL CHECK (
  jsonb_typeof(draft)='object' AND octet_length(draft::text) BETWEEN 2 AND 65536
  AND coalesce(draft->'version'='1'::jsonb,false)
  AND coalesce(draft->'state'='"draft-only"'::jsonb,false)
  AND coalesce(draft->'acquisitionEnabled'='false'::jsonb,false)
  AND CASE WHEN jsonb_typeof(draft->'maps')='array' THEN jsonb_array_length(draft->'maps')=6 ELSE false END
 ),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER pet_arena_campaign_route_drafts_immutable BEFORE UPDATE OR DELETE ON pet_arena_campaign_route_drafts
 FOR EACH ROW EXECUTE FUNCTION gameplay_config_immutable();
REVOKE ALL ON pet_arena_campaign_route_drafts FROM PUBLIC;
REVOKE ALL ON SEQUENCE pet_arena_campaign_route_drafts_version_seq FROM PUBLIC;
