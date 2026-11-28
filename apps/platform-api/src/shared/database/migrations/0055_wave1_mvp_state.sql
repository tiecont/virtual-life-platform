-- Local/test Wave 1 Pet Arena durable state. Additive only; no purchase,
-- publication or production authorization is created by these tables.
CREATE TABLE pet_wave_one_players (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 coins integer NOT NULL CHECK (coins >= 0),
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 gacha_misses smallint NOT NULL DEFAULT 0 CHECK (gacha_misses BETWEEN 0 AND 79),
 gacha_guaranteed boolean NOT NULL DEFAULT false,
 gacha_revision integer NOT NULL DEFAULT 0 CHECK (gacha_revision >= 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pet_wave_one_owned (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 pet_id text NOT NULL CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 level smallint NOT NULL CHECK (level BETWEEN 1 AND 60),
 exp integer NOT NULL CHECK (exp >= 0 AND (level = 60 AND exp = 0 OR level < 60 AND exp < 25 + level * 5)),
 duplicate_exp integer NOT NULL DEFAULT 0 CHECK (duplicate_exp >= 0),
 source text NOT NULL CHECK (source IN ('starter','gacha','campaign')),
 acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,pet_id)
);
CREATE TABLE pet_wave_one_party (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 3),
 pet_id text NOT NULL,
 PRIMARY KEY(account_id,slot),
 UNIQUE(account_id,pet_id),
 FOREIGN KEY(account_id,pet_id) REFERENCES pet_wave_one_owned(account_id,pet_id) ON DELETE CASCADE
);
CREATE TABLE pet_wave_one_map_clears (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 map_id text NOT NULL CHECK (map_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 replays integer NOT NULL DEFAULT 0 CHECK (replays >= 0),
 cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,map_id)
);
CREATE TABLE pet_wave_one_gacha_history (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 seq integer NOT NULL CHECK (seq > 0),
 pet_id text CHECK (pet_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 featured boolean NOT NULL,
 duplicate boolean NOT NULL,
 pity_before smallint NOT NULL CHECK (pity_before BETWEEN 0 AND 79),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (pet_id IS NOT NULL OR (NOT featured AND NOT duplicate)),
 PRIMARY KEY(account_id,seq)
);
CREATE TABLE pet_wave_one_requests (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,request_id)
);
REVOKE ALL ON pet_wave_one_players,pet_wave_one_owned,pet_wave_one_party,pet_wave_one_map_clears,pet_wave_one_gacha_history,pet_wave_one_requests FROM PUBLIC;
