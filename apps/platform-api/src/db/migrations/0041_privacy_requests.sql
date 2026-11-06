CREATE TABLE identity_privacy_requests (
 id uuid PRIMARY KEY,
 account_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
 request_key uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('export','delete')),
 state text NOT NULL CHECK(state IN ('PENDING','APPROVED','DENIED','COMPLETED','CANCELLED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 fingerprint text NOT NULL,
 credential_fingerprint text NOT NULL,
 server_nonce text NOT NULL,
 token_hash text UNIQUE,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 retain_until timestamptz NOT NULL,
 approval_until timestamptz,
 approval_account_version integer,
 receipt_until timestamptz,
 closed_at timestamptz,
 UNIQUE(account_id,request_key),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days'),
 CHECK((token_hash IS NULL)=(closed_at IS NOT NULL))
);
CREATE INDEX identity_privacy_requests_account ON identity_privacy_requests(account_id,created_at DESC);
CREATE INDEX identity_privacy_requests_retention ON identity_privacy_requests(retain_until);
CREATE TABLE identity_privacy_auth (
 bucket text PRIMARY KEY,
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 locked_until timestamptz,
 touched_at timestamptz NOT NULL
);
CREATE TABLE identity_privacy_audit_head (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$')
);
INSERT INTO identity_privacy_audit_head VALUES(true,repeat('0',64));
CREATE TABLE identity_privacy_audit (
 sequence bigserial PRIMARY KEY,
 command_id uuid UNIQUE,
 fingerprint text,
 request_ref text NOT NULL,
 actor text NOT NULL CHECK(actor IN ('owner','operator')),
 operator_subject uuid REFERENCES identity_operator(subject),
 verification_ref uuid,
 action text NOT NULL CHECK(action IN ('create','approve','deny','complete','close')),
 reason text NOT NULL CHECK(reason IN ('OWNER_REQUEST','OWNER_VERIFIED','OWNER_UNVERIFIED','SECURITY_REVIEW','OWNER_AUTHENTICATED')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 retain_until timestamptz NOT NULL,
 previous_hash text NOT NULL,
 event_hash text NOT NULL UNIQUE,
 CHECK(retain_until=occurred_at+interval '30 days')
);
CREATE INDEX identity_privacy_audit_retention ON identity_privacy_audit(retain_until);
CREATE FUNCTION identity_privacy_audit_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.retain_until<=clock_timestamp() THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Retained privacy audit is immutable';
END;
$$;
CREATE TRIGGER identity_privacy_audit_no_edit BEFORE UPDATE OR DELETE ON identity_privacy_audit FOR EACH ROW EXECUTE FUNCTION identity_privacy_audit_retained();
CREATE TRIGGER identity_privacy_audit_no_truncate BEFORE TRUNCATE ON identity_privacy_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_privacy_audit_head_no_delete BEFORE DELETE ON identity_privacy_audit_head FOR EACH ROW EXECUTE FUNCTION identity_operator_immutable();
CREATE TRIGGER identity_privacy_audit_head_no_truncate BEFORE TRUNCATE ON identity_privacy_audit_head FOR EACH STATEMENT EXECUTE FUNCTION identity_operator_immutable();
