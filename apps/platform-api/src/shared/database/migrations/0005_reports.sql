-- Additive local safety storage. No staff is provisioned by this migration.
CREATE TABLE safety_staff_grants (
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  world_slug text NOT NULL CHECK(world_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  role text NOT NULL CHECK(role IN ('moderator','safety-admin')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(account_id,world_slug)
);
CREATE TABLE safety_cases (
  id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL UNIQUE,
  reporter_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  world_slug text NOT NULL,
  category text NOT NULL CHECK(category IN ('harassment','hate','threats','sexual-content','child-safety','privacy','impersonation','spam','media-rights','staff-abuse','consent-violation','self-harm')),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open')),
  assigned_to uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(reporter_id,request_id),
  CHECK(reporter_id IS NULL OR subject_id IS NULL OR reporter_id<>subject_id)
);
CREATE INDEX safety_cases_assignment ON safety_cases(assigned_to,id);
CREATE INDEX safety_cases_subject ON safety_cases(subject_id);
CREATE INDEX safety_cases_created ON safety_cases(created_at);
CREATE TABLE safety_case_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE safety_report_evidence (
  case_id uuid PRIMARY KEY REFERENCES safety_cases(id) ON DELETE RESTRICT,
  key_id text NOT NULL,
  iv bytea NOT NULL CHECK(octet_length(iv)=12),
  tag bytea NOT NULL CHECK(octet_length(tag)=16),
  ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)<=32768),
  expires_at timestamptz NOT NULL
);
CREATE INDEX safety_evidence_expiry ON safety_report_evidence(expires_at);
CREATE TABLE safety_audit_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  case_id uuid NOT NULL,
  actor_digest text NOT NULL CHECK(actor_digest ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK(action IN ('report.created','case.assigned','case.viewed','evidence.purged')),
  reason text NOT NULL CHECK(reason IN ('submitted','triage','coverage','independent-review','assigned-review','expired','identity-deleted')),
  created_at timestamptz NOT NULL
);
CREATE INDEX safety_audit_case ON safety_audit_events(case_id,sequence);
CREATE FUNCTION safety_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Safety audit is append only' USING ERRCODE='55000'; END;
$$;
CREATE TRIGGER safety_audit_no_mutation BEFORE UPDATE OR DELETE ON safety_audit_events FOR EACH ROW EXECUTE FUNCTION safety_audit_append_only();
CREATE TRIGGER safety_audit_no_truncate BEFORE TRUNCATE ON safety_audit_events FOR EACH STATEMENT EXECUTE FUNCTION safety_audit_append_only();
