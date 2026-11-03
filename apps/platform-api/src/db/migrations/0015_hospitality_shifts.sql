CREATE SEQUENCE engine_hospitality_recovery_sequence;
CREATE TABLE engine_hospitality_shifts (
 id uuid PRIMARY KEY, creation_order bigserial NOT NULL UNIQUE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 world_slug text NOT NULL, room_id uuid NOT NULL, owner_epoch uuid NOT NULL, membership_id uuid NOT NULL,
 policy_version text NOT NULL, started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 interrupted_at timestamptz, ended_at timestamptz, checked_order bigint NOT NULL DEFAULT 0,
 reason text CHECK(reason IN ('voluntary','disconnected','visit-ended','restart','expired')),
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '4 hours'),
 CHECK((ended_at IS NULL AND reason IS NULL) OR (ended_at>=started_at AND reason IS NOT NULL)),
 CHECK(interrupted_at IS NULL OR interrupted_at>=started_at)
);
CREATE UNIQUE INDEX hospitality_one_shift ON engine_hospitality_shifts(account_id) WHERE ended_at IS NULL;
CREATE INDEX hospitality_room_shifts ON engine_hospitality_shifts(room_id) WHERE ended_at IS NULL;
CREATE TABLE engine_hospitality_shift_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 shift_id uuid NOT NULL REFERENCES engine_hospitality_shifts(id) ON DELETE CASCADE,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN ('start','end')), created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
