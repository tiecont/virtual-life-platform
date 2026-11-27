-- Add owned_pet_instance_id to pet_wave_one_owned for instance-level identity.
-- This migration is additive and preserves all existing data.
-- Each owned pet instance gets a unique UUID for cross-system tracking.

-- Add the new column as nullable first
ALTER TABLE pet_wave_one_owned
  ADD COLUMN owned_pet_instance_id uuid;

-- Backfill existing rows with deterministic UUIDs based on account_id and pet_id
-- This ensures stable instance identities across migrations and restarts
UPDATE pet_wave_one_owned
SET owned_pet_instance_id = md5(account_id || ':' || pet_id || ':v1')::uuid
WHERE owned_pet_instance_id IS NULL;

-- Disable seat guard trigger before UPDATE (rooms may be LOCKED/STARTED)
ALTER TABLE coop_room_seats DISABLE TRIGGER coop_room_seat_guard;

-- Sync cooperative room seats to the correct instance IDs
UPDATE coop_room_seats crs
SET owned_pet_instance_id = o.owned_pet_instance_id
FROM pet_wave_one_owned o
WHERE crs.account_id = o.account_id AND crs.pet_id = o.pet_id;

-- Re-enable seat guard trigger
ALTER TABLE coop_room_seats ENABLE TRIGGER coop_room_seat_guard;

-- Now make it NOT NULL since all existing rows have been backfilled
ALTER TABLE pet_wave_one_owned
  ALTER COLUMN owned_pet_instance_id SET NOT NULL;

-- Create a unique index on the instance ID
CREATE UNIQUE INDEX pet_wave_one_owned_instance_id ON pet_wave_one_owned(owned_pet_instance_id);

-- Update foreign keys in related tables to reference the instance ID
-- pet_wave_one_party currently references (account_id, pet_id)
-- We need to add owned_pet_instance_id to party as well for complete tracking
ALTER TABLE pet_wave_one_party
  ADD COLUMN owned_pet_instance_id uuid;

-- Backfill party table using ownership records
UPDATE pet_wave_one_party p
SET owned_pet_instance_id = o.owned_pet_instance_id
FROM pet_wave_one_owned o
WHERE p.account_id = o.account_id AND p.pet_id = o.pet_id;

-- Make it NOT NULL after backfill
ALTER TABLE pet_wave_one_party
  ALTER COLUMN owned_pet_instance_id SET NOT NULL;

-- Add foreign key reference
ALTER TABLE pet_wave_one_party
  ADD CONSTRAINT pet_wave_one_party_owned_instance_fk
  FOREIGN KEY (owned_pet_instance_id) REFERENCES pet_wave_one_owned(owned_pet_instance_id) ON DELETE CASCADE;

-- Add unique constraint to party for instance ID
ALTER TABLE pet_wave_one_party
  ADD CONSTRAINT pet_wave_one_party_account_instance UNIQUE (account_id, owned_pet_instance_id);

-- Add trigger to auto-generate owned_pet_instance_id on INSERT if not provided
CREATE OR REPLACE FUNCTION pet_wave_one_owned_ensure_instance_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owned_pet_instance_id IS NULL THEN
    NEW.owned_pet_instance_id := md5(NEW.account_id || ':' || NEW.pet_id || ':v1')::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pet_wave_one_owned_instance_id_bi ON pet_wave_one_owned;
CREATE TRIGGER pet_wave_one_owned_instance_id_bi
  BEFORE INSERT ON pet_wave_one_owned
  FOR EACH ROW EXECUTE FUNCTION pet_wave_one_owned_ensure_instance_id();

-- Add trigger for party table
CREATE OR REPLACE FUNCTION pet_wave_one_party_ensure_instance_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owned_pet_instance_id IS NULL THEN
    NEW.owned_pet_instance_id := md5(NEW.account_id || ':' || NEW.pet_id || ':v1')::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pet_wave_one_party_instance_id_bi ON pet_wave_one_party;
CREATE TRIGGER pet_wave_one_party_instance_id_bi
  BEFORE INSERT ON pet_wave_one_party
  FOR EACH ROW EXECUTE FUNCTION pet_wave_one_party_ensure_instance_id();
