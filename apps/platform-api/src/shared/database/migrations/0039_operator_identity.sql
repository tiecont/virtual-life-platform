-- Additive operator identity. No player account/session or safety grant is an operator.
CREATE TABLE identity_operator (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 subject uuid NOT NULL UNIQUE,
 password_salt text NOT NULL,
 password_digest text NOT NULL,
 totp_sealed text NOT NULL,
 totp_counter bigint NOT NULL,
 auth_version integer NOT NULL DEFAULT 1 CHECK(auth_version > 0),
 failures integer NOT NULL DEFAULT 0 CHECK(failures >= 0),
 locked_until timestamptz,
 created_at timestamptz NOT NULL
);
CREATE TABLE identity_operator_sessions (
 token_hash text PRIMARY KEY,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 auth_version integer NOT NULL,
 audience text NOT NULL DEFAULT 'operator' CHECK(audience='operator'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 last_used_at timestamptz NOT NULL,
 step_up_until timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX identity_operator_sessions_subject ON identity_operator_sessions(subject);
CREATE TABLE identity_operator_recovery (
 code_hash text PRIMARY KEY,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 used_at timestamptz
);
CREATE TABLE identity_operator_audit (
 sequence bigserial PRIMARY KEY,
 subject uuid NOT NULL REFERENCES identity_operator(subject),
 action text NOT NULL CHECK(action IN ('bootstrap','login','step-up','logout','revoke-all','recover')),
 outcome text NOT NULL CHECK(outcome IN ('accepted','denied','rate-limited')),
 occurred_at timestamptz NOT NULL,
 before_version integer NOT NULL,
 after_version integer NOT NULL,
 previous_hash text NOT NULL,
 event_hash text NOT NULL UNIQUE
);
CREATE FUNCTION identity_operator_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Operator identity/audit is immutable';
END;
$$;
CREATE TRIGGER identity_operator_no_delete BEFORE DELETE ON identity_operator FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_operator_no_identity_change BEFORE UPDATE OF singleton,subject ON identity_operator FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_operator_no_truncate BEFORE TRUNCATE ON identity_operator FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_operator_audit_no_edit BEFORE UPDATE OR DELETE ON identity_operator_audit FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_operator_audit_no_truncate BEFORE TRUNCATE ON identity_operator_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
