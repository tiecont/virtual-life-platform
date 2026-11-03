CREATE TABLE engine_focus_sessions (
  id uuid PRIMARY KEY,
  creation_order bigserial UNIQUE NOT NULL,
  account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  world_slug text NOT NULL,
  room_id uuid NOT NULL,
  seat_id text NOT NULL,
  source_epoch uuid NOT NULL,
  source_membership_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('active','paused','completed','cancelled')),
  duration_seconds integer NOT NULL CHECK(duration_seconds IN (900,1500,3000)),
  started_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  ends_at timestamptz,
  paused_until timestamptz,
  remaining_ms integer NOT NULL CHECK(remaining_ms>=0 AND remaining_ms<=duration_seconds*1000),
  can_pause boolean NOT NULL,
  pause_budget_ms integer NOT NULL CHECK(pause_budget_ms BETWEEN 0 AND 600000),
  CHECK(changed_at>=started_at),
  CHECK(can_pause OR pause_budget_ms=0),
  CHECK(phase<>'active' OR (ends_at IS NOT NULL AND paused_until IS NULL AND ends_at=changed_at+remaining_ms*interval '1 millisecond')),
  CHECK(phase<>'paused' OR (can_pause AND ends_at IS NULL AND paused_until IS NOT NULL AND paused_until=changed_at+pause_budget_ms*interval '1 millisecond')),
  CHECK(phase<>'completed' OR (remaining_ms=0 AND ends_at IS NOT NULL AND ends_at=changed_at))
);
CREATE UNIQUE INDEX focus_one_running_account ON engine_focus_sessions(account_id) WHERE phase IN ('active','paused');
CREATE INDEX focus_account_history ON engine_focus_sessions(account_id,creation_order DESC);
CREATE INDEX focus_active_deadline ON engine_focus_sessions(ends_at) WHERE phase='active';
CREATE INDEX focus_paused_deadline ON engine_focus_sessions(paused_until) WHERE phase='paused';
CREATE TABLE engine_focus_mutations (
  actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  focus_id uuid NOT NULL REFERENCES engine_focus_sessions(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK(operation IN ('start','pause','resume','finish','cancel')),
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
