CREATE TABLE social_preferences (
  account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
  contact_code text NOT NULL UNIQUE DEFAULT ('VL-' || upper(replace(gen_random_uuid()::text,'-',''))),
  request_policy text NOT NULL DEFAULT 'code' CHECK(request_policy IN ('code','none')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE social_friend_requests (
  id uuid PRIMARY KEY,
  from_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  pair_low uuid GENERATED ALWAYS AS (LEAST(from_id,to_id)) STORED,
  pair_high uuid GENERATED ALWAYS AS (GREATEST(from_id,to_id)) STORED,
  state text NOT NULL CHECK(state IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  target_code_hint text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK(from_id<>to_id), CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX social_one_pending_pair ON social_friend_requests(pair_low,pair_high) WHERE state='PENDING';
CREATE INDEX social_request_recipient ON social_friend_requests(to_id,created_at);
CREATE INDEX social_request_sender ON social_friend_requests(from_id,created_at);
CREATE INDEX social_request_expiry ON social_friend_requests(expires_at) WHERE state='PENDING';
CREATE TABLE social_friendships (
  low_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  high_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(low_id,high_id), CHECK(low_id<high_id)
);
CREATE INDEX social_friendships_high ON social_friendships(high_id);
CREATE TABLE social_blocks (
  blocker_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  display_name_snapshot text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE INDEX social_blocks_target ON social_blocks(blocked_id);
CREATE TABLE social_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  operation text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
