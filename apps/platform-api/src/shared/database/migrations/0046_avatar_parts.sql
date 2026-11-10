-- Additive modular selections. Keep identity_profiles.avatar_key and legacy
-- engine_progression_appearance unchanged for old clients and rollback.
CREATE TABLE engine_avatar_parts (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 catalog_version text NOT NULL CHECK (length(catalog_version) BETWEEN 1 AND 64),
 revision integer NOT NULL CHECK (revision > 0),
 parts jsonb NOT NULL CHECK (jsonb_typeof(parts) = 'object'),
 changed_at timestamptz NOT NULL
);
CREATE TABLE engine_avatar_part_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL,
 saved_revision integer NOT NULL CHECK (saved_revision > 0),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(account_id,request_id)
);
CREATE INDEX engine_avatar_part_mutations_rate ON engine_avatar_part_mutations(account_id,created_at);
