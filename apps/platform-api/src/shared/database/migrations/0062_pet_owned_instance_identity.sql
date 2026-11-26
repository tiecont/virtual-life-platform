-- Allocate durable identifiers while retaining legacy account/species keys.
ALTER TABLE pet_wave_one_owned
 ADD COLUMN owned_pet_instance_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD CONSTRAINT pet_wave_one_owned_instance_unique UNIQUE (owned_pet_instance_id);

ALTER TABLE coop_room_seats ADD COLUMN owned_pet_instance_id uuid;
-- Migration runs under the journal transaction and holds the table lock.
-- Backfill existing frozen seats without reopening their roster.
ALTER TABLE coop_room_seats DISABLE TRIGGER coop_room_seat_guard;
UPDATE coop_room_seats s
SET owned_pet_instance_id = p.owned_pet_instance_id
FROM pet_wave_one_owned p
WHERE p.account_id = s.account_id AND p.pet_id = s.pet_id;
ALTER TABLE coop_room_seats ENABLE TRIGGER coop_room_seat_guard;
ALTER TABLE coop_room_seats
 DROP CONSTRAINT coop_room_seats_room_id_pet_id_key,
 ADD CONSTRAINT coop_room_seats_room_instance_unique UNIQUE (room_id, owned_pet_instance_id);

-- Preserve already committed allocation JSON. Recovery resolves instance IDs
-- for historical seats from the backfilled roster.
