-- Wave C2 arena8 encounter completion is additive to the existing campaign
-- clear table. A map's Water gate requires both its regular and boss encounter;
-- the legacy campaign clear remains accepted as a completed-pair compatibility
-- signal.
CREATE TABLE pet_wave_one_encounters (
 account_id uuid NOT NULL REFERENCES pet_wave_one_players(account_id) ON DELETE CASCADE,
 map_id text NOT NULL CHECK (map_id ~ '^[a-z][a-z0-9-]{2,63}$'),
 encounter_id text NOT NULL CHECK (encounter_id ~ '^[a-z][a-z0-9-]{2,63}-(regular|boss)$'),
 cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,map_id,encounter_id)
);
REVOKE ALL ON pet_wave_one_encounters FROM PUBLIC;
