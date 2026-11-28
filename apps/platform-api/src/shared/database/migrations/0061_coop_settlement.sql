-- Cooperative settlement: one durable inbox row per committed team completion
-- and one reward journal row per participant. Rewards are paid from the
-- published bundle pinned by the allocation, never from a proposal amount.
CREATE TABLE coop_settlement_inbox (
 settlement_id uuid PRIMARY KEY,
 match_id uuid NOT NULL,
 room_id uuid NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('won','lost')),
 achievement_points integer NOT NULL CHECK (achievement_points BETWEEN 0 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE coop_settlement_rewards (
 settlement_id uuid NOT NULL REFERENCES coop_settlement_inbox(settlement_id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 seat smallint NOT NULL CHECK (seat BETWEEN 0 AND 3),
 outcome text NOT NULL CHECK (outcome IN ('won','lost')),
 achievement_points integer NOT NULL CHECK (achievement_points BETWEEN 0 AND 1000000),
 coins integer NOT NULL CHECK (coins BETWEEN 0 AND 1000000),
 exp integer NOT NULL CHECK (exp BETWEEN 0 AND 1000000),
 pet_id text NOT NULL CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (settlement_id, account_id),
 UNIQUE (settlement_id, seat)
);
REVOKE ALL ON coop_settlement_inbox,coop_settlement_rewards FROM PUBLIC;
