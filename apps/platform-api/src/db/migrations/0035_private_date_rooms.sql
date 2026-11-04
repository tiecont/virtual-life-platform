-- Existing general block rows retain their original disclosure contract.
-- A trusted private-context block enforces contact denial without returning a
-- new peer account identifier in general block lists or own exports.
ALTER TABLE social_blocks ADD COLUMN disclose_target boolean NOT NULL DEFAULT true;
CREATE TABLE restricted_dating_dates (
 proposal_id uuid PRIMARY KEY REFERENCES restricted_dating_proposals(id) ON DELETE CASCADE,
 owner_epoch uuid NOT NULL,version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 phase text NOT NULL CHECK(phase IN ('WAITING','ACTIVE','ENDED')),
 entered_a boolean NOT NULL DEFAULT false,entered_b boolean NOT NULL DEFAULT false,
 connection_a uuid,connection_b uuid,
 created_at timestamptz NOT NULL,changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 started_at timestamptz,expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '300 seconds'),
 CHECK(phase<>'ACTIVE' OR (entered_a AND entered_b AND started_at IS NOT NULL)),
 CHECK(entered_a=(connection_a IS NOT NULL)),CHECK(entered_b=(connection_b IS NOT NULL)),
 CHECK(started_at IS NULL OR (started_at>=created_at AND started_at<expires_at))
);
CREATE INDEX dating_date_cleanup ON restricted_dating_dates(changed_at) WHERE phase='ENDED';
CREATE TABLE restricted_dating_date_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 proposal_id uuid NOT NULL REFERENCES restricted_dating_dates(proposal_id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('enter','chat')),fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 message_id uuid,created_at timestamptz NOT NULL,
 PRIMARY KEY(account_id,request_id),CHECK((operation='chat')=(message_id IS NOT NULL))
);
CREATE INDEX dating_date_receipt_budget ON restricted_dating_date_mutations(account_id,created_at);
