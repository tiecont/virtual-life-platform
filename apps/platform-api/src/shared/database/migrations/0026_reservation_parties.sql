ALTER TABLE engine_reservations ADD COLUMN party_open boolean NOT NULL DEFAULT false,
 ADD COLUMN party_epoch uuid, ADD COLUMN party_room_id uuid, ADD COLUMN party_membership_id uuid,
 ADD CONSTRAINT reservation_party_visit CHECK((party_epoch IS NULL AND party_room_id IS NULL AND party_membership_id IS NULL AND NOT party_open) OR (party_epoch IS NOT NULL AND party_room_id IS NOT NULL AND party_membership_id IS NOT NULL));
CREATE TABLE engine_reservation_members (
 reservation_id uuid NOT NULL REFERENCES engine_reservations(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 phase text NOT NULL CHECK(phase IN ('IN','LEFT','REVOKED')),
 epoch uuid NOT NULL, room_id uuid NOT NULL, membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL, changed_at timestamptz NOT NULL CHECK(changed_at>=created_at),
 PRIMARY KEY(reservation_id,account_id)
);
CREATE UNIQUE INDEX reservation_member_one_active ON engine_reservation_members(account_id) WHERE phase='IN';
CREATE INDEX reservation_members_own ON engine_reservation_members(account_id,changed_at DESC);
CREATE TABLE engine_reservation_consent (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0)
);
ALTER TABLE engine_reservation_mutations DROP CONSTRAINT engine_reservation_mutations_operation_check;
ALTER TABLE engine_reservation_mutations ADD CONSTRAINT engine_reservation_mutations_operation_check CHECK(operation IN ('hold','confirm','check-in','cancel','waitlist','leave-waitlist','party-open','party-join','party-leave'));
