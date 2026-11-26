-- Add owned_pet_instance_id to cooperative room seats and remove species uniqueness.
-- This migration is additive and preserves all existing data.
-- The UNIQUE(room_id, pet_id) constraint is replaced with UNIQUE(room_id, owned_pet_instance_id).
-- Existing rows will have owned_pet_instance_id generated from their pet_id for backward compatibility.

BEGIN;

-- Add the new column with a temporary default for existing rows
ALTER TABLE coop_room_seats
  ADD COLUMN owned_pet_instance_id text CHECK (owned_pet_instance_id IS NULL OR owned_pet_instance_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');

-- Backfill existing rows: generate a deterministic UUID from room_id and pet_id
-- This ensures existing allocations remain valid and recoverable.
UPDATE coop_room_seats
SET owned_pet_instance_id = md5(room_id || ':' || pet_id || ':v1')::uuid
WHERE owned_pet_instance_id IS NULL AND pet_id IS NOT NULL;

-- Make the column NOT NULL for all future inserts
ALTER TABLE coop_room_seats
  ALTER COLUMN owned_pet_instance_id SET NOT NULL;

-- Drop the species-level uniqueness constraint
ALTER TABLE coop_room_seats
  DROP CONSTRAINT IF EXISTS coop_room_seats_room_id_pet_id_key;

-- Add instance-level uniqueness constraint
ALTER TABLE coop_room_seats
  ADD CONSTRAINT coop_room_seats_room_id_owned_pet_instance_id_key UNIQUE (room_id, owned_pet_instance_id);

-- Update the seat guard to validate owned_pet_instance_id
DROP TRIGGER IF EXISTS coop_room_seat_guard ON coop_room_seats;
CREATE FUNCTION coop_room_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room coop_rooms%ROWTYPE;
BEGIN
 SELECT * INTO room FROM coop_rooms WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.room_id ELSE NEW.room_id END;
 -- Account deletion may cascade the room first; that is not a gameplay mutation.
 IF room.id IS NULL THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_OP <> 'DELETE' AND room.status <> 'OPEN' THEN
  RAISE EXCEPTION 'Cooperative room roster is frozen' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' AND room.status IN ('LOCKED','STARTED') THEN
  RAISE EXCEPTION 'Cooperative room roster is frozen' USING ERRCODE = '23514';
 END IF;
 -- Validate owned_pet_instance_id format when provided
 IF TG_OP <> 'DELETE' AND NEW.owned_pet_instance_id IS NOT NULL THEN
  IF NEW.owned_pet_instance_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
   RAISE EXCEPTION 'Invalid owned_pet_instance_id format' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER coop_room_seat_guard BEFORE INSERT OR UPDATE OR DELETE ON coop_room_seats FOR EACH ROW EXECUTE FUNCTION coop_room_seat_guard();

COMMIT;
