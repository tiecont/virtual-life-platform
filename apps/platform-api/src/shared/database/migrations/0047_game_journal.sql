-- Additive local game foundation. No world/mode activation or rewards.
CREATE TABLE engine_game_matches (
 id uuid PRIMARY KEY,
 table_id uuid NOT NULL,
 generation uuid NOT NULL,
 room_epoch uuid NOT NULL,
 room_id uuid NOT NULL,
 mode text NOT NULL CHECK (mode IN ('lantern-colors','mask-and-tell','mistbound-routes')),
 ruleset_version text NOT NULL CHECK (length(ruleset_version) BETWEEN 5 AND 32),
 status text NOT NULL CHECK (status IN ('ACTIVE','SETTLING','FINISHED','ABORTED','INTERRUPTED')),
 state_version integer NOT NULL CHECK (state_version>0),
 deadline_ms bigint CHECK (deadline_ms>=0),
 key_id text,
 sealed_state text,
 seed_commitment text NOT NULL CHECK (seed_commitment ~ '^[a-f0-9]{64}$'),
 starter_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
 start_request_id uuid NOT NULL,
 start_fingerprint text NOT NULL CHECK (start_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 UNIQUE(id,generation),
 UNIQUE(starter_id,start_request_id),
 CHECK ((key_id IS NULL)=(sealed_state IS NULL)),
 CHECK ((key_id IS NULL AND sealed_state IS NULL) OR (key_id ~ '^game-[a-z0-9-]{1,27}$' AND sealed_state ~ '^gj1\.[A-Za-z0-9_-]+$' AND length(sealed_state)<=700000)),
 CHECK (status IN ('FINISHED','ABORTED','INTERRUPTED') OR (sealed_state IS NOT NULL AND deadline_ms IS NOT NULL)),
 CHECK (status NOT IN ('FINISHED','ABORTED','INTERRUPTED') OR deadline_ms IS NULL)
);
CREATE UNIQUE INDEX engine_game_one_active_room ON engine_game_matches(room_epoch,room_id) WHERE status NOT IN ('FINISHED','ABORTED','INTERRUPTED');
CREATE INDEX engine_game_recovery ON engine_game_matches(updated_at,id) WHERE status NOT IN ('FINISHED','ABORTED','INTERRUPTED');
CREATE TABLE engine_game_participants (
 match_id uuid NOT NULL REFERENCES engine_game_matches(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 membership_id uuid NOT NULL,
 -- Retain only an opaque proof ID; session GC must not silently release a
 -- still-active match's account claim. Every action rechecks identity authority.
 session_id uuid NOT NULL,
 seat_index integer NOT NULL CHECK (seat_index BETWEEN 0 AND 7),
 PRIMARY KEY(match_id,account_id),
 UNIQUE(match_id,seat_index)
);
CREATE TABLE engine_game_active_claims (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 match_id uuid NOT NULL,
 generation uuid NOT NULL,
 FOREIGN KEY(match_id,account_id) REFERENCES engine_game_participants(match_id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(match_id,generation) REFERENCES engine_game_matches(id,generation) ON DELETE CASCADE
);
CREATE TABLE engine_game_receipts (
 match_id uuid NOT NULL,
 account_id uuid NOT NULL,
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 accepted boolean NOT NULL,
 committed_version integer NOT NULL CHECK (committed_version>0),
 error_code text CHECK (length(error_code) BETWEEN 1 AND 64),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(match_id,account_id,request_id),
 FOREIGN KEY(match_id,account_id) REFERENCES engine_game_participants(match_id,account_id) ON DELETE CASCADE,
 CHECK ((accepted AND error_code IS NULL) OR (NOT accepted AND error_code IS NOT NULL))
);
CREATE TABLE engine_game_results (
 match_id uuid PRIMARY KEY REFERENCES engine_game_matches(id) ON DELETE CASCADE,
 outcome text NOT NULL CHECK (outcome IN ('finished','aborted')),
 state_version integer NOT NULL CHECK (state_version>0),
 created_at timestamptz NOT NULL
);
CREATE TABLE engine_game_outbox (
 match_id uuid NOT NULL,
 state_version integer NOT NULL CHECK (state_version>0),
 recipient_id uuid NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(match_id,state_version,recipient_id),
 FOREIGN KEY(match_id,recipient_id) REFERENCES engine_game_participants(match_id,account_id) ON DELETE CASCADE
);
