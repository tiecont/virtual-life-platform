ALTER TABLE engine_events ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK(version>=0);
ALTER TABLE engine_event_mutations DROP CONSTRAINT engine_event_mutations_operation_check;
ALTER TABLE engine_event_mutations ADD CHECK(operation IN ('schedule','rsvp','withdraw','adjust','cancel','performer-ready'));
CREATE TABLE engine_event_grants (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 world_slug text NOT NULL, event_id uuid REFERENCES engine_events(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('organizer','performer')), expires_at timestamptz NOT NULL,
 CHECK((role='organizer' AND event_id IS NULL) OR (role='performer' AND event_id IS NOT NULL))
);
CREATE UNIQUE INDEX event_organizer_grant ON engine_event_grants(account_id,world_slug) WHERE role='organizer';
CREATE UNIQUE INDEX event_performer_grant ON engine_event_grants(account_id,event_id) WHERE role='performer';
CREATE TABLE engine_event_performer_readiness (
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 ready boolean NOT NULL, changed_at timestamptz NOT NULL, PRIMARY KEY(event_id,account_id)
);
CREATE TABLE engine_event_notices (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind='cancelled'), created_at timestamptz NOT NULL,
 UNIQUE(event_id,account_id,kind)
);
CREATE INDEX event_own_notices ON engine_event_notices(account_id,created_at DESC,id);
