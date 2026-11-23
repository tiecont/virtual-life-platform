-- Isolated prelaunch intake. No row creates a game account, session, beta slot,
-- purchase, or public entitlement. Raw email addresses are never stored.
CREATE TABLE prelaunch_campaigns (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z][a-z0-9-]{2,63}$'),
  title text NOT NULL CHECK(char_length(title) BETWEEN 2 AND 120),
  capacity integer NOT NULL DEFAULT 5000 CHECK(capacity BETWEEN 1 AND 5000),
  admissions integer NOT NULL DEFAULT 0 CHECK(admissions BETWEEN 0 AND capacity),
  phase text NOT NULL DEFAULT 'CLOSED' CHECK(phase IN ('OPEN','CLOSED')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  CHECK(opens_at IS NULL OR closes_at IS NULL OR closes_at>opens_at)
);

CREATE TABLE prelaunch_registrations (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES prelaunch_campaigns(id),
  email_hash text NOT NULL CHECK(email_hash ~ '^[a-f0-9]{64}$'),
  email_sealed text NOT NULL CHECK(char_length(email_sealed) BETWEEN 48 AND 2048),
  email_key_id text NOT NULL CHECK(email_key_id ~ '^[a-z0-9-]{1,32}$'),
  management_token_hash text NOT NULL UNIQUE CHECK(management_token_hash ~ '^[a-f0-9]{64}$'),
  management_nonce text NOT NULL CHECK(management_nonce ~ '^[a-f0-9]{64}$'),
  marketing_consent boolean NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONFIRMED','WITHDRAWN','SUPPRESSED')),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),
  created_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  suppressed_at timestamptz,
  UNIQUE(campaign_id,email_hash),
  CHECK((state='PENDING')=(confirmed_at IS NULL AND withdrawn_at IS NULL AND suppressed_at IS NULL) OR state='CONFIRMED' AND confirmed_at IS NOT NULL AND withdrawn_at IS NULL AND suppressed_at IS NULL OR state='WITHDRAWN' AND withdrawn_at IS NOT NULL AND suppressed_at IS NULL OR state='SUPPRESSED' AND suppressed_at IS NOT NULL)
);
CREATE INDEX prelaunch_registrations_campaign_state ON prelaunch_registrations(campaign_id,state,created_at);

CREATE TABLE prelaunch_challenges (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES prelaunch_registrations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  server_nonce text NOT NULL CHECK(server_nonce ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE UNIQUE INDEX prelaunch_challenges_one_live ON prelaunch_challenges(registration_id) WHERE used_at IS NULL;
CREATE INDEX prelaunch_challenges_expiry ON prelaunch_challenges(expires_at);

CREATE TABLE prelaunch_consent_events (
  sequence bigserial PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES prelaunch_registrations(id),
  action text NOT NULL CHECK(action IN ('registration.requested','marketing.opted_in','email.confirmed','registration.withdrawn')),
  occurred_at timestamptz NOT NULL
);
CREATE INDEX prelaunch_consent_events_registration ON prelaunch_consent_events(registration_id,sequence);

CREATE TABLE prelaunch_requests (
  campaign_id uuid NOT NULL REFERENCES prelaunch_campaigns(id),
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('register','resend','withdraw')),
  registration_id uuid REFERENCES prelaunch_registrations(id),
  email_hash text NOT NULL CHECK(email_hash ~ '^[a-f0-9]{64}$'),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  retain_until timestamptz NOT NULL,
  PRIMARY KEY(campaign_id,request_id),
  CHECK((operation='withdraw')=(registration_id IS NOT NULL)),
  CHECK(retain_until=created_at+interval '24 hours')
);
CREATE INDEX prelaunch_requests_retention ON prelaunch_requests(retain_until);

CREATE TABLE prelaunch_rate_limits (
  bucket text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts>0),
  touched_at timestamptz NOT NULL
);
CREATE INDEX prelaunch_rate_limits_touched ON prelaunch_rate_limits(touched_at);

CREATE TABLE prelaunch_suppressions (
  email_hash text PRIMARY KEY CHECK(email_hash ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK(reason IN ('owner_request','complaint','hard_bounce','operator_hold')),
  created_at timestamptz NOT NULL
);

CREATE TABLE prelaunch_outbox (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES prelaunch_registrations(id),
  challenge_id uuid REFERENCES prelaunch_challenges(id),
  kind text NOT NULL CHECK(kind IN ('confirmation','confirmed')),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','FAILED','SUPPRESSED','CANCELED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at timestamptz NOT NULL,
  locked_until timestamptz,
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  CHECK((kind='confirmation')=(challenge_id IS NOT NULL))
);
CREATE INDEX prelaunch_outbox_due ON prelaunch_outbox(state,next_attempt_at,created_at);
CREATE INDEX prelaunch_outbox_registration ON prelaunch_outbox(registration_id,created_at);

CREATE TABLE prelaunch_audit (
  sequence bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES prelaunch_campaigns(id),
  registration_id uuid REFERENCES prelaunch_registrations(id),
  action text NOT NULL CHECK(action IN ('registration.requested','email.confirmed','registration.withdrawn','mail.suppressed')),
  actor text NOT NULL CHECK(actor IN ('system','operator','owner')),
  operator_subject uuid REFERENCES identity_operator(subject),
  after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object' AND octet_length(after_state::text)<=1024),
  occurred_at timestamptz NOT NULL,
  event_hash text NOT NULL UNIQUE CHECK(event_hash ~ '^[a-f0-9]{64}$'),
  CHECK(actor<>'operator' OR operator_subject IS NOT NULL)
);
CREATE INDEX prelaunch_audit_campaign ON prelaunch_audit(campaign_id,sequence DESC);

CREATE FUNCTION prelaunch_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Prelaunch consent/audit is immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER prelaunch_consent_no_edit BEFORE UPDATE OR DELETE ON prelaunch_consent_events FOR EACH ROW EXECUTE FUNCTION prelaunch_immutable();
CREATE TRIGGER prelaunch_consent_no_truncate BEFORE TRUNCATE ON prelaunch_consent_events FOR EACH STATEMENT EXECUTE FUNCTION prelaunch_immutable();
CREATE TRIGGER prelaunch_audit_no_edit BEFORE UPDATE OR DELETE ON prelaunch_audit FOR EACH ROW EXECUTE FUNCTION prelaunch_immutable();
CREATE TRIGGER prelaunch_audit_no_truncate BEFORE TRUNCATE ON prelaunch_audit FOR EACH STATEMENT EXECUTE FUNCTION prelaunch_immutable();

CREATE FUNCTION prelaunch_campaign_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.capacity<>OLD.capacity OR NEW.admissions<OLD.admissions THEN
    RAISE EXCEPTION 'Prelaunch campaign capacity is lifetime-monotonic' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prelaunch_campaign_monotonic BEFORE UPDATE ON prelaunch_campaigns FOR EACH ROW EXECUTE FUNCTION prelaunch_campaign_monotonic();

CREATE FUNCTION prelaunch_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.campaign_id<>OLD.campaign_id OR NEW.email_hash<>OLD.email_hash OR NEW.email_sealed<>OLD.email_sealed OR NEW.email_key_id<>OLD.email_key_id OR NEW.management_token_hash<>OLD.management_token_hash OR NEW.management_nonce<>OLD.management_nonce OR NEW.marketing_consent<>OLD.marketing_consent OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Prelaunch registration identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT (
    OLD.state=NEW.state OR
    OLD.state='PENDING' AND NEW.state IN ('CONFIRMED','WITHDRAWN','SUPPRESSED') OR
    OLD.state='CONFIRMED' AND NEW.state IN ('WITHDRAWN','SUPPRESSED')
  ) THEN
    RAISE EXCEPTION 'Invalid prelaunch registration transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prelaunch_registration_guard BEFORE UPDATE ON prelaunch_registrations FOR EACH ROW EXECUTE FUNCTION prelaunch_registration_guard();

REVOKE ALL ON prelaunch_campaigns,prelaunch_registrations,prelaunch_challenges,
 prelaunch_consent_events,prelaunch_requests,prelaunch_rate_limits,
 prelaunch_suppressions,prelaunch_outbox,prelaunch_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE prelaunch_consent_events_sequence_seq,prelaunch_audit_sequence_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION prelaunch_immutable(),prelaunch_campaign_monotonic(),prelaunch_registration_guard() FROM PUBLIC;
