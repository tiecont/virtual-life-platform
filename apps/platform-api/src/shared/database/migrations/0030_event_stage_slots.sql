CREATE SEQUENCE engine_stage_recovery;
CREATE TABLE engine_event_stage_consent (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0)
);
CREATE TABLE engine_event_stage_slots (
 id uuid PRIMARY KEY,creation_order bigserial UNIQUE NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 world_slug text NOT NULL,policy_version text NOT NULL,
 epoch uuid NOT NULL,room_id uuid NOT NULL,membership_id uuid NOT NULL,
 consent_revision integer NOT NULL CHECK(consent_revision>=0),
 offered_by uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,host_source jsonb,
 phase text NOT NULL CHECK(phase IN ('QUEUED','OFFERED','ACTIVE','ENDED')),
 version integer NOT NULL CHECK(version>=0),
 created_at timestamptz NOT NULL,changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 queue_expires_at timestamptz NOT NULL CHECK(queue_expires_at>created_at AND queue_expires_at<=created_at+interval '600 seconds'),
 offered_at timestamptz,offer_expires_at timestamptz,started_at timestamptz,ends_at timestamptz,closed_at timestamptz,
 reason text CHECK(reason IN ('expired','declined','withdrawn','revoked','event-ended','authority-lost')),
 offer_seconds integer NOT NULL CHECK(offer_seconds BETWEEN 1 AND 120),
 slot_seconds integer NOT NULL CHECK(slot_seconds BETWEEN 1 AND 300),authority_until timestamptz NOT NULL,
 checked_order bigint NOT NULL DEFAULT nextval('engine_stage_recovery'),
 CHECK((offered_at IS NULL)=(offer_expires_at IS NULL)),CHECK((started_at IS NULL)=(ends_at IS NULL)),
 CHECK(offered_at IS NULL OR (offered_at>=created_at AND offered_at<=changed_at AND offer_expires_at>offered_at AND offer_expires_at<=queue_expires_at AND offer_expires_at<=offered_at+offer_seconds*interval '1 second')),
 CHECK(started_at IS NULL OR (offered_at IS NOT NULL AND started_at>=offered_at AND started_at<offer_expires_at AND started_at<=changed_at AND ends_at>started_at AND ends_at<=started_at+slot_seconds*interval '1 second' AND ends_at<=authority_until)),
 CHECK((phase='QUEUED' AND offered_at IS NULL AND started_at IS NULL) OR (phase='OFFERED' AND offered_at IS NOT NULL AND started_at IS NULL) OR (phase='ACTIVE' AND started_at IS NOT NULL) OR phase='ENDED'),
 CHECK((phase='ENDED' AND closed_at IS NOT NULL AND reason IS NOT NULL AND closed_at>=coalesce(started_at,offered_at,created_at) AND closed_at<=changed_at) OR (phase<>'ENDED' AND closed_at IS NULL AND reason IS NULL))
);
CREATE UNIQUE INDEX event_stage_one_open_account ON engine_event_stage_slots(account_id) WHERE phase<>'ENDED';
ALTER SEQUENCE engine_stage_recovery OWNED BY engine_event_stage_slots.checked_order;
CREATE UNIQUE INDEX event_stage_one_active_room ON engine_event_stage_slots(room_id) WHERE phase='ACTIVE';
CREATE UNIQUE INDEX event_stage_one_offer_room ON engine_event_stage_slots(room_id) WHERE phase='OFFERED';
CREATE INDEX event_stage_room_fifo ON engine_event_stage_slots(room_id,creation_order) WHERE phase<>'ENDED';
CREATE INDEX event_stage_recovery ON engine_event_stage_slots(checked_order) WHERE phase<>'ENDED';
CREATE TABLE engine_event_stage_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 slot_id uuid REFERENCES engine_event_stage_slots(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('join','offer','accept','withdraw','revoke','stop')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
