CREATE SEQUENCE restricted_dating_recovery;
CREATE TABLE restricted_dating_match_consent (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0), changed_at timestamptz NOT NULL
);
CREATE TABLE restricted_dating_proposals (
 id uuid PRIMARY KEY, account_a uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 account_b uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('PROPOSED','ACCEPTED','ENDED')), version integer NOT NULL CHECK(version>=0),
 accepted_a boolean NOT NULL DEFAULT false, accepted_b boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '345 seconds'),
 checked_order bigint NOT NULL DEFAULT nextval('restricted_dating_recovery'),
 CHECK(account_a<account_b), CHECK(phase<>'ACCEPTED' OR (accepted_a AND accepted_b))
);
CREATE INDEX dating_proposal_recovery ON restricted_dating_proposals(checked_order) WHERE phase<>'ENDED';
CREATE TABLE restricted_dating_enrollments (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES identity_sessions(id) ON DELETE CASCADE,
 consent_revision integer NOT NULL CHECK(consent_revision>=0),profile_revision integer NOT NULL CHECK(profile_revision>=0),
 proposal_id uuid REFERENCES restricted_dating_proposals(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 checked_order bigint NOT NULL DEFAULT nextval('restricted_dating_recovery')
);
CREATE INDEX dating_queue ON restricted_dating_enrollments(checked_order) WHERE proposal_id IS NULL;
CREATE INDEX dating_enrollment_proposal ON restricted_dating_enrollments(proposal_id);
CREATE TABLE restricted_dating_match_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('join','accept','decline','stop')),fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,PRIMARY KEY(account_id,request_id)
);
CREATE INDEX dating_match_receipt_expiry ON restricted_dating_match_mutations(created_at,account_id,request_id);
