CREATE SEQUENCE engine_event_recovery_sequence;
CREATE TABLE engine_events (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 organizer_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 world_slug text NOT NULL, world_version text NOT NULL, policy_version text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 audience text NOT NULL CHECK(audience='silent'), visibility text NOT NULL CHECK(visibility IN ('listed','private')),
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 100),
 time_zone text NOT NULL, opens_at timestamptz NOT NULL, starts_at timestamptz NOT NULL, check_in_closes_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 phase text NOT NULL CHECK(phase IN ('SCHEDULED','OPEN','LIVE','ENDED','CANCELLED')),
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 checked_order bigint NOT NULL DEFAULT 0,
 CHECK(created_at<opens_at AND opens_at<=starts_at AND starts_at<check_in_closes_at AND check_in_closes_at<=ends_at AND ends_at-opens_at<=interval '24 hours'),
 CHECK((phase='ENDED' AND changed_at>=ends_at) OR (phase<>'ENDED' AND changed_at<ends_at)),
 CHECK(phase<>'SCHEDULED' OR changed_at<opens_at), CHECK(phase<>'OPEN' OR (changed_at>=opens_at AND changed_at<starts_at)), CHECK(phase<>'LIVE' OR changed_at>=starts_at)
);
CREATE INDEX events_world_schedule ON engine_events(world_slug,starts_at,id);
CREATE INDEX events_recovery ON engine_events(checked_order,creation_order) WHERE phase NOT IN ('ENDED','CANCELLED');
CREATE TABLE engine_event_rsvps (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('CONFIRMED','CANCELLED','EXPIRED')),
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 UNIQUE(event_id,account_id)
);
CREATE INDEX events_own_rsvps ON engine_event_rsvps(account_id,created_at DESC);
CREATE TABLE engine_event_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('schedule','rsvp','withdraw')), fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL, PRIMARY KEY(actor_id,request_id)
);
