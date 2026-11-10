CREATE TABLE identity_accounts (
  id uuid PRIMARY KEY,
  kind text NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest','registered')),
  created_at timestamptz NOT NULL
);
CREATE TABLE identity_profiles (
  account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 24),
  avatar_key text NOT NULL
);
CREATE TABLE identity_privacy (
  account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
  choices jsonb NOT NULL
);
CREATE TABLE identity_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text CHECK(revoked_reason IN ('rotate','logout','upgrade')),
  created_at timestamptz NOT NULL
);
CREATE INDEX identity_sessions_account ON identity_sessions(account_id);
CREATE INDEX identity_sessions_expiry ON identity_sessions(expires_at);
CREATE TABLE identity_bootstraps (
  request_hash text PRIMARY KEY,
  server_nonce text NOT NULL,
  fingerprint text NOT NULL,
  session_id uuid REFERENCES identity_sessions(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE identity_mutations (
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES identity_sessions(id) ON DELETE CASCADE,
  operation text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(account_id,request_id)
);
CREATE TABLE identity_consents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE identity_deletion_receipts (
  token_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
