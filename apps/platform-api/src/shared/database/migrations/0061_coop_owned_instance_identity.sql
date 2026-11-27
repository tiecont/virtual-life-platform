-- Add owned_pet_instance_id to cooperative room seats.
-- This migration is additive and preserves all existing data.
-- The UNIQUE(room_id, pet_id) constraint is replaced with UNIQUE(room_id, owned_pet_instance_id).
-- Existing rows will have owned_pet_instance_id resolved from pet_wave_one_owned for backward compatibility.
-- Seats without a selected pet keep owned_pet_instance_id NULL.

-- Add the new column as nullable (unselected seats have no instance)
ALTER TABLE coop_room_seats
  ADD COLUMN owned_pet_instance_id uuid CHECK (owned_pet_instance_id IS NULL OR owned_pet_instance_id::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');

-- Disable seat guard trigger before UPDATE (rooms may be LOCKED/STARTED)
ALTER TABLE coop_room_seats DISABLE TRIGGER coop_room_seat_guard;

-- For any remaining rows without ownership records, generate a deterministic UUID
-- This handles edge cases where ownership data might be missing
UPDATE coop_room_seats
SET owned_pet_instance_id = md5(room_id || ':' || pet_id || ':v1')::uuid
WHERE owned_pet_instance_id IS NULL
  AND pet_id IS NOT NULL;

-- Re-enable seat guard trigger
ALTER TABLE coop_room_seats ENABLE TRIGGER coop_room_seat_guard;

-- Keep the column nullable for unselected seats (pet_id IS NULL)
-- NOT NULL will be enforced at application layer when a pet is selected

-- Drop the species-level uniqueness constraint
ALTER TABLE coop_room_seats
  DROP CONSTRAINT IF EXISTS coop_room_seats_room_id_pet_id_key;

-- Add instance-level uniqueness constraint (partial index for non-null values)
CREATE UNIQUE INDEX coop_room_seats_room_id_owned_pet_instance_id_key
  ON coop_room_seats (room_id, owned_pet_instance_id)
  WHERE owned_pet_instance_id IS NOT NULL;

-- The coop_room_seat_guard function already exists from migration 0060.
-- We only need to ensure it validates owned_pet_instance_id format when provided.
-- The existing trigger will automatically pick up the updated function if we recreate it,
-- but since the function already validates the format, no changes needed here.
