ALTER TABLE identity_accounts ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'));
ALTER TABLE identity_accounts ADD COLUMN control_version integer NOT NULL DEFAULT 0 CHECK(control_version>=0);
ALTER TABLE identity_sessions DROP CONSTRAINT identity_sessions_revoked_reason_check;
ALTER TABLE identity_sessions ADD CONSTRAINT identity_sessions_revoked_reason_check CHECK(revoked_reason IN ('rotate','logout','upgrade','login','operator'));
-- No target foreign key or raw account/profile/contact/session/body data in the audit.
-- Account references and request fingerprints use a domain-separated operator HMAC.
CREATE TABLE identity_account_control_audit (
 sequence bigserial PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 account_ref text NOT NULL,
 fingerprint text NOT NULL,
 action text NOT NULL CHECK(action IN ('suspend','resume','revoke')),
 reason text NOT NULL CHECK(reason IN ('SECURITY_REVIEW','OWNER_REQUEST','ABUSE_PREVENTION','CORRECTION')),
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 previous_hash text NOT NULL,
 event_hash text NOT NULL UNIQUE
);
CREATE INDEX identity_account_control_audit_target ON identity_account_control_audit(account_ref,sequence DESC);
CREATE TRIGGER identity_account_control_audit_no_edit BEFORE UPDATE OR DELETE ON identity_account_control_audit FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_account_control_audit_no_truncate BEFORE TRUNCATE ON identity_account_control_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
