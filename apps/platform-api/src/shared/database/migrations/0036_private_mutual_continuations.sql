CREATE SEQUENCE restricted_dating_continuation_recovery;
-- Opaque ID is the original date handle. Minimal consent survives ordinary
-- 24-hour date-history purge;there is deliberately no cascading date-history FK.
CREATE TABLE restricted_dating_continuations (
 id uuid PRIMARY KEY,account_a uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 account_b uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('PENDING','MUTUAL','REVOKED')),
 profile_a integer NOT NULL CHECK(profile_a>=0),profile_b integer NOT NULL CHECK(profile_b>=0),
 liked_a boolean NOT NULL DEFAULT false,liked_b boolean NOT NULL DEFAULT false,
 version_a integer NOT NULL DEFAULT 0 CHECK(version_a>=0),version_b integer NOT NULL DEFAULT 0 CHECK(version_b>=0),
 source_created_at timestamptz NOT NULL,created_at timestamptz NOT NULL,changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 checked_order bigint NOT NULL DEFAULT nextval('restricted_dating_continuation_recovery'),
 CHECK(account_a<account_b),CHECK(phase<>'MUTUAL' OR (liked_a AND liked_b)),
 CHECK(phase<>'PENDING' OR expires_at<=source_created_at+interval '24 hours'),
 CHECK(phase<>'MUTUAL' OR expires_at<=changed_at+interval '720 hours')
);
CREATE INDEX dating_continuation_recovery ON restricted_dating_continuations(checked_order) WHERE phase<>'REVOKED';
CREATE TABLE restricted_dating_continuation_members (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 continuation_id uuid NOT NULL REFERENCES restricted_dating_continuations(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL
);
CREATE INDEX dating_continuation_members_source ON restricted_dating_continuation_members(continuation_id);
CREATE TABLE restricted_dating_continuation_consent (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0),changed_at timestamptz NOT NULL
);
CREATE TABLE restricted_dating_continuation_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('like','revoke')),fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,PRIMARY KEY(account_id,request_id)
);
CREATE INDEX dating_continuation_receipt_cleanup ON restricted_dating_continuation_mutations(created_at);
ALTER TABLE restricted_dating_enrollments ADD COLUMN continuation_id uuid REFERENCES restricted_dating_continuations(id) ON DELETE CASCADE;
ALTER TABLE restricted_dating_proposals ADD COLUMN continuation_id uuid REFERENCES restricted_dating_continuations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX dating_one_source_proposal ON restricted_dating_proposals(continuation_id) WHERE continuation_id IS NOT NULL AND phase<>'ENDED';
