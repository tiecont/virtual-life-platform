-- The first qualifying Boss receipt preserves its allocation's validated
-- recruitment order even if the room is removed before the regular clear.
ALTER TABLE pet_wave_one_encounters
 ADD COLUMN coop_recruitment_pet_ids text[],
 ADD CONSTRAINT pet_wave_one_boss_recruitment CHECK (
  coop_recruitment_pet_ids IS NULL OR (
   encounter_id = map_id || '-boss' AND cardinality(coop_recruitment_pet_ids) > 0
  )
 );
CREATE TRIGGER pet_wave_one_recruitment_immutable
 BEFORE UPDATE OF coop_recruitment_pet_ids ON pet_wave_one_encounters
 FOR EACH ROW WHEN (OLD.coop_recruitment_pet_ids IS DISTINCT FROM NEW.coop_recruitment_pet_ids)
 EXECUTE FUNCTION gameplay_config_immutable();
