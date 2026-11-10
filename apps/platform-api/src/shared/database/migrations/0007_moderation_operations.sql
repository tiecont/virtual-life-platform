CREATE TABLE safety_incident_controls (
  world_slug text NOT NULL,
  surface text NOT NULL CHECK(surface IN ('world','chat')),
  closed boolean NOT NULL,
  changed_by uuid REFERENCES identity_accounts(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL,
  PRIMARY KEY(world_slug,surface)
);
CREATE TABLE safety_incident_audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  world_slug text NOT NULL,
  surface text NOT NULL CHECK(surface IN ('world','chat')),
  closed boolean NOT NULL,
  actor_digest text NOT NULL CHECK(actor_digest ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK(reason IN ('incident','coverage-loss','reviewed-recovery')),
  created_at timestamptz NOT NULL
);
CREATE TRIGGER safety_incident_no_mutation BEFORE UPDATE OR DELETE ON safety_incident_audit FOR EACH ROW EXECUTE FUNCTION safety_audit_append_only();
CREATE TRIGGER safety_incident_no_truncate BEFORE TRUNCATE ON safety_incident_audit FOR EACH STATEMENT EXECUTE FUNCTION safety_audit_append_only();
CREATE TABLE safety_incident_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  world_slug text NOT NULL,
  surface text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE safety_appeals DROP CONSTRAINT safety_appeals_status_check;
ALTER TABLE safety_appeals ADD CHECK(status IN ('received','upheld','revoked'));
ALTER TABLE safety_appeals ADD COLUMN reviewed_at timestamptz;
ALTER TABLE safety_appeals ADD COLUMN reviewer_id uuid REFERENCES identity_accounts(id) ON DELETE SET NULL;
ALTER TABLE safety_sanction_notes DROP CONSTRAINT safety_sanction_notes_purpose_check;
ALTER TABLE safety_sanction_notes ADD CHECK(purpose IN ('issue','revoke','appeal','review'));
ALTER TABLE safety_sanction_mutations DROP CONSTRAINT safety_sanction_mutations_operation_check;
ALTER TABLE safety_sanction_mutations ADD CHECK(operation IN ('issue','revoke','appeal','review'));
ALTER TABLE safety_audit_events DROP CONSTRAINT safety_audit_events_action_check;
ALTER TABLE safety_audit_events ADD CHECK(action IN ('report.created','case.assigned','case.viewed','evidence.purged','sanction.issued','sanction.revoked','appeal.received','appeal.viewed','appeal.reviewed'));
