-- Add owned_pet_instance_id to pet_wave_one_owned for instance-level identity.
-- This migration is additive and preserves all existing data.
-- Each owned pet instance gets a unique UUID for cross-system tracking.

BEGIN;

-- Add the new column with a temporary default for existing rows
ALTER TABLE pet_wave_one_owned
  ADD COLUMN owned_pet_instance_id uuid NOT NULL DEFAULT gen_random_uuid();

-- Create a unique index on the instance ID
CREATE UNIQUE INDEX pet_wave_one_owned_instance_id ON pet_wave_one_owned(owned_pet_instance_id);

-- Update foreign keys in related tables to reference the instance ID
-- pet_wave_one_party currently references (account_id, pet_id)
-- We need to add owned_pet_instance_id to party as well for complete tracking
ALTER TABLE pet_wave_one_party
  ADD COLUMN owned_pet_instance_id uuid REFERENCES pet_wave_one_owned(owned_pet_instance_id) ON DELETE CASCADE;

-- Backfill party table
UPDATE pet_wave_one_party p
SET owned_pet_instance_id = o.owned_pet_instance_id
FROM pet_wave_one_owned o
WHERE p.account_id = o.account_id AND p.pet_id = o.pet_id;

-- Make it NOT NULL
ALTER TABLE pet_wave_one_party
  ALTER COLUMN owned_pet_instance_id SET NOT NULL;

-- Add unique constraint to party for instance ID
ALTER TABLE pet_wave_one_party
  ADD CONSTRAINT pet_wave_one_party_account_instance UNIQUE (account_id, owned_pet_instance_id);

COMMIT;
