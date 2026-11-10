CREATE TABLE identity_legacy_links (
 provider text NOT NULL CHECK(provider IN ('deadline','maid')),
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 source_subject uuid,
 active boolean NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),
 linked_at timestamptz,
 changed_at timestamptz NOT NULL,
 link_window_at timestamptz NOT NULL,
 link_count integer NOT NULL CHECK(link_count BETWEEN 0 AND 24),
 PRIMARY KEY(provider,account_id),UNIQUE(provider,source_subject),
 CHECK((source_subject IS NULL AND NOT active AND linked_at IS NULL) OR (source_subject IS NOT NULL AND linked_at IS NOT NULL)),
 CHECK(linked_at IS NULL OR changed_at>=linked_at)
);
CREATE TABLE identity_legacy_mutations (
 provider text NOT NULL CHECK(provider IN ('deadline','maid')),
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('link','unlink')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 created_order bigserial NOT NULL,
 PRIMARY KEY(provider,account_id,request_id)
);
CREATE INDEX identity_legacy_mutations_retention ON identity_legacy_mutations(created_at);
