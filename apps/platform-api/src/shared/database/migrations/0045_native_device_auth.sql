CREATE TABLE native_device_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  identity_session_id uuid NOT NULL UNIQUE REFERENCES identity_sessions(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'android' CHECK(platform='android'),
  credential_ciphertext text NOT NULL CHECK(credential_ciphertext ~ '^nc1\.[A-Za-z0-9_-]{123}$'),
  bootstrap_hash text NOT NULL CHECK(bootstrap_hash ~ '^[a-f0-9]{64}$'),
  refresh_hash text NOT NULL UNIQUE CHECK(refresh_hash ~ '^[a-f0-9]{64}$'),
  label text NOT NULL CHECK(char_length(label) BETWEEN 2 AND 48),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
  revoked_at timestamptz,
  UNIQUE(id,account_id,identity_session_id)
);
CREATE INDEX native_device_account ON native_device_sessions(account_id,created_at,id);
CREATE TABLE native_access_grants (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES native_device_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  client_build text NOT NULL CHECK(client_build ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK(expires_at>created_at),
  UNIQUE(id,device_id)
);
CREATE INDEX native_access_expiry ON native_access_grants(device_id,expires_at);
CREATE TABLE native_refresh_spent (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  device_id uuid NOT NULL REFERENCES native_device_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE native_socket_tickets (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  device_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  identity_session_id uuid NOT NULL,
  audience text NOT NULL CHECK(audience='native-socket-v1'),
  protocol jsonb NOT NULL,
  protocol_hash text NOT NULL CHECK(protocol_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK(expires_at>created_at),
  FOREIGN KEY(device_id,account_id,identity_session_id) REFERENCES native_device_sessions(id,account_id,identity_session_id) ON DELETE CASCADE,
  FOREIGN KEY(grant_id,device_id) REFERENCES native_access_grants(id,device_id) ON DELETE CASCADE
);
CREATE INDEX native_ticket_expiry ON native_socket_tickets(device_id,expires_at);
