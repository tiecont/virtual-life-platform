CREATE TABLE identity_credentials (
  account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
  login_name text NOT NULL UNIQUE CHECK(login_name ~ '^[a-z][a-z0-9_]{2,31}$'),
  salt text NOT NULL CHECK(char_length(salt)=32),
  digest text NOT NULL CHECK(char_length(digest)=128),
  kdf_version integer NOT NULL DEFAULT 1 CHECK(kdf_version=1)
);
CREATE TABLE identity_login_requests (
  request_hash text PRIMARY KEY,
  server_nonce text NOT NULL,
  fingerprint text NOT NULL,
  session_id uuid REFERENCES identity_sessions(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE identity_sessions DROP CONSTRAINT identity_sessions_revoked_reason_check;
ALTER TABLE identity_sessions ADD CONSTRAINT identity_sessions_revoked_reason_check CHECK(revoked_reason IN ('rotate','logout','upgrade','login'));
ALTER TABLE identity_sessions ADD COLUMN creation_order bigint GENERATED ALWAYS AS IDENTITY;
