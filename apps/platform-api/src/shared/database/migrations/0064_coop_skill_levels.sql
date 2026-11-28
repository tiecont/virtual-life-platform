CREATE TABLE coop_skill_levels (
 owned_pet_instance_id uuid NOT NULL REFERENCES pet_wave_one_owned(owned_pet_instance_id) ON DELETE CASCADE,
 skill_id text NOT NULL CHECK (length(skill_id) BETWEEN 1 AND 64),
 level smallint NOT NULL CHECK (level BETWEEN 2 AND 10),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (owned_pet_instance_id, skill_id)
);

CREATE TABLE coop_skill_upgrade_receipts (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object' AND octet_length(receipt::text) <= 4096),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (account_id, request_id)
);
