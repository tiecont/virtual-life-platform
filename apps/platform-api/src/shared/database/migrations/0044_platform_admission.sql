CREATE TABLE platform_admission_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 hard integer NOT NULL DEFAULT 0 CHECK(hard BETWEEN 0 AND 100000),
 target integer NOT NULL DEFAULT 0 CHECK(target BETWEEN 0 AND hard),
 pending_hard integer CHECK(pending_hard>=0 AND pending_hard<hard AND target<=pending_hard),
 paused boolean NOT NULL DEFAULT true,
 offer_ttl_ms integer NOT NULL DEFAULT 10000 CHECK(offer_ttl_ms BETWEEN 1000 AND 60000),
 grace_ttl_ms integer NOT NULL DEFAULT 30000 CHECK(grace_ttl_ms BETWEEN 1000 AND 120000),
 ticket_ttl_ms integer NOT NULL DEFAULT 900000 CHECK(ticket_ttl_ms BETWEEN 1000 AND 900000),
 max_tickets integer NOT NULL DEFAULT 10000 CHECK(max_tickets BETWEEN 1 AND 10000),
 owner_epoch uuid
);
INSERT INTO platform_admission_policy(singleton) VALUES(true);
CREATE TABLE platform_admission_entries (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 id uuid NOT NULL UNIQUE,
 phase text NOT NULL CHECK(phase IN ('WAITING','RESERVED','ACTIVE','RECONNECT_GRACE')),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),
 queue_order bigserial NOT NULL UNIQUE,
 expires_at timestamptz,
 owner_epoch uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((phase='ACTIVE' AND expires_at IS NULL) OR (phase<>'ACTIVE' AND expires_at IS NOT NULL)),
 CHECK((phase='WAITING' AND owner_epoch IS NULL) OR (phase<>'WAITING' AND owner_epoch IS NOT NULL))
);
CREATE INDEX platform_admission_fifo ON platform_admission_entries(queue_order) WHERE phase='WAITING';
CREATE INDEX platform_admission_expiry ON platform_admission_entries(expires_at,queue_order) WHERE phase<>'ACTIVE';
CREATE TABLE platform_admission_receipts (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('enqueue','offer','claim','leave','disconnect','reconnect')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,request_id)
);
CREATE UNIQUE INDEX platform_admission_offer_request ON platform_admission_receipts(request_id) WHERE action='offer';
CREATE INDEX platform_admission_receipt_time ON platform_admission_receipts(created_at);
CREATE FUNCTION platform_admission_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound integer;
BEGIN
 SELECT hard INTO bound FROM platform_admission_policy WHERE singleton=true FOR UPDATE;
 IF (SELECT count(*) FROM platform_admission_entries WHERE phase<>'WAITING')>bound THEN
  RAISE EXCEPTION 'admission hard bound exceeded';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_admission_entry_guard AFTER INSERT OR UPDATE ON platform_admission_entries FOR EACH ROW EXECUTE FUNCTION platform_admission_capacity_guard();
CREATE TRIGGER platform_admission_policy_guard AFTER UPDATE ON platform_admission_policy FOR EACH ROW EXECUTE FUNCTION platform_admission_capacity_guard();
