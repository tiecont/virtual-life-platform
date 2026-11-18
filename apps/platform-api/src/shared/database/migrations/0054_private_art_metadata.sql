-- Private declarations only: no object credentials, uploads or art approval.
CREATE TABLE operator_art_drafts (
 id uuid PRIMARY KEY,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 operator_ref text NOT NULL CHECK(operator_ref ~ '^[a-f0-9]{64}$'),
 metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=4096),
 publication text NOT NULL DEFAULT 'UNPUBLISHED' CHECK(publication='UNPUBLISHED'),
 art_gate text NOT NULL DEFAULT 'NOT_REVIEWED' CHECK(art_gate='NOT_REVIEWED'),
 content_verification text NOT NULL DEFAULT 'UNVERIFIED' CHECK(content_verification='UNVERIFIED'),
 created_at timestamptz NOT NULL
);
CREATE INDEX operator_art_drafts_created ON operator_art_drafts(created_at);
CREATE FUNCTION operator_art_draft_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Private art intake is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER operator_art_draft_immutable BEFORE UPDATE OR DELETE ON operator_art_drafts FOR EACH ROW EXECUTE FUNCTION operator_art_draft_immutable();
CREATE TRIGGER operator_art_draft_no_truncate BEFORE TRUNCATE ON operator_art_drafts FOR EACH STATEMENT EXECUTE FUNCTION operator_art_draft_immutable();
REVOKE ALL ON operator_art_drafts FROM PUBLIC;
REVOKE ALL ON FUNCTION operator_art_draft_immutable() FROM PUBLIC;
