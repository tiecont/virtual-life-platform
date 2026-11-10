CREATE TABLE safety_sanctions (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES safety_cases(id) ON DELETE RESTRICT,
  subject_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  issuer_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK(kind IN ('warn','mute','room-eject','world-ban','platform-ban')),
  category text NOT NULL,
  world_slug text,
  room_id uuid,
  effective_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  appeal_until timestamptz NOT NULL,
  CHECK(expires_at>effective_at),
  CHECK((kind='platform-ban' AND world_slug IS NULL) OR (kind<>'platform-ban' AND world_slug IS NOT NULL)),
  CHECK((kind='room-eject' AND room_id IS NOT NULL) OR kind<>'room-eject')
);
CREATE INDEX safety_sanctions_subject ON safety_sanctions(subject_id,expires_at) WHERE revoked_at IS NULL;
CREATE INDEX safety_sanctions_case ON safety_sanctions(case_id);
CREATE TABLE safety_sanction_notes (
  id uuid PRIMARY KEY,
  sanction_id uuid NOT NULL REFERENCES safety_sanctions(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK(purpose IN ('issue','revoke','appeal')),
  key_id text NOT NULL,
  iv bytea NOT NULL CHECK(octet_length(iv)=12),
  tag bytea NOT NULL CHECK(octet_length(tag)=16),
  ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)<=32768),
  expires_at timestamptz NOT NULL
);
CREATE INDEX safety_sanction_notes_expiry ON safety_sanction_notes(expires_at);
CREATE TABLE safety_appeals (
  id uuid PRIMARY KEY,
  sanction_id uuid NOT NULL UNIQUE REFERENCES safety_sanctions(id) ON DELETE RESTRICT,
  subject_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  evidence_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK(status='received')
);
CREATE TABLE safety_sanction_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('issue','revoke','appeal')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE safety_audit_events DROP CONSTRAINT safety_audit_events_action_check;
ALTER TABLE safety_audit_events ADD CHECK(action IN ('report.created','case.assigned','case.viewed','evidence.purged','sanction.issued','sanction.revoked','appeal.received','appeal.viewed'));
ALTER TABLE safety_audit_events DROP CONSTRAINT safety_audit_events_reason_check;
ALTER TABLE safety_audit_events ADD CHECK(reason IN ('submitted','triage','coverage','independent-review','assigned-review','expired','identity-deleted','reviewed-case','independent-reversal','subject-appeal'));
