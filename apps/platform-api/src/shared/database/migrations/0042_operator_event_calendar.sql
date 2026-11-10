CREATE TABLE engine_event_drafts (
 id uuid PRIMARY KEY,
 organizer_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 state text NOT NULL CHECK(state IN ('DRAFT','PUBLISHED','CANCELLED')),
 version integer NOT NULL CHECK(version>0),
 event_id uuid UNIQUE REFERENCES engine_events(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL,
 changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 retain_until timestamptz NOT NULL
);
CREATE INDEX event_draft_retention ON engine_event_drafts(retain_until);
CREATE TABLE engine_event_operator_audit (
 sequence bigserial PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 draft_ref text NOT NULL,
 fingerprint text NOT NULL,
 action text NOT NULL CHECK(action IN ('save','publish','cancel')),
 reason text NOT NULL CHECK(reason IN ('SCHEDULE_PLANNING','CORRECTION','SCHEDULE_CONFIRMED','OPERATOR_CANCELLATION')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 previous_hash text NOT NULL,
 event_hash text NOT NULL UNIQUE
);
CREATE INDEX event_operator_audit_reference ON engine_event_operator_audit(draft_ref,sequence DESC);
CREATE TRIGGER event_operator_audit_immutable BEFORE UPDATE OR DELETE ON engine_event_operator_audit FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER event_operator_audit_no_truncate BEFORE TRUNCATE ON engine_event_operator_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
