ALTER TABLE engine_reservations ADD COLUMN party_visibility text NOT NULL DEFAULT 'room' CHECK(party_visibility IN ('room','invited'));
CREATE TABLE engine_reservation_invitations (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 reservation_id uuid NOT NULL REFERENCES engine_reservations(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 expires_at timestamptz NOT NULL,access_until timestamptz NOT NULL,
 CHECK(sender_id<>recipient_id),CHECK(expires_at>created_at AND expires_at<=created_at+interval '120 seconds' AND expires_at<=access_until)
);
CREATE UNIQUE INDEX reservation_invitation_active ON engine_reservation_invitations(reservation_id,recipient_id) WHERE phase IN ('PENDING','ACCEPTED');
CREATE INDEX reservation_invitation_inbox ON engine_reservation_invitations(recipient_id,creation_order DESC);
CREATE TABLE engine_reservation_invite_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 invitation_id uuid NOT NULL REFERENCES engine_reservation_invitations(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('offer','accept','decline','cancel')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
