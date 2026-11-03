CREATE TABLE invitation_groups (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  recipient_count integer NOT NULL CHECK(recipient_count BETWEEN 2 AND 4),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(actor_id,request_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 minutes')
);
CREATE INDEX invitation_group_budget ON invitation_groups(actor_id,created_at);
CREATE TABLE invitation_group_items (
  group_id uuid NOT NULL REFERENCES invitation_groups(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK(position BETWEEN 0 AND 3),
  outcome text CHECK(outcome IN ('SENT','UNAVAILABLE','RATE_LIMITED','CONFLICT','EXPIRED')),
  invitation_id uuid REFERENCES invitations(id) ON DELETE SET NULL,
  PRIMARY KEY(group_id,position),
  CHECK(invitation_id IS NULL OR outcome='SENT')
);
