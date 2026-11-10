-- Control-plane grants only. Worlds start closed; no runtime or SQL role activated.
CREATE TABLE platform_native_worlds (
 world_id text PRIMARY KEY CHECK (world_id ~ '^native:[a-z0-9][a-z0-9._-]{0,63}$'),
 boot_id uuid NOT NULL,
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 generation bigint NOT NULL DEFAULT 1 CHECK (generation BETWEEN 1 AND 9007199254740991),
 enabled boolean NOT NULL DEFAULT false,
 capacity integer NOT NULL DEFAULT 0 CHECK (capacity BETWEEN 0 AND 10000),
 lease_until timestamptz NOT NULL,
 CHECK (NOT enabled OR capacity>0)
);
CREATE TABLE platform_native_admissions (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES identity_sessions(id) ON DELETE CASCADE,
 world_id text NOT NULL REFERENCES platform_native_worlds(world_id),
 generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
 world_generation bigint NOT NULL CHECK (world_generation BETWEEN 1 AND 9007199254740991),
 allowed boolean NOT NULL,
 valid_until timestamptz NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_native_admission_capacity ON platform_native_admissions(world_id,valid_until) WHERE allowed;
CREATE TABLE platform_native_ticket_uses (
 nonce text PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'),
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES identity_sessions(id) ON DELETE CASCADE,
 boot_id uuid NOT NULL,
 world_id text NOT NULL REFERENCES platform_native_worlds(world_id),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_native_ticket_expiry ON platform_native_ticket_uses(expires_at);
