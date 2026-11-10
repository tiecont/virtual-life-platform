CREATE TABLE travel_intents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES identity_sessions(id) ON DELETE CASCADE,
  owner_epoch uuid NOT NULL,
  source jsonb,
  destination jsonb NOT NULL,
  scope_fingerprint text NOT NULL CHECK(scope_fingerprint ~ '^[a-f0-9]{64}$'),
  capability_digest text NOT NULL CHECK(capability_digest ~ '^[a-f0-9]{64}$'),
  phase text NOT NULL CHECK(phase IN ('CREATED','READY','COMMITTED','EXPIRED','FAILED','CANCELLED')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redemption_key uuid,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 seconds'),
  CHECK(changed_at>=created_at),
  CHECK((phase='EXPIRED' AND changed_at>=expires_at) OR (phase<>'EXPIRED' AND changed_at<expires_at)),
  CHECK(phase<>'CREATED' OR changed_at=created_at),
  CHECK((redeemed_at IS NULL)=(redemption_key IS NULL)),
  CHECK(redeemed_at IS NULL OR (redeemed_at>=created_at AND redeemed_at<expires_at))
);
CREATE UNIQUE INDEX travel_one_active_account ON travel_intents(account_id) WHERE phase IN ('CREATED','READY');
CREATE INDEX travel_account_budget ON travel_intents(account_id,created_at);
CREATE INDEX travel_expiry ON travel_intents(expires_at) WHERE phase IN ('CREATED','READY');
CREATE TABLE travel_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  intent_id uuid NOT NULL REFERENCES travel_intents(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK(operation IN ('create','cancel','redeem')),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
