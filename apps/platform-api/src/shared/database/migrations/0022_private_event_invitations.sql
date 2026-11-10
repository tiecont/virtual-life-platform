CREATE TABLE engine_event_invitations (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 event_id uuid NOT NULL REFERENCES engine_events(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '120 seconds'),
 access_until timestamptz NOT NULL CHECK(access_until>expires_at), CHECK(sender_id<>recipient_id)
);
CREATE UNIQUE INDEX event_one_active_invitation ON engine_event_invitations(event_id,recipient_id) WHERE phase IN ('PENDING','ACCEPTED');
CREATE INDEX event_own_invites ON engine_event_invitations(recipient_id,creation_order DESC);
CREATE TABLE engine_event_invite_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 invitation_id uuid NOT NULL REFERENCES engine_event_invitations(id) ON DELETE CASCADE,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
