ALTER TABLE engine_events ADD COLUMN resource_key text CHECK(resource_key ~ '^[a-z][a-z0-9-]{0,63}$');
CREATE INDEX events_table_windows ON engine_events(world_slug,resource_key,opens_at,ends_at) WHERE resource_key IS NOT NULL;
CREATE TABLE engine_reservations (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('HELD','CONFIRMED','CHECKED_IN','EXPIRED','CANCELLED')),
 party_size integer NOT NULL CHECK(party_size BETWEEN 1 AND 100),
 schedule jsonb NOT NULL CHECK(jsonb_typeof(schedule)='object'),
 world_slug text NOT NULL, resource_key text NOT NULL,
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at), hold_expires_at timestamptz NOT NULL,
 allocation_ends_at timestamptz NOT NULL CHECK(allocation_ends_at>created_at),
 CHECK(hold_expires_at>created_at AND hold_expires_at<=created_at+interval '300 seconds' AND hold_expires_at<allocation_ends_at),
 CHECK(phase<>'HELD' OR changed_at<hold_expires_at)
);
CREATE UNIQUE INDEX reservations_one_slot ON engine_reservations(event_id) WHERE phase IN ('HELD','CONFIRMED','CHECKED_IN');
CREATE INDEX reservations_own ON engine_reservations(account_id,creation_order DESC);
CREATE TABLE engine_reservation_waitlist (
 id uuid PRIMARY KEY, queue_order bigserial UNIQUE NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 party_size integer NOT NULL CHECK(party_size BETWEEN 1 AND 100),
 phase text NOT NULL CHECK(phase IN ('WAITING','CLAIMED','EXPIRED','CANCELLED')),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '300 seconds')
);
CREATE UNIQUE INDEX reservations_one_waiter ON engine_reservation_waitlist(event_id,account_id) WHERE phase='WAITING';
CREATE INDEX reservations_fifo ON engine_reservation_waitlist(event_id,queue_order) WHERE phase='WAITING';
CREATE TABLE engine_reservation_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 reservation_id uuid REFERENCES engine_reservations(id) ON DELETE CASCADE,
 waitlist_id uuid REFERENCES engine_reservation_waitlist(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('hold','confirm','check-in','cancel','waitlist','leave-waitlist')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id), CHECK((reservation_id IS NULL)<>(waitlist_id IS NULL))
);
