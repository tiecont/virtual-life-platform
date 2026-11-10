CREATE TABLE invitation_preferences (
  account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
  allow_invitations boolean NOT NULL DEFAULT false
);
CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  destination jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  CHECK(sender_id<>recipient_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 minutes'),
  CHECK(changed_at>=created_at)
);
CREATE UNIQUE INDEX invitation_pending_pair ON invitations(sender_id,recipient_id) WHERE state='PENDING';
CREATE INDEX invitation_sender_budget ON invitations(sender_id,created_at);
CREATE INDEX invitation_inbox ON invitations(recipient_id,id);
CREATE INDEX invitation_outbox ON invitations(sender_id,id);
CREATE INDEX invitation_expiry ON invitations(expires_at) WHERE state='PENDING';
CREATE TABLE invitation_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('create','respond','settings')),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  invitation_id uuid REFERENCES invitations(id) ON DELETE CASCADE,
  result jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id),
  CHECK((operation='settings' AND invitation_id IS NULL AND result IS NOT NULL) OR (operation<>'settings' AND invitation_id IS NOT NULL AND result IS NULL))
);
