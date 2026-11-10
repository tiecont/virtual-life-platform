CREATE SEQUENCE engine_audience_recovery;
CREATE TABLE engine_event_audience (
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,room_id uuid NOT NULL,
 epoch uuid NOT NULL,world_version text NOT NULL,policy_version text NOT NULL,
 mode text NOT NULL DEFAULT 'DISABLED' CHECK(mode IN ('OPEN','MUTED','DISABLED')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),changed_at timestamptz NOT NULL,
 approved_by uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,moderator_source jsonb,approval_until timestamptz,
 window_started_at timestamptz NOT NULL,clap smallint NOT NULL DEFAULT 0,star smallint NOT NULL DEFAULT 0,wave smallint NOT NULL DEFAULT 0,
 checked_order bigint NOT NULL DEFAULT nextval('engine_audience_recovery'),
 PRIMARY KEY(event_id,room_id),
 CHECK(clap>=0 AND star>=0 AND wave>=0 AND clap+star+wave<=20),
 CHECK(approval_until IS NULL OR approval_until<=changed_at+interval '300 seconds'),
 CHECK(mode='OPEN' OR clap+star+wave=0)
);
ALTER SEQUENCE engine_audience_recovery OWNED BY engine_event_audience.checked_order;
CREATE INDEX event_audience_recovery ON engine_event_audience(checked_order) WHERE mode='OPEN';
CREATE TABLE engine_event_audience_rates (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 window_started_at timestamptz NOT NULL,last_at timestamptz NOT NULL,
 accepted_count smallint NOT NULL CHECK(accepted_count BETWEEN 1 AND 5)
);
CREATE TABLE engine_event_audience_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 event_id uuid NOT NULL,room_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('send','control')),mode text CHECK(mode IN ('OPEN','MUTED','DISABLED')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),version integer NOT NULL CHECK(version>=0),window_started_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id),FOREIGN KEY(event_id,room_id) REFERENCES engine_event_audience(event_id,room_id) ON DELETE CASCADE,
 CHECK((operation='control')=(mode IS NOT NULL))
);
CREATE INDEX event_audience_own_mutations ON engine_event_audience_mutations(actor_id,created_at);
