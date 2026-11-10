CREATE TABLE operator_runtime_controls (
 environment text PRIMARY KEY CHECK(environment IN ('development','test','staging','production')),
 revision integer NOT NULL CHECK(revision>0),
 release_hash text NOT NULL CHECK(release_hash ~ '^[a-f0-9]{64}$'),
 maintenance boolean NOT NULL,
 paused jsonb NOT NULL CHECK(jsonb_typeof(paused)='object'),
 changed_at timestamptz NOT NULL
);
CREATE TABLE operator_runtime_audit (
 sequence bigserial PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 environment text NOT NULL,
 fingerprint text NOT NULL,
 action text NOT NULL CHECK(action IN ('maintenance','world','adopt')),
 reason text NOT NULL CHECK(reason IN ('MAINTENANCE_WINDOW','SERVICE_PROTECTION','RECOVERY','RELEASE_RECONCILIATION')),
 before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 previous_hash text NOT NULL,event_hash text NOT NULL UNIQUE
);
CREATE INDEX operator_runtime_audit_time ON operator_runtime_audit(environment,occurred_at);
CREATE TRIGGER operator_runtime_audit_immutable BEFORE UPDATE OR DELETE ON operator_runtime_audit FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER operator_runtime_audit_no_truncate BEFORE TRUNCATE ON operator_runtime_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
